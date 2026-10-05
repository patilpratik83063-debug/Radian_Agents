"""Markdown export and the (ephemeral) AI visibility tracker routes."""

from __future__ import annotations

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app import visibility
from app.exports import report_to_markdown
from app.schemas import Report
from app.store import Row, Store, get_store

router = APIRouter(prefix="/api")
Db = Annotated[Store, Depends(get_store)]
_bg: set[asyncio.Task[Any]] = set()


# ---------------- export ----------------

@router.get("/audits/{audit_id}/export.md", response_class=PlainTextResponse)
async def export_markdown(audit_id: str, db: Db) -> PlainTextResponse:
    audit = await db.get_audit(audit_id)
    if audit is None or not audit.get("report"):
        raise HTTPException(status_code=404, detail="Report not found")
    md = report_to_markdown(Report.model_validate(audit["report"]))
    return PlainTextResponse(md, media_type="text/markdown",
                             headers={"Content-Disposition": f'attachment; filename="audit-{audit_id[:8]}.md"'})


# ---------------- visibility tracker ----------------

class PromptCreate(BaseModel):
    prompt: str = Field(min_length=3, max_length=500)
    brand: str = Field(min_length=1, max_length=120)
    competitors: list[str] = Field(default_factory=list, max_length=10)
    engines: list[str] = Field(default_factory=lambda: ["ai_simulation"])


@router.get("/visibility/engines")
async def list_engines() -> list[dict[str, Any]]:
    return [
        {"key": e.key, "label": e.label, "source": e.source, "description": e.description,
         "available": visibility.engine_available(e.key)}
        for e in visibility.ENGINES.values()
    ]


@router.post("/visibility/prompts", status_code=201)
async def create_prompt(body: PromptCreate, db: Db) -> Row:
    engines = [e for e in body.engines if e in visibility.ENGINES]
    if not engines:
        raise HTTPException(status_code=422, detail="Choose at least one data source.")
    unavailable = [e for e in engines if not visibility.engine_available(e)]
    if unavailable:
        raise HTTPException(status_code=422, detail="That data source isn't available right now.")
    comps = [c.strip() for c in body.competitors if c.strip()]
    return await db.insert("vis_prompts", {
        "prompt": body.prompt.strip(), "brand": body.brand.strip(), "competitors": comps, "engines": engines,
    })


@router.get("/visibility/prompts")
async def list_prompts(db: Db) -> list[Row]:
    prompts = await db.select("vis_prompts", order="created_at.desc")
    out: list[Row] = []
    for p in prompts:
        runs = await db.select("vis_runs", prompt_id=f"eq.{p['id']}", order="created_at.desc", limit="60")
        p["run_count"] = len(runs)
        p["last_run_at"] = runs[0]["created_at"] if runs else None
        p["sov"] = visibility.share_of_voice(p, runs)
        out.append(p)
    return out


@router.delete("/visibility/prompts/{prompt_id}", status_code=204)
async def delete_prompt(prompt_id: int, db: Db) -> None:
    await db.delete("vis_prompts", {"id": f"eq.{prompt_id}"})


@router.post("/visibility/prompts/{prompt_id}/run", status_code=202)
async def run_prompt_now(prompt_id: int, db: Db) -> dict[str, str]:
    if not await db.select("vis_prompts", id=f"eq.{prompt_id}"):
        raise HTTPException(status_code=404, detail="Prompt not found")
    task = asyncio.create_task(visibility.run_prompt(prompt_id))
    _bg.add(task)
    task.add_done_callback(_bg.discard)
    return {"status": "started"}


@router.get("/visibility/prompts/{prompt_id}/runs")
async def prompt_runs(prompt_id: int, db: Db) -> list[Row]:
    return await db.select("vis_runs", prompt_id=f"eq.{prompt_id}", order="created_at.desc", limit="100")
