"""Audit orchestration: evidence -> parallel specialist agents (asyncio.gather) -> one synthesis call."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError

from app import engine, llm
from app.agents import AgentSpec, agents_for, detect_local
from app.evidence import collect, needed_evidence
from app.schemas import (
    AuditType,
    CategoryReport,
    Finding,
    Phase,
    Recommendation,
    Report,
    SynthesisOutput,
)
from app.scoring import group_score
from app.skills import run_skill

logger = logging.getLogger(__name__)
EVIDENCE_LABELS = {
    "parse": "Page structure analysis", "sitemap": "The sitemap check", "agentic": "The AI-crawler access check",
    "pagespeed": "Live speed measurement", "content_quality": "Content quality scoring",
}
EventSink = Callable[[str, dict[str, Any]], None]  # (event type, payload)

SYNTHESIS_PREAMBLE = """You are the synthesis stage of an SEO / AI-search audit. Specialist agents have produced
findings (each with an id). Following the claude-seo synthesis methodology below, merge them into ONE
prioritized action plan.

Rules:
- Every recommendation MUST list `source_findings` (ids from the input). Do not invent findings or facts.
- Merge duplicate findings from different agents into a single recommendation.
- Each recommendation carries: `observation` (the first-principle observation it rests on, quoting the finding
  evidence), `failure_check` (an explicit "how would we know this failed?" check), `leading_indicator` (a signal
  the user can monitor without re-running the audit), `depends_on` (ids of other recommendations that must come
  first, else []), and `action` (concrete steps, at most 2 sentences). Do NOT output fix_snippet; it is attached
  from the source findings automatically.
- Be compact: at most 20 recommendations (merge related findings aggressively); `observation`, `failure_check`
  and `leading_indicator` are one short sentence each; `title` is at most 10 words and starts with a verb (for example
  "Add a title to your home page"); `executive_summary` is at most 3 short sentences (under 60 words) saying how the
  site is doing and the single most important thing to do. Your whole reply must stay under 6000 tokens.
- priority is Critical|High|Medium|Low (the OUTPUT of validation: consider impact, effort and dependencies).
- Skip Info-severity findings unless they unlock something. Do not output scores; they are computed elsewhere.
- Recommendation ids: "R1", "R2", ... ordered by priority.
- PLAIN ENGLISH: write for a business owner with no SEO knowledge, at about a 7th-grade reading level. Use short
  sentences and everyday words. Avoid jargon and acronyms; if a technical term is unavoidable, explain it in a few
  words (for example "structured data (hidden details search engines read)"). Say "AI search" instead of GEO/AEO,
  "trust signals" instead of E-E-A-T, "page speed" instead of Core Web Vitals.
- Write for a non-technical reader. Never mention script names, file names, tool names, command names, internal
  check ids, or AI/vendor/service names (for example Python files, "run_script", "PageSpeed", "robots.txt tool").
  Describe what was observed in plain language; public web standards such as robots.txt, sitemap.xml and
  JSON-LD may still be named when they are the thing to fix.

