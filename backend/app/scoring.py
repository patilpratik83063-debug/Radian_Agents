"""Deterministic score aggregation. Scores are computed here, never by the synthesis LLM."""

from __future__ import annotations

from collections.abc import Iterable

from app.schemas import CategoryReport


def group_score(categories: Iterable[CategoryReport], group: str) -> int | None:
    """Weighted mean of agent scores in a group, renormalised over agents that completed."""
    scored = [c for c in categories if c.group == group and c.status == "done" and c.score is not None and c.weight > 0]
    total = sum(c.weight for c in scored)
    if total == 0:
        return None
    return round(sum((c.score or 0) * c.weight for c in scored) / total)
