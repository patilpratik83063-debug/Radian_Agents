"""Test doubles: a scripted stand-in for the DeepSeek chat endpoint and for evidence collection."""

import asyncio
import json
from types import SimpleNamespace
from typing import Any

from app.evidence import Evidence


def fake_evidence(url: str = "https://example.com/") -> Evidence:
    return Evidence(
        url=url,
        page={"url": url, "status_code": 200, "raw_content": "<html><head><title>x</title></head></html>",
              "extracted_text": "hello world", "is_spa": False, "headers": {}},
        parse={"title": "x"}, sitemap={"found": []}, agentic={"checks": []}, pagespeed={"lab_metrics": {}},
        content_quality={"overall_quality": 70},
    )


async def fake_collect(url: str, needed: set[str], emit: Any) -> Evidence:
    emit("ok", "fake evidence")
    return fake_evidence(url)


def message(content: str) -> Any:
    return SimpleNamespace(content=content, tool_calls=None)


AGENT_SCORES = {"Site health": 80, "Sitemap": 60, "Content quality": 70, "Titles & headings": 90, "Search listing data": 50,
                "Page speed": 40, "Images": 100, "AI search visibility": 30, "AI assistant access": 50,
                "Visitor match": 75}


class FakeLLM:
    """Replacement for app.llm.chat. Detects the stage from the prompts."""

    def __init__(self, fail_agent: str | None = None) -> None:
        self.fail_agent = fail_agent
        self.calls: list[str] = []

    async def __call__(self, messages: list[dict[str, Any]], **kwargs: Any) -> Any:
        await asyncio.sleep(0.01)  # a real network call yields to the loop
        system = messages[0]["content"]
        user = messages[1]["content"]
        if "synthesis stage" in system:
            self.calls.append("synthesis")
            payload = json.loads(user)
            ids = [f["id"] for f in payload["findings"]]
            reply = {
                "executive_summary": "Summary", "business_type": "SaaS", "top_findings": ["R1", "R9"],
                "quick_wins": ["R1"],
                "recommendations": [
                    {"id": "R1", "title": "Add meta descriptions", "priority": "high", "impact": "high",
                     "effort": "low", "source_findings": ids[:1], "observation": "obs", "action": "act",
                     "depends_on": ["R9"], "failure_check": "CTR does not move", "leading_indicator": "impressions"},
                    {"id": "R2", "title": "Invented", "priority": "low", "source_findings": ["nope-1"]},
                ],
                "phases": [{"name": "Phase 1", "timeframe": "Week 1", "items": ["R1", "R2"]}],
            }
            return message(json.dumps(reply))
        self.calls.append("agent")
        label = user.split("Your specialty: ")[1].split(" - ")[0]
        if self.fail_agent and label == self.fail_agent:
            raise RuntimeError("boom")
        out = {
            "score": AGENT_SCORES[label], "summary": "ok", "what_works": ["fast"],
            "findings": [
                {"title": "Missing meta description", "severity": "high", "description": "d",
                 "evidence": "no meta description tag", "recommendation": "add one", "impact": "high",
                 "effort": "low", "fix_snippet": {"language": "html", "code": "<meta name=\"description\" content=\"x\">"}},
                {"title": "Neutral note", "severity": "Info"},
            ],
        }
        return message(json.dumps(out))
