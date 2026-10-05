"""Background audit runner: persists events, fans them out to SSE subscribers."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from app.evidence import PageFetchError
from app.llm import LLMNotConfiguredError
from app.orchestrator import run_audit
from app.schemas import AuditType
from app.security import validate_target
from app.store import get_store

log = logging.getLogger(__name__)
TERMINAL = ("audit_done", "audit_failed")


class EventHub:
    """In-process pub/sub. Events are persisted first, so late subscribers replay from the DB."""

    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue[tuple[int, str, dict[str, Any]]]]] = {}

    def subscribe(self, audit_id: str) -> asyncio.Queue[tuple[int, str, dict[str, Any]]]:
        q: asyncio.Queue[tuple[int, str, dict[str, Any]]] = asyncio.Queue()
        self._subs.setdefault(audit_id, set()).add(q)
        return q

    def unsubscribe(self, audit_id: str, q: asyncio.Queue[tuple[int, str, dict[str, Any]]]) -> None:
        self._subs.get(audit_id, set()).discard(q)

    def publish(self, audit_id: str, event_id: int, etype: str, payload: dict[str, Any]) -> None:
        for q in list(self._subs.get(audit_id, ())):
            q.put_nowait((event_id, etype, payload))


hub = EventHub()
_tasks: dict[str, asyncio.Task[None]] = {}


async def _record(audit_id: str, etype: str, payload: dict[str, Any]) -> None:
    event_id = await get_store().add_event(audit_id, etype, payload)
    hub.publish(audit_id, event_id, etype, payload)


async def create_audit(raw_url: str, audit_type: AuditType) -> str:
    """Validate the URL (SSRF guard), persist a queued audit and start it in the background."""
    url = await validate_target(raw_url)
    audit_id = uuid.uuid4().hex
    await get_store().create_audit(audit_id, url, audit_type)
    task = asyncio.create_task(_execute(audit_id, url, audit_type), name=f"audit-{audit_id}")
    _tasks[audit_id] = task
    task.add_done_callback(lambda _t: _tasks.pop(audit_id, None))
    return audit_id


async def _execute(audit_id: str, url: str, audit_type: AuditType) -> None:
    outq: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()

    def sink(etype: str, payload: dict[str, Any]) -> None:
        outq.put_nowait((etype, payload))

    async def writer() -> None:
        # One sequential writer per audit keeps persisted event ids in emission order.
        while (item := await outq.get()) is not None:
            await _record(audit_id, *item)

    writer_task = asyncio.create_task(writer())

    async def drain() -> None:
        outq.put_nowait(None)
        await writer_task

    await get_store().update_audit(audit_id, {"status": "running"})
    await _record(audit_id, "audit_started", {"url": url, "type": audit_type})
    try:
        report = await run_audit(url, audit_type, sink)
        await drain()
        await get_store().update_audit(audit_id, {
            "status": "done", "seo_score": report.seo_score, "ai_score": report.ai_score,
            "report": report.model_dump(mode="json"), "finished_at": datetime.now(UTC).isoformat(),
        })
        await _record(audit_id, "audit_done", {"seo_score": report.seo_score, "ai_score": report.ai_score})
    except Exception as exc:
        await drain()
        log.warning("audit %s failed: %s", audit_id, exc, exc_info=not isinstance(exc, (PageFetchError, RuntimeError)))
        if isinstance(exc, LLMNotConfiguredError):
            message = "The audit service isn't available right now. Please try again later."
        elif isinstance(exc, (PageFetchError, RuntimeError)):
            message = str(exc)
        else:
            message = "Something went wrong while auditing. Please try again."
        await get_store().update_audit(audit_id, {
            "status": "failed", "error": message, "finished_at": datetime.now(UTC).isoformat(),
        })
        await _record(audit_id, "audit_failed", {"error": message})


async def stream_events(audit_id: str, after_id: int = 0) -> AsyncIterator[tuple[int, str, dict[str, Any]]]:
    """Replay persisted events after ``after_id`` then follow live ones until the audit finishes."""
    q = hub.subscribe(audit_id)
    try:
        last = after_id
        for row in await get_store().list_events(audit_id, after_id):
            last = int(row["id"])
            yield last, row["type"], row["payload"]
            if row["type"] in TERMINAL:
                return
        audit = await get_store().get_audit(audit_id)
        if audit is None or audit["status"] in ("done", "failed"):
            # Finished before we subscribed (resume after the terminal event, or a restart): nothing more is coming.
            for row in await get_store().list_events(audit_id, last):
                yield int(row["id"]), row["type"], row["payload"]
            return
        while True:
            try:
                event_id, etype, payload = await asyncio.wait_for(q.get(), timeout=15)
            except TimeoutError:
                # Nothing live for a while: if the audit already finished (e.g. resume after the terminal
                # event, or a restart), flush anything unseen and stop instead of pinging forever.
                audit = await get_store().get_audit(audit_id)
                if audit is None or audit["status"] in ("done", "failed"):
                    for row in await get_store().list_events(audit_id, last):
                        yield int(row["id"]), row["type"], row["payload"]
                    return
                yield 0, "ping", {}
                continue
            if event_id <= last:
                continue
            last = event_id
            yield event_id, etype, payload
            if etype in TERMINAL:
                return
    finally:
        hub.unsubscribe(audit_id, q)