OUTPUT one JSON object:
{
  "executive_summary": "<2-3 short sentences, plain English>",
  "business_type": "<detected type: SaaS|Local Service|E-commerce|Publisher|Agency|Other>",
  "top_findings": ["<recommendation id>", ... up to 5],
  "quick_wins": ["<recommendation id with low effort and meaningful impact>", ... up to 5],
  "recommendations": [{"id","title","priority","impact","effort","category","source_findings":[],"observation","action","depends_on":[],"failure_check","leading_indicator"}],
  "phases": [{"name":"Phase 1: Critical Fixes","timeframe":"Week 1","items":["R1"]}, {"name":"Phase 2: High-Impact Improvements","timeframe":"Weeks 2-3","items":[]}, {"name":"Phase 3: Content & Authority","timeframe":"Month 2","items":[]}, {"name":"Phase 4: Monitoring & Iteration","timeframe":"Ongoing","items":[]}]
}"""


def _noop_sink(_type: str, _payload: dict[str, Any]) -> None:
    return None


def _category_from_failure(spec: AgentSpec, error: str, ms: int) -> CategoryReport:
    return CategoryReport(
        key=spec.key, label=spec.label, group=spec.group, score=None, weight=spec.weight,
        status="failed", error=error, duration_ms=ms,
    )


def _compact_findings(categories: list[CategoryReport]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for cat in categories:
        for f in cat.findings:
            if f.severity == "Info":
                continue
            rows.append({
                "id": f.id, "category": cat.key, "severity": f.severity, "title": f.title,
                "description": f.description[:500], "evidence": f.evidence[:500],
                "recommendation": f.recommendation[:500], "impact": f.impact, "effort": f.effort,
                "has_fix_snippet": f.fix_snippet is not None,
            })
    return rows


def build_synthesis_system() -> str:
    framework = (engine.engine_dir() / "skills" / "seo" / "references" / "thinking-framework-validate-act.md").read_text(encoding="utf-8")
    return f"{SYNTHESIS_PREAMBLE}\n\n=== claude-seo orchestrator skill ===\n{engine.load_skill('seo')}\n\n=== VALIDATE / ACT framework ===\n{framework}"


def _finalize_recommendations(synth: SynthesisOutput, categories: list[CategoryReport], warnings: list[str]) -> list[Recommendation]:
    """Keep only recommendations grounded in real findings; carry fix snippets; cover every Critical/High finding."""
    findings = {f.id: f for c in categories for f in c.findings}
    kept: list[Recommendation] = []
    covered: set[str] = set()
    for rec in synth.recommendations:
        refs = [r for r in rec.source_findings if r in findings]
        if not refs:
            logger.info("Dropped recommendation %r: it cited no real finding", rec.id)
            continue
        rec.source_findings = refs
        rec.category = findings[refs[0]].agent
        if rec.fix_snippet is None:
            rec.fix_snippet = next((findings[r].fix_snippet for r in refs if findings[r].fix_snippet), None)
        covered.update(refs)
        kept.append(rec)
    ids = {r.id for r in kept}
    for rec in kept:
        rec.depends_on = [d for d in rec.depends_on if d in ids and d != rec.id]
    # Never recycle an id the synthesis used (even for a dropped item): phases/top lists may still cite it.
    cited = [r.id for r in synth.recommendations] + synth.top_findings + synth.quick_wins
    cited += [i for p in synth.phases for i in p.items] + [d for r in synth.recommendations for d in r.depends_on]
    used = [int(i[1:]) for i in cited if i[:1] == "R" and i[1:].isdigit()]
    n = max([len(kept), *used])
    for f in findings.values():
        if f.severity in ("Critical", "High") and f.id not in covered:
            n += 1
            kept.append(Recommendation(
                id=f"R{n}", title=f.title, priority=f.severity, impact=f.impact, effort=f.effort,
                category=f.agent, source_findings=[f.id], observation=f.evidence, action=f.recommendation,
                fix_snippet=f.fix_snippet,
            ))
            logger.info("Synthesis omitted %s finding %s; added it unmodified", f.severity, f.id)
    return kept


def _clean_phases(phases: list[Phase], rec_ids: set[str]) -> list[Phase]:
    return [Phase(name=p.name, timeframe=p.timeframe, items=[i for i in p.items if i in rec_ids]) for p in phases]


async def synthesize(url: str, categories: list[CategoryReport], warnings: list[str]) -> SynthesisOutput:
    payload = {"url": url, "findings": _compact_findings(categories),
               "agent_summaries": {c.key: c.summary for c in categories if c.status == "done"}}
    messages = [
        {"role": "system", "content": build_synthesis_system()},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    raw = await llm.chat_json(messages, max_tokens=8000)
    try:
        return SynthesisOutput.model_validate(raw)
    except ValidationError as exc:
        messages += [{"role": "assistant", "content": json.dumps(raw)[:6000]},
                     {"role": "user", "content": f"Schema errors: {exc.errors()[:3]}. Reply with corrected JSON only."}]
        return SynthesisOutput.model_validate(await llm.chat_json(messages, max_tokens=8000))


async def run_audit(url: str, audit_type: AuditType, sink: EventSink = _noop_sink) -> Report:
    """Run a complete audit and return the Report. Progress is reported through ``sink``."""
    started = time.monotonic()

    def log(level: str, message: str, agent: str | None = None) -> None:
        sink("log", {"level": level, "message": message, "agent": agent})

    sink("phase", {"phase": "evidence", "label": "Fetching and rendering the page"})
    # Plan with every agent this type could use so evidence covers local detection too.
    candidates = agents_for(audit_type, local_detected=audit_type == "full")
    ev = await collect(url, needed_evidence(candidates), lambda lvl, msg: log(lvl, msg))
    local = detect_local(ev.html, ev.text)
    specs = agents_for(audit_type, local_detected=local)
    if audit_type == "full" and local:
        log("info", "Local business signals found: adding a local check")
    sink("plan", {"agents": [{"key": s.key, "label": s.label, "blurb": s.blurb, "group": s.group} for s in specs]})

    sink("phase", {"phase": "agents", "label": f"Running {len(specs)} specialist agents in parallel"})
    done_count = 0

    async def run_one(spec: AgentSpec) -> CategoryReport:
        nonlocal done_count
        t0 = time.monotonic()
        sink("agent", {"key": spec.key, "status": "running"})
        log("info", f"{spec.label} check started", spec.key)
        try:
            res = await run_skill(spec, ev, audit_type, lambda lvl, msg: log(lvl, msg, spec.key))
        except Exception as exc:
            ms = int((time.monotonic() - t0) * 1000)
            logger.warning("%s agent failed: %s", spec.key, exc)
            log("error", f"{spec.label} check could not be completed", spec.key)
            sink("agent", {"key": spec.key, "status": "failed", "error": "This check could not be completed."})
            done_count += 1
            sink("progress", {"done": done_count, "total": len(specs)})
            return _category_from_failure(spec, "This check could not be completed.", ms)
        ms = int((time.monotonic() - t0) * 1000)
        findings: list[Finding] = []
        for i, f in enumerate(res.output.findings, start=1):
            f.id = f"{spec.key}-{i}"
            f.agent = spec.key
            findings.append(f)
            log("finding", f"[{f.severity}] {f.title}", spec.key)
        cat = CategoryReport(
            key=spec.key, label=spec.label, group=spec.group, score=res.output.score, weight=spec.weight,
            status="done", summary=res.output.summary, what_works=res.output.what_works, findings=findings, duration_ms=ms,
        )
        done_count += 1
        sink("agent", {"key": spec.key, "status": "done", "score": cat.score, "findings": len(findings)})
        sink("progress", {"done": done_count, "total": len(specs)})
        return cat

    categories = list(await asyncio.gather(*(run_one(s) for s in specs)))
    warnings: list[str] = [f"The {c.label} check could not be completed, so it is excluded from the scores." for c in categories if c.status == "failed"]
    if all(c.status == "failed" for c in categories):
        raise RuntimeError("The audit could not be completed. Please try again in a moment.")
    for key, err in ev.errors.items():
        logger.warning("evidence %s unavailable: %s", key, err)
        warnings.append(f"{EVIDENCE_LABELS.get(key, key)} could not be completed, so related checks are less certain.")

    seo_score, ai_score = group_score(categories, "seo"), group_score(categories, "ai")
    sink("scores", {"seo_score": seo_score, "ai_score": ai_score})

    sink("phase", {"phase": "synthesis", "label": "Synthesizing the prioritized action plan"})
    log("info", "Building your prioritised action plan")
    synth = await synthesize(ev.url, categories, warnings)
    recs = _finalize_recommendations(synth, categories, warnings)
    rec_ids = {r.id for r in recs}
    report = Report(
        url=ev.url, audit_type=audit_type, seo_score=seo_score, ai_score=ai_score,
        executive_summary=synth.executive_summary, business_type=synth.business_type,
        top_findings=[i for i in synth.top_findings if i in rec_ids],
        quick_wins=[i for i in synth.quick_wins if i in rec_ids],
        categories=sorted(categories, key=lambda c: [s.key for s in specs].index(c.key)),
        recommendations=recs, phases=_clean_phases(synth.phases, rec_ids),
        warnings=warnings, generated_at=datetime.now(UTC),
    )
    log("ok", f"Audit complete in {time.monotonic() - started:.0f}s")
    return report

