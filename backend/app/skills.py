"""run_skill(): execute one claude-seo specialist agent against shared evidence using DeepSeek."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any
from urllib.parse import urlsplit

from pydantic import ValidationError

from app import engine, llm
from app.agents import AgentSpec
from app.evidence import Evidence
from app.schemas import AgentOutput, AuditType

log = logging.getLogger(__name__)
Emit = Callable[[str, str], None]
MAX_TOOL_CALLS = 6

PREAMBLE = """You are one specialist in an SEO / AI-search audit swarm. The instructions below are the
official claude-seo agent and skill definitions for your specialty.

ENVIRONMENT DIFFERENCES (these override anything below that conflicts):
- You cannot run Bash or read the filesystem. The deterministic evidence has ALREADY been collected by the
  engine scripts and is given to you. Where the instructions say to run
  `"${CLAUDE_PLUGIN_ROOT}/scripts/claude-seo" run <script>.py ...`, call the `run_script` tool with that script
  name and its arguments instead, only if the supplied evidence is insufficient.
- Use `read_reference` to open reference files listed under REFERENCES when you need their detail.
- Do not write files, generate PDFs, or spawn sub-agents. Report findings only.
- Never invent data. Every finding must rest on evidence you were given or a tool result you received.
  If a check could not be performed, say so in the summary and do not score it as passed or failed.

OUTPUT: reply with ONE JSON object and nothing else:
{
  "score": <integer 0-100 for your specialty, per the scoring guidance in your instructions>,
  "summary": "<2-3 sentence assessment>",
  "what_works": ["<specific things done well>"],
  "findings": [{
    "title": "<short>",
    "severity": "Critical|High|Medium|Low|Info",
    "description": "<what is wrong or notable>",
    "evidence": "<the exact observation from the supplied data: quote values, URLs, header names>",
    "recommendation": "<specific fix>",
    "impact": "Low|Medium|High",
    "effort": "Low|Medium|High",
    "fix_snippet": {"language": "json-ld|html|text|robots|json", "code": "<ready-to-paste fix>", "note": ""} or null
  }]
}
Severity: Critical = blocks indexing or causes penalties; High = significantly impacts rankings; Medium =
optimisation opportunity; Low = backlog; Info = neutral observation. Only include a fix_snippet when you can
write a complete, correct one from the evidence (JSON-LD, meta tags, robots.txt lines). Keep findings
concrete and deduplicated; at most 12.
Write findings for a non-technical reader: never mention script names, file names, tool names, internal check ids
or AI/vendor/service names. Describe what was observed in plain language.
PLAIN ENGLISH: write at about a 7th-grade reading level with short sentences and everyday words. Avoid jargon and
acronyms; if a technical term is unavoidable, explain it in a few words. Finding titles are short and plain (for
example "Your home page has no description"). "description" explains why it matters in one or two simple sentences.
"recommendation" says what to do in one or two simple sentences."""

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "run_script",
            "description": "Run a claude-seo engine script. For URL scripts the first argument is the URL "
            "(must be on the audited host). Allowed: " + ", ".join(sorted(engine.ALLOWED_SCRIPTS)),
            "parameters": {
                "type": "object",
                "properties": {
                    "script": {"type": "string", "enum": sorted(engine.URL_SCRIPTS)},
                    "args": {"type": "array", "items": {"type": "string"}, "description": "argv, URL first"},
                },
                "required": ["script", "args"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_reference",
            "description": "Read a claude-seo reference markdown file by file name.",
            "parameters": {
                "type": "object",
                "properties": {"filename": {"type": "string"}},
                "required": ["filename"],
            },
        },
    },
]


@dataclass
class SkillResult:
    output: AgentOutput
    tool_calls: int


def build_system_prompt(spec: AgentSpec) -> str:
    parts = [PREAMBLE]
    if spec.agent_file:
        parts.append(f"=== AGENT DEFINITION: {spec.agent_file} ===\n{engine.load_agent_prompt(spec.agent_file)}")
    if spec.skill:
        parts.append(f"=== SKILL: {spec.skill} ===\n{engine.load_skill(spec.skill)}")
    refs = engine.list_references(spec.skill or "seo")
    if refs:
        parts.append("=== REFERENCES (read_reference) ===\n" + "\n".join(refs))
    return "\n\n".join(parts)


def _same_host(a: str, b: str) -> bool:
    def norm(u: str) -> str:
        host = (urlsplit(u).hostname or "").lower()
        return host.removeprefix("www.")

    return norm(a) == norm(b)


def build_user_prompt(spec: AgentSpec, ev: Evidence, audit_type: AuditType) -> str:
    sections = "\n\n".join(ev.section(k) for k in spec.evidence)
    return (
        f"Audit target: {ev.url}\nAudit type: {audit_type}\nToday: {date.today().isoformat()}\n"
        f"Your specialty: {spec.label} - {spec.blurb}\n\n=== COLLECTED EVIDENCE ===\n{sections}\n\n"
        "Produce your JSON assessment now (you may call tools first if essential)."
    )


async def run_skill(spec: AgentSpec, ev: Evidence, audit_type: AuditType, emit: Emit) -> SkillResult:
    """Run one specialist: system prompt from the engine, evidence in, validated AgentOutput out."""
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": build_system_prompt(spec)},
        {"role": "user", "content": build_user_prompt(spec, ev, audit_type)},
    ]
    calls = 0

    async def handler(name: str, args: dict[str, Any]) -> str:
        nonlocal calls
        calls += 1
        if calls > MAX_TOOL_CALLS:
            return "ERROR: tool-call budget exhausted; produce your final JSON now"
        if name == "read_reference":
            return engine.read_reference(spec.skill or "seo", str(args.get("filename", "")))
        if name == "run_script":
            script = str(args.get("script", ""))
            argv = [str(a) for a in args.get("args", [])]
            if script in engine.URL_SCRIPTS and argv and not _same_host(argv[0], ev.url):
                return "ERROR: tools may only target the audited host"
            result = await engine.run_script(script, argv)
            return result.for_llm()
        return f"ERROR: unknown tool {name}"

    def on_tool(name: str, args: dict[str, Any]) -> None:
        emit("info", "Running an extra check" if name == "run_script" else "Consulting the reference guide")

    final_text: str | None = None
    try:
        messages, final_text = await llm.run_tool_loop(messages, TOOLS, handler, max_turns=3, on_tool=on_tool)
    except Exception as exc:
        # Some models reject tool schemas; the evidence is already in the prompt, so continue without tools.
        log.info("tool loop unavailable (%s); continuing from collected evidence", type(exc).__name__)

    if final_text:  # the model answered directly: accept it if it is valid, else ask again below
        try:
            return SkillResult(AgentOutput.model_validate(llm.parse_json_object(final_text)), calls)
        except (llm.LLMOutputError, ValidationError):
            messages = [*messages, {"role": "assistant", "content": final_text[:4000]}]
    messages.append({"role": "user", "content": "Now output the final JSON object only."})
    last: Exception | None = None
    for _ in range(2):
        raw = await llm.chat_json(messages, max_tokens=6000)
        try:
            return SkillResult(AgentOutput.model_validate(raw), calls)
        except ValidationError as exc:
            last = exc
            messages += [
                {"role": "assistant", "content": json.dumps(raw)[:4000]},
                {"role": "user", "content": f"Schema errors: {exc.errors()[:3]}. Reply with corrected JSON only."},
            ]
    raise llm.LLMOutputError(f"{spec.key}: output failed validation: {last}")
