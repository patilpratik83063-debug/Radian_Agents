"""Deterministic evidence gathering: run engine scripts once and share the output with every agent."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.agents import AgentSpec
from app.engine import run_script

log = logging.getLogger(__name__)
Emit = Callable[[str, str], None]  # (level, message)

_CAPS = {"page": 14_000, "parse": 14_000, "sitemap": 6_000, "agentic": 16_000, "pagespeed": 12_000, "content_quality": 3_000}
_RENDER_TEXT_CAP = 150_000


class PageFetchError(RuntimeError):
    """The target page could not be fetched; nothing meaningful can be audited."""


@dataclass
class Evidence:
    url: str
    page: dict[str, Any]
    parse: dict[str, Any] | None = None
    sitemap: dict[str, Any] | None = None
    agentic: dict[str, Any] | None = None
    pagespeed: dict[str, Any] | None = None
    content_quality: dict[str, Any] | None = None
    errors: dict[str, str] = field(default_factory=dict)

    @property
    def html(self) -> str:
        return str(self.page.get("raw_content") or self.page.get("content") or "")

    @property
    def text(self) -> str:
        return str(self.page.get("extracted_text") or "")

    def section(self, key: str) -> str:
        """Render one evidence block for an agent prompt, size-capped."""
        cap = _CAPS[key]
        if key == "page":
            slim = {k: v for k, v in self.page.items() if k not in ("content", "raw_content", "extracted_text", "accessibility_tree")}
            body = {"fetch": slim, "head_html": _head(self.html), "visible_text_excerpt": self.text[:6000]}
            data: Any = body
        else:
            data = getattr(self, key)
        if data is None:
            return f"[{key}] unavailable: {self.errors.get(key, 'not collected')}"
        text = json.dumps(data, ensure_ascii=False, indent=1)
        if len(text) > cap:
            text = text[:cap] + f"\n...[truncated {len(text) - cap} chars]"
        return f"[{key}]\n{text}"


def _head(html: str) -> str:
    low = html.lower()
    end = low.find("</head>")
    return html[: end + 7 if end != -1 else 6000][:6000]


def needed_evidence(specs: list[AgentSpec]) -> set[str]:
    return {key for spec in specs for key in spec.evidence}


async def _json_script(script: str, args: list[str], emit: Emit, label: str, *, stdin: str | None = None) -> tuple[dict[str, Any] | None, str | None]:
    emit("info", label)
    try:
        res = await run_script(script, args, stdin=stdin)
    except Exception as exc:
        log.warning("%s refused: %s", script, exc)
        emit("warn", f"{label}: skipped")
        return None, str(exc)
    data = res.json()
    if isinstance(data, dict) and not data.get("error"):
        return data, None
    err = (data.get("error") if isinstance(data, dict) else None) or res.stderr.strip()[-300:] or "no JSON output"
    log.warning("%s failed: %s", script, err)
    emit("warn", f"{label}: unavailable")
    return None, str(err)


async def collect(url: str, needed: set[str], emit: Emit) -> Evidence:
    """Render the page, then gather the other deterministic evidence in parallel."""
    page, err = await _json_script(
        "render_page.py",
        [url, "--mode", "auto", "--json", "--max-text", str(_RENDER_TEXT_CAP)],
        emit, "Loading the page like a visitor's browser",
    )
    if page is None or not (page.get("raw_content") or page.get("content")):
        log.warning("fetch failed for %s: %s", url, err or (page and page.get("error")))
        raise PageFetchError("We couldn't load that page. Check the address and make sure the site is public and online.")
    status = page.get("status_code")
    if isinstance(status, int) and status >= 400:
        raise PageFetchError(f"The site answered with an error (HTTP {status}), so there was nothing to audit.")
    final_url = str(page.get("url") or url)
    ev = Evidence(url=final_url, page=page)
    emit("ok", f"Page loaded ({'built with JavaScript' if page.get('is_spa') else 'server-rendered'})")

    async def parse() -> None:
        ev.parse, e = await _json_script("parse_html.py", ["--json", "--url", final_url], emit, "Reading the page structure", stdin=ev.html)
        if e:
            ev.errors["parse"] = e

    async def sitemap() -> None:
        ev.sitemap, e = await _json_script("sitemap_discovery.py", [final_url, "--json"], emit, "Looking for sitemaps")
        if e:
            ev.errors["sitemap"] = e

    async def agentic() -> None:
        ev.agentic, e = await _json_script("agentic_check.py", [final_url, "--json"], emit, "Checking access for AI crawlers and agents")
        if e:
            ev.errors["agentic"] = e

    async def pagespeed() -> None:
        ev.pagespeed, e = await _json_script("pagespeed_check.py", [final_url, "--json"], emit, "Measuring page speed")
        if e:
            ev.errors["pagespeed"] = e

    async def quality() -> None:
        if not ev.text:
            ev.errors["content_quality"] = "no extracted text"
            return
        ev.content_quality, e = await _json_script("content_quality.py", ["--json", "--threshold", "0"], emit, "Scoring content quality", stdin=ev.text)
        if e:
            ev.errors["content_quality"] = e

    jobs = {"parse": parse, "sitemap": sitemap, "agentic": agentic, "pagespeed": pagespeed, "content_quality": quality}
    await asyncio.gather(*(fn() for key, fn in jobs.items() if key in needed))
    return ev
