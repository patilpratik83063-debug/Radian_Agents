"""AI Visibility Tracker.

Two kinds of engine, kept strictly apart in the data model (``source``) and the UI:
- ``measured``: real API output (Bright Data Google SERP). Brand mentions are counted in what Google returned.
- ``simulated``: a DeepSeek answer simulation. It models how an assistant might answer; it is NOT a measurement
  of ChatGPT, Perplexity or any live engine and must never be presented as one.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx

from app import llm
from app.config import get_settings
from app.store import Row, get_store

log = logging.getLogger(__name__)
URL_RE = re.compile(r"https?://[^\s)\]>\"']+")


@dataclass(frozen=True)
class EngineInfo:
    key: str
    label: str
    source: str  # measured | simulated
    description: str


ENGINES: dict[str, EngineInfo] = {
    "ai_simulation": EngineInfo(
        "ai_simulation", "AI answer simulation", "simulated",
        "A modelled answer to your prompt. Simulated: not a measurement of any live AI assistant.",
    ),
    "google_live": EngineInfo(
        "google_live", "Live Google results", "measured",
        "Real search results fetched live from Google.",
    ),
}


def engine_available(key: str) -> bool:
    s = get_settings()
    if key == "ai_simulation":
        return s.llm_configured
    if key == "google_live":
        return bool(s.brightdata_api_key and s.brightdata_zone)
    return False


def count_mentions(text: str, names: list[str]) -> dict[str, int]:
    """Case-insensitive whole-word mention counts for each tracked name."""
    out: dict[str, int] = {}
    for name in names:
        n = name.strip()
        if not n:
            continue
        out[n] = len(re.findall(rf"(?<!\w){re.escape(n)}(?!\w)", text, flags=re.IGNORECASE))
    return out


def extract_urls(text: str) -> list[str]:
    seen: list[str] = []
    for u in URL_RE.findall(text):
        u = u.rstrip(".,;")
        if u not in seen:
            seen.append(u)
    return seen


async def _simulate(prompt: str) -> str:
    msg = await llm.chat(
        [
            {"role": "system", "content": "You are a helpful AI assistant answering a user's question. Recommend "
             "specific brands, products or sources by name where relevant, and include source URLs you would cite."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7, max_tokens=900,
    )
    return str(msg.content or "")


async def _brightdata(prompt: str) -> tuple[str, list[str]]:
    """Real Google SERP via Bright Data. Returns (text corpus of results, result urls)."""
    s = get_settings()
    q = httpx.QueryParams({"q": prompt, "brd_json": "1", "brd_ai_overview": "2", "hl": "en", "gl": "us"})
    last = "no response"
    async with httpx.AsyncClient(timeout=90) as client:
        for attempt in range(3):
            resp = await client.post(
                "https://api.brightdata.com/request",
                headers={"Authorization": f"Bearer {s.brightdata_api_key}"},
                json={"zone": s.brightdata_zone, "url": f"https://www.google.com/search?{q}", "format": "raw"},
            )
            code = resp.headers.get("x-brd-error-code")
            if resp.status_code == 200 and not code:
                try:
                    data = resp.json()
                except ValueError:
                    last = "Bright Data returned non-JSON output"
                    break
                return _flatten_serp(data)
            last = resp.headers.get("x-brd-error") or f"HTTP {resp.status_code}"
            if attempt < 2:  # Bright Data failures are frequently transient (Google redirects, throttling)
                await asyncio.sleep(16 if code == "failed_query_rejected" else 4)
                continue
            break
    raise RuntimeError(f"Bright Data SERP request failed: {last}")


def _flatten_serp(data: dict[str, Any]) -> tuple[str, list[str]]:
    parts: list[str] = []
    urls: list[str] = []
    overview = data.get("ai_overview") or data.get("answer_box") or {}
    if isinstance(overview, dict):
        for key in ("text", "answer", "snippet", "description"):
            if isinstance(overview.get(key), str):
                parts.append(overview[key])
    for item in data.get("organic") or []:
        if not isinstance(item, dict):
            continue
        link = item.get("link") or item.get("url")
        if isinstance(link, str):
            urls.append(link)
        parts.extend(str(item.get(k, "")) for k in ("title", "description", "link", "display_link"))
    if not urls and not parts:
        raise RuntimeError("Bright Data returned no organic results")
    return "\n".join(parts), urls


async def run_engine(prompt_row: Row, engine: str) -> Row:
    """Execute one engine for one tracked prompt and persist the run (errors are stored, not raised)."""
    names = [str(prompt_row["brand"]), *[str(c) for c in prompt_row.get("competitors") or []]]
    info = ENGINES[engine]
    answer, urls, error = "", [], None
    try:
        if engine == "ai_simulation":
            answer = await _simulate(str(prompt_row["prompt"]))
            urls = extract_urls(answer)
        elif engine == "google_live":
            answer, urls = await _brightdata(str(prompt_row["prompt"]))
        else:
            raise RuntimeError(f"unknown engine {engine}")
    except Exception as exc:
        log.warning("visibility engine %s failed: %s", engine, exc)
        error = "This source is unavailable right now. Try again in a moment."
    return await get_store().insert("vis_runs", {
        "prompt_id": prompt_row["id"], "engine": engine, "source": info.source,
        "answer": answer[:20000], "mentions": count_mentions(answer, names) if not error else {},
        "cited_urls": urls[:50], "error": error,
    })


async def run_prompt(prompt_id: int) -> list[Row]:
    rows = await get_store().select("vis_prompts", id=f"eq.{prompt_id}")
    if not rows:
        return []
    prompt = rows[0]
    engines = [e for e in prompt.get("engines") or [] if e in ENGINES]
    return list(await asyncio.gather(*(run_engine(prompt, e) for e in engines)))


def share_of_voice(prompt: Row, runs: list[Row]) -> list[dict[str, Any]]:
    """Per day and per source: tracked brand's share of all tracked-name mentions. Sources are never blended."""
    brand = str(prompt["brand"])
    buckets: dict[tuple[str, str], dict[str, int]] = {}
    for r in runs:
        if r.get("error"):
            continue
        day = str(r["created_at"])[:10]
        agg = buckets.setdefault((day, str(r["source"])), {})
        for name, n in (r.get("mentions") or {}).items():
            agg[name] = agg.get(name, 0) + int(n)
    out = []
    for (day, source), agg in sorted(buckets.items()):
        total = sum(agg.values())
        out.append({
            "date": day, "source": source, "brand_mentions": agg.get(brand, 0), "total_mentions": total,
            "share": round(100 * agg.get(brand, 0) / total, 1) if total else None, "by_name": agg,
        })
    return out


def domain(url: str) -> str:
    return (urlsplit(url).hostname or "").removeprefix("www.")
