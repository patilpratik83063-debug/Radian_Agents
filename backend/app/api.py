"""HTTP routes."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

from app import jobs
from app.config import get_settings
from app.schemas import (
    AuditCreate,
    AuditCreated,
    AuditDetail,
    AuditSummary,
    Report,
)
from app.security import RateLimiter, TargetRejectedError
from app.store import Row, Store, get_store

router = APIRouter(prefix="/api")

_limiter: RateLimiter | None = None
Db = Annotated[Store, Depends(get_store)]


def limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter(get_settings().audit_rate_limit_per_hour)
    return _limiter


@router.get("/health")
async def health() -> dict[str, object]:
    s = get_settings()
    return {
        "status": "ok",
        "llm_configured": s.llm_configured,
        "engine_present": (s.engine_dir / "scripts").is_dir(),
        "ephemeral_ttl_minutes": s.ephemeral_ttl_minutes,
        "demo_mode": s.demo_mode,
    }


def _summary(a: Row) -> AuditSummary:
    return AuditSummary.model_validate({k: a.get(k) for k in AuditSummary.model_fields})


@router.post("/audits", response_model=AuditCreated, status_code=202)
async def create_audit(body: AuditCreate, request: Request) -> AuditCreated:
    wait = limiter().check(request.client.host if request.client else "unknown")
    if wait is not None:
        raise HTTPException(status_code=429, detail=f"Audit rate limit reached. Try again in {int(wait // 60) + 1} min.",
                            headers={"Retry-After": str(int(wait) + 1)})
    try:
        audit_id = await jobs.create_audit(body.url, body.type)
    except TargetRejectedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return AuditCreated(id=audit_id)


@router.get("/audits", response_model=list[AuditSummary])
async def list_audits(db: Db, limit: int = 50) -> list[AuditSummary]:
    return [_summary(a) for a in await db.list_audits(min(limit, 200))]


@router.get("/audits/{audit_id}", response_model=AuditDetail)
async def get_audit(audit_id: str, db: Db) -> AuditDetail:
    audit = await db.get_audit(audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    report = Report.model_validate(audit["report"]) if audit.get("report") else None
    return AuditDetail(**_summary(audit).model_dump(), report=report)


@router.get("/audits/{audit_id}/events")
async def audit_events(
    audit_id: str, db: Db, last_event_id: Annotated[str | None, Header()] = None,
) -> StreamingResponse:
    if await db.get_audit(audit_id) is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    after = int(last_event_id) if last_event_id and last_event_id.isdigit() else 0

    async def gen() -> AsyncIterator[str]:
        async for event_id, etype, payload in jobs.stream_events(audit_id, after):
            if etype == "ping":
                yield ": ping\n\n"
                continue
            yield f"id: {event_id}\nevent: {etype}\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.delete("/audits/{audit_id}", status_code=204)
async def discard_audit(audit_id: str, db: Db) -> None:
    """Erase a report immediately (otherwise it expires on its own)."""
    if not await db.discard_audit(audit_id):
        raise HTTPException(status_code=404, detail="Audit not found")
