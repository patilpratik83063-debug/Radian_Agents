"""Registry of the specialist agents and which audit types run which of them.

Each agent's system prompt comes straight from the engine: ``agents/<agent>.md`` plus
``skills/<skill>/SKILL.md``. Nothing here re-implements audit logic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.schemas import AuditType


@dataclass(frozen=True)
class AgentSpec:
    key: str
    label: str
    blurb: str
    skill: str | None
    agent_file: str | None
    group: Literal["seo", "ai"]
    weight: float
    evidence: tuple[str, ...]


# Weights follow claude-seo's seo-audit scoring table (Technical 22 split across technical+sitemap).
# Within a group they are renormalised over the agents that actually ran.
AGENTS: dict[str, AgentSpec] = {
    "technical": AgentSpec(
        "technical", "Site health", "Can search engines reach and understand your site?",
        "seo-technical", "seo-technical", "seo", 14, ("page", "parse", "sitemap"),
    ),
    "sitemap": AgentSpec(
        "sitemap", "Sitemap", "Does your site give search engines a map of its pages?",
        "seo-sitemap", "seo-sitemap", "seo", 8, ("sitemap",),
    ),
    "content": AgentSpec(
        "content", "Content quality", "Is your writing helpful, trustworthy and clear?",
        "seo-content", "seo-content", "seo", 23, ("page", "parse", "content_quality"),
    ),
    "onpage": AgentSpec(
        "onpage", "Titles & headings", "Page titles, descriptions, headings and links",
        "seo-page", None, "seo", 20, ("page", "parse"),
    ),
    "schema": AgentSpec(
        "schema", "Search listing data", "Hidden details that help search engines show richer results",
        "seo-schema", "seo-schema", "seo", 10, ("page", "parse"),
    ),
    "performance": AgentSpec(
        "performance", "Page speed", "How fast the page loads and feels",
        None, "seo-performance", "seo", 10, ("pagespeed", "page"),
    ),
    "images": AgentSpec(
        "images", "Images", "Image descriptions, sizes and loading",
        "seo-images", None, "seo", 5, ("parse",),
    ),
    "geo": AgentSpec(
        "geo", "AI search visibility", "Can AI tools find, understand and quote your site?",
        "seo-geo", "seo-geo", "ai", 60, ("page", "parse", "agentic"),
    ),
    "agentic": AgentSpec(
        "agentic", "AI assistant access", "Can AI assistants and bots read and use your site?",
        "seo-agentic", "seo-agentic", "ai", 40, ("agentic", "page"),
    ),
    "local": AgentSpec(
        "local", "Local search", "Business details that help local customers find you",
        "seo-local", "seo-local", "seo", 10, ("page", "parse"),
    ),
    "sxo": AgentSpec(
        "sxo", "Visitor match", "Does the page give people what they searched for?",
        "seo-sxo", "seo-sxo", "seo", 0, ("page", "parse"),
    ),
}

AUDIT_AGENTS: dict[AuditType, tuple[str, ...]] = {
    "full": ("technical", "sitemap", "content", "onpage", "schema", "performance", "images", "geo", "agentic", "sxo"),
    "page": ("technical", "content", "onpage", "schema", "images"),
    "geo": ("geo", "agentic"),
    "schema": ("schema",),
    "technical": ("technical", "sitemap", "performance"),
    "local": ("local", "schema", "onpage"),
}

LOCAL_SIGNALS = ("localbusiness", "tel:", "opening hours", "openinghours", "serving ", "service area", "google.com/maps")


def agents_for(audit_type: AuditType, *, local_detected: bool) -> list[AgentSpec]:
    keys = list(AUDIT_AGENTS[audit_type])
    if audit_type == "full" and local_detected:
        keys.append("local")
    return [AGENTS[k] for k in keys]


def detect_local(html: str, text: str) -> bool:
    """Cheap, deterministic local-business detection from the fetched page."""
    haystack = (html[:200_000] + " " + text[:50_000]).lower()
    return sum(1 for sig in LOCAL_SIGNALS if sig in haystack) >= 2
