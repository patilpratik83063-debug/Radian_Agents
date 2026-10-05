from datetime import UTC, datetime, timedelta
from pathlib import Path

from app import engine
from app.store import Store


async def test_purge_erases_finished_audits_events_and_tracker_data_after_ttl() -> None:
    store = Store()
    await store.create_audit("old", "https://a.com/", "geo")
    await store.add_event("old", "audit_done", {})
    await store.update_audit("old", {"status": "done", "finished_at": (datetime.now(UTC) - timedelta(minutes=90)).isoformat()})
    await store.create_audit("fresh", "https://b.com/", "geo")
    await store.update_audit("fresh", {"status": "done", "finished_at": datetime.now(UTC).isoformat()})
    prompt = await store.insert("vis_prompts", {"prompt": "p", "brand": "b"})
    await store.insert("vis_runs", {"prompt_id": prompt["id"], "engine": "e"})
    store._tables["vis_prompts"][0]["created_at"] = (datetime.now(UTC) - timedelta(minutes=90)).isoformat()

    removed = store.purge(timedelta(minutes=60))

    assert removed == 2
    assert set(store.audits) == {"fresh"}
    assert store.events == []
    assert store._tables["vis_prompts"] == [] and store._tables["vis_runs"] == []


async def test_running_audits_are_not_purged() -> None:
    store = Store()
    await store.create_audit("live", "https://a.com/", "full")
    await store.update_audit("live", {"status": "running"})
    assert store.purge(timedelta(minutes=60)) == 0


def test_engine_scripts_get_a_throwaway_home_not_the_users() -> None:
    env = engine._sandbox_env()
    assert Path(env["HOME"]).name.startswith("radian-scratch-")
    assert env["HOME"] != str(Path.home())
    assert "drift_baseline.py" not in engine.ALLOWED_SCRIPTS  # the drift scripts persist state to disk
