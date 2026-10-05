"""Pydantic models: LLM output contracts, report structure and API payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

Severity = Literal["Critical", "High", "Medium", "Low", "Info"]
Level = Literal["Low", "Medium", "High"]
AuditType = Literal["full", "page", "geo", "schema", "technical", "local"]
AuditStatus = Literal["queued", "running", "done", "failed"]
AgentStatus = Literal["idle", "running", "done", "failed", "skipped"]

SEVERITIES: tuple[str, ...] = ("Critical", "High", "Medium", "Low", "Info")


def _title_case_choice(value: Any, choices: tuple[str, ...], default: str) -> str:
    if isinstance(value, str):
        for choice in choices:
            if value.strip().lower() == choice.lower():
                return choice
    return default


class FixSnippet(BaseModel):
    language: str = "text"
    code: str
    note: str = ""


class Finding(BaseModel):
    """One observation from a specialist agent."""

    id: str = ""
    agent: str = ""
    title: str
    severity: Severity = "Info"
    description: str = ""
    evidence: str = ""
    recommendation: str = ""
    impact: Level = "Medium"
    effort: Level = "Medium"
    fix_snippet: FixSnippet | None = None

    @field_validator("severity", mode="before")
    @classmethod
    def _severity(cls, v: Any) -> str:
        return _title_case_choice(v, SEVERITIES, "Info")

    @field_validator("impact", "effort", mode="before")
    @classmethod
    def _level(cls, v: Any) -> str:
        return _title_case_choice(v, ("Low", "Medium", "High"), "Medium")

    @field_validator("fix_snippet", mode="before")
    @classmethod
    def _snippet(cls, v: Any) -> Any:
        if isinstance(v, str):
            return {"language": "text", "code": v} if v.strip() else None
        if isinstance(v, dict) and not str(v.get("code", "")).strip():
            return None
        return v


class AgentOutput(BaseModel):
    """What each specialist agent must return."""

    score: int = Field(ge=0, le=100)
    summary: str = ""
    what_works: list[str] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)

    @field_validator("score", mode="before")
    @classmethod
    def _score(cls, v: Any) -> int:
        try:
            return max(0, min(100, round(float(v))))
        except (TypeError, ValueError) as exc:
            raise ValueError("score must be a number") from exc


class Recommendation(BaseModel):
    """A prioritized, falsifiable action (claude-seo's synthesis contract)."""

    id: str
    title: str
    priority: Severity = "Medium"
    impact: Level = "Medium"
    effort: Level = "Medium"
    category: str = ""
    source_findings: list[str] = Field(default_factory=list)
    observation: str = ""
    action: str = ""
    depends_on: list[str] = Field(default_factory=list)
    failure_check: str = ""
    leading_indicator: str = ""
    fix_snippet: FixSnippet | None = None

    @field_validator("priority", mode="before")
    @classmethod
    def _priority(cls, v: Any) -> str:
        return _title_case_choice(v, SEVERITIES, "Medium")

    @field_validator("impact", "effort", mode="before")
    @classmethod
    def _level(cls, v: Any) -> str:
        return _title_case_choice(v, ("Low", "Medium", "High"), "Medium")

    @field_validator("fix_snippet", mode="before")
    @classmethod
    def _snippet(cls, v: Any) -> Any:
        if isinstance(v, str):
            return {"language": "text", "code": v} if v.strip() else None
        if isinstance(v, dict) and not str(v.get("code", "")).strip():
            return None
        return v


class Phase(BaseModel):
    name: str
    timeframe: str = ""
    items: list[str] = Field(default_factory=list)


class SynthesisOutput(BaseModel):
    executive_summary: str = ""
    business_type: str = ""
    top_findings: list[str] = Field(default_factory=list)
    quick_wins: list[str] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    phases: list[Phase] = Field(default_factory=list)


class CategoryReport(BaseModel):
    key: str
    label: str
    group: Literal["seo", "ai"]
    score: int | None
    weight: float
    status: AgentStatus
    summary: str = ""
    what_works: list[str] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    error: str | None = None
    duration_ms: int | None = None


class Report(BaseModel):
    url: str
    audit_type: AuditType
    seo_score: int | None
    ai_score: int | None
    executive_summary: str
    business_type: str
    top_findings: list[str]
    quick_wins: list[str]
    categories: list[CategoryReport]
    recommendations: list[Recommendation]
    phases: list[Phase]
    warnings: list[str] = Field(default_factory=list)
    generated_at: datetime


# ---- API payloads ----

class AuditCreate(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    type: AuditType = "full"


class AuditCreated(BaseModel):
    id: str


class AuditSummary(BaseModel):
    id: str
    url: str
    type: AuditType
    status: AuditStatus
    seo_score: int | None
    ai_score: int | None
    created_at: datetime
    finished_at: datetime | None
    error: str | None


class AuditDetail(AuditSummary):
    report: Report | None
