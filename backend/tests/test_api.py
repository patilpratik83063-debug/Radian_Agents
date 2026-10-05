import time
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import config, jobs, llm, orchestrator
from app.security import TargetRejectedError, normalize_url
from app.store import Store, set_store
from tests.fakes import FakeLLM, fake_collect


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("AUDIT_RATE_LIMIT_PER_HOUR", "3")
    config.get_settings.cache_clear()
    from app import api

    api._limiter = None
    set_store(Store())
    monkeypatch.setattr(orchestrator, "collect", fake_collect)
    monkeypatch.setattr(llm, "chat", FakeLLM())

    async def validate(raw: str) -> str:
        if "127.0.0.1" in raw:
            raise TargetRejectedError("private address")
        return normalize_url(raw)

    monkeypatch.setattr(jobs, "validate_target", validate)
    from app.main import app

    with TestClient(app) as c:
        yield c
    config.get_settings.cache_clear()
    set_store(None)


def test_audit_lifecycle_sse_and_discard(client: TestClient) -> None:
    created = client.post("/api/audits", json={"url": "example.com", "type": "geo"})
    assert created.status_code == 202
    audit_id = created.json()["id"]

    # TestClient buffers streamed bodies, so wait for the run to finish and then replay the persisted stream.
    for _ in range(100):
        if client.get(f"/api/audits/{audit_id}").json()["status"] in ("done", "failed"):
            break
        time.sleep(0.1)
    # SSE: replays from the start and ends with the terminal event
    with client.stream("GET", f"/api/audits/{audit_id}/events") as resp:
        assert resp.headers["content-type"].startswith("text/event-stream")
        body = "".join(resp.iter_text())
    names = [line.split(": ", 1)[1] for line in body.splitlines() if line.startswith("event: ")]
    assert names[0] == "audit_started" and names[-1] == "audit_done"
    assert {"plan", "agent", "progress", "scores", "log"} <= set(names)
    ids = [int(line.split(": ", 1)[1]) for line in body.splitlines() if line.startswith("id: ")]
    assert ids == sorted(ids)

    detail = client.get(f"/api/audits/{audit_id}").json()
    assert detail["status"] == "done" and detail["ai_score"] == 38 and "site_id" not in detail
    assert detail["report"]["recommendations"][0]["failure_check"]

    # resuming after the last id yields nothing new but terminates cleanly
    with client.stream("GET", f"/api/audits/{audit_id}/events", headers={"Last-Event-ID": str(ids[-1])}) as resp:
        assert "event: audit_start" not in "".join(resp.iter_text())

    # discarding erases the report and its events immediately
    assert client.delete(f"/api/audits/{audit_id}").status_code == 204
    assert client.get(f"/api/audits/{audit_id}").status_code == 404
    assert client.delete(f"/api/audits/{audit_id}").status_code == 404
    assert client.get("/api/audits/missing").status_code == 404


def test_rejects_private_targets_and_rate_limits(client: TestClient) -> None:
    bad = client.post("/api/audits", json={"url": "http://127.0.0.1/"})
    assert bad.status_code == 422 and "private" in bad.json()["detail"]
    assert client.post("/api/audits", json={"url": "a.com", "type": "geo"}).status_code == 202
    assert client.post("/api/audits", json={"url": "b.com", "type": "geo"}).status_code == 202
    limited = client.post("/api/audits", json={"url": "c.com", "type": "geo"})
    assert limited.status_code == 429 and "Retry-After" in limited.headers
