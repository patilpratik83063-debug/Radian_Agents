"""Ephemeral in-memory storage. Nothing is written to disk or to any database.

Reports, events and tracker runs live only in this process and are erased after
``EPHEMERAL_TTL_MINUTES`` (or immediately when discarded, or when the server stops).
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime, timedelta
from typing import Any

Row = dict[str, Any]


def _parse(ts: Any) -> datetime | None:
    try:
        dt = datetime.fromisoformat(str(ts))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class Store:
    def __init__(self) -> None:
        self.audits: dict[str, Row] = {}
        self.events: list[Row] = []
        self._tables: dict[str, list[Row]] = {}
        self._row_ids = itertools.count(1)
        self._event_ids = itertools.count(1)

    # ---- audits ----
    async def create_audit(self, audit_id: str, url: str, audit_type: str) -> None:
        self.audits[audit_id] = {
            "id": audit_id, "url": url, "type": audit_type, "status": "queued",
            "seo_score": None, "ai_score": None, "report": None, "error": None,
            "created_at": datetime.now(UTC).isoformat(), "finished_at": None,
        }

    async def update_audit(self, audit_id: str, fields: Row) -> None:
        if audit_id in self.audits:
            self.audits[audit_id].update(fields)

    async def get_audit(self, audit_id: str) -> Row | None:
        return self.audits.get(audit_id)

    async def list_audits(self, limit: int) -> list[Row]:
        rows = sorted(self.audits.values(), key=lambda a: str(a["created_at"]), reverse=True)
        return [{k: v for k, v in a.items() if k != "report"} for a in rows[:limit]]

    async def discard_audit(self, audit_id: str) -> bool:
        existed = self.audits.pop(audit_id, None) is not None
        self.events = [e for e in self.events if e["audit_id"] != audit_id]
        return existed

    async def add_event(self, audit_id: str, etype: str, payload: Row) -> int:
        eid = next(self._event_ids)
        self.events.append({"id": eid, "audit_id": audit_id, "type": etype, "payload": payload})
        return eid

    async def list_events(self, audit_id: str, after_id: int) -> list[Row]:
        return [e for e in self.events if e["audit_id"] == audit_id and e["id"] > after_id]

    # ---- generic tables (AI visibility tracker) ----
    def _match(self, row: Row, flt: dict[str, str]) -> bool:
        for col, cond in flt.items():
            if col in ("select", "order", "limit"):
                continue
            op, _, val = cond.partition(".")
            cur = row.get(col)
            ok = {"eq": str(cur) == val, "gt": cur is not None and float(cur) > float(val)}.get(op, True)
            if not ok:
                return False
        return True

    async def select(self, table: str, **params: str) -> list[Row]:
        rows = [dict(r) for r in self._tables.get(table, []) if self._match(r, params)]
        if "order" in params:
            col, _, direction = params["order"].partition(".")
            rows.sort(key=lambda r: str(r.get(col)), reverse=direction == "desc")
        if "limit" in params:
            rows = rows[: int(params["limit"])]
        return rows

    async def insert(self, table: str, row: Row) -> Row:
        new = {"id": next(self._row_ids), "created_at": datetime.now(UTC).isoformat(), **row}
        self._tables.setdefault(table, []).append(new)
        return dict(new)

    async def delete(self, table: str, row_filter: dict[str, str]) -> None:
        self._tables[table] = [r for r in self._tables.get(table, []) if not self._match(r, row_filter)]

    # ---- expiry ----
    def purge(self, ttl: timedelta, now: datetime | None = None) -> int:
        """Erase everything older than ``ttl``. Returns how many top-level items were removed."""
        cutoff = (now or datetime.now(UTC)) - ttl
        stale = [
            aid for aid, a in self.audits.items()
            if (_parse(a["finished_at"] or a["created_at"]) or cutoff) < cutoff
            and (a["status"] in ("done", "failed") or (_parse(a["created_at"]) or cutoff) < cutoff - ttl)
        ]
        for aid in stale:
            self.audits.pop(aid, None)
        if stale:
            gone = set(stale)
            self.events = [e for e in self.events if e["audit_id"] not in gone]
        removed = len(stale)
        old_prompts = {p["id"] for p in self._tables.get("vis_prompts", []) if (_parse(p["created_at"]) or cutoff) < cutoff}
        if old_prompts:
            self._tables["vis_prompts"] = [p for p in self._tables["vis_prompts"] if p["id"] not in old_prompts]
            self._tables["vis_runs"] = [r for r in self._tables.get("vis_runs", []) if r["prompt_id"] not in old_prompts]
            removed += len(old_prompts)
        return removed

    def wipe(self) -> None:
        self.audits.clear()
        self.events.clear()
        self._tables.clear()


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store


def set_store(store: Store | None) -> None:
    global _store
    _store = store
