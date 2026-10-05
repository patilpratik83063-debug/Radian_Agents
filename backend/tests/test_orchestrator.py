import pytest

from app import llm, orchestrator
from app.agents import agents_for
from app.schemas import AgentOutput, CategoryReport
from app.scoring import group_score
from tests.fakes import FakeLLM, fake_collect


def test_parse_json_object_variants() -> None:
    assert llm.parse_json_object('{"a": 1}') == {"a": 1}
    assert llm.parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    assert llm.parse_json_object('Here you go: {"a": {"b": 2}} done') == {"a": {"b": 2}}
    for bad in ("", "no json", "[1, 2]", '{"a": '):
        with pytest.raises(llm.LLMOutputError):
            llm.parse_json_object(bad)


def test_agent_output_coerces_loose_model_output() -> None:
    out = AgentOutput.model_validate({
        "score": "87.6",
        "findings": [{"title": "t", "severity": "CRITICAL", "impact": "hIgH", "fix_snippet": "  "}],
    })
    assert out.score == 88
    assert out.findings[0].severity == "Critical" and out.findings[0].impact == "High"
    assert out.findings[0].fix_snippet is None


def test_group_score_renormalises_over_completed_agents() -> None:
    def cat(key: str, score: int | None, weight: float, status: str = "done") -> CategoryReport:
        return CategoryReport(key=key, label=key, group="seo", score=score, weight=weight,
                              status=status)  # type: ignore[arg-type]

    cats = [cat("a", 100, 30), cat("b", 50, 10), cat("c", None, 50, "failed")]
    assert group_score(cats, "seo") == 88  # (100*30 + 50*10) / 40
    assert group_score(cats, "ai") is None


def test_audit_types_select_expected_agents() -> None:
    assert [a.key for a in agents_for("geo", local_detected=False)] == ["geo", "agentic"]
    assert "local" not in [a.key for a in agents_for("full", local_detected=False)]
    assert "local" in [a.key for a in agents_for("full", local_detected=True)]
    keys = {a.key for a in agents_for("full", local_detected=False)}
    assert {"technical", "content", "schema", "geo", "agentic", "performance"} <= keys


async def test_full_pipeline_parallel_agents_and_grounded_synthesis(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeLLM(fail_agent="Images")
    monkeypatch.setattr(orchestrator, "collect", fake_collect)
    monkeypatch.setattr(llm, "chat", fake)
    events: list[tuple[str, dict]] = []

    report = await orchestrator.run_audit("https://example.com/", "full", lambda t, p: events.append((t, p)))

    # one failed agent is reported, excluded from scoring, and does not abort the audit
    assert [c.key for c in report.categories if c.status == "failed"] == ["images"]
    assert any("Images check could not be completed" in w for w in report.warnings)
    # deterministic scores: ai = (30*60 + 50*40) / 100; seo = weighted mean of completed seo agents
    assert report.ai_score == 38
    seo = {"technical": (80, 14), "sitemap": (60, 8), "content": (70, 23), "onpage": (90, 20),
           "schema": (50, 10), "performance": (40, 10)}
    assert report.seo_score == round(sum(s * w for s, w in seo.values()) / sum(w for _, w in seo.values()))
    # synthesis: invented refs dropped, unknown dependency ids removed, fix snippet carried over
    ids = {r.id for r in report.recommendations}
    assert "R1" in ids and not any(r.title == "Invented" for r in report.recommendations)
    assert "R2" not in ids  # a dropped id is never recycled for an auto-added recommendation
    r1 = next(r for r in report.recommendations if r.id == "R1")
    assert r1.depends_on == [] and r1.fix_snippet is not None and r1.failure_check
    assert report.top_findings == ["R1"] and report.quick_wins == ["R1"]
    # every High finding is covered by a recommendation even if synthesis skipped it
    covered = {f for r in report.recommendations for f in r.source_findings}
    high = {f.id for c in report.categories for f in c.findings if f.severity == "High"}
    assert high <= covered
    # agents ran concurrently: every agent started before any finished
    statuses = [p["status"] for t, p in events if t == "agent"]
    assert statuses[:10] == ["running"] * 10
    assert fake.calls.count("agent") == 11  # 9 single-call agents + the failing one (tool loop, then no-tools retry) and fake.calls.count("synthesis") == 1
    assert any(t == "scores" for t, _ in events)


async def test_all_agents_failing_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(*_a: object, **_k: object) -> object:
        raise RuntimeError("down")

    monkeypatch.setattr(orchestrator, "collect", fake_collect)
    monkeypatch.setattr(llm, "chat", boom)
    with pytest.raises(RuntimeError, match="could not be completed"):
        await orchestrator.run_audit("https://example.com/", "geo")
