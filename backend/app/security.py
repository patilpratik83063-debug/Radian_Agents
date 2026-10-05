"""SSRF validation (delegates to claude-seo's url_safety) and audit rate limiting."""

from __future__ import annotations

import asyncio
import sys
import time
from collections import deque
from types import ModuleType
from urllib.parse import urlsplit, urlunsplit

from app.config import get_settings


def _load_url_safety() -> ModuleType:
    scripts = str(get_settings().engine_dir / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    import url_safety

    module: ModuleType = url_safety
    return module


class TargetRejectedError(ValueError):
    """The submitted URL is not a safe, public http(s) target."""


def normalize_url(raw: str) -> str:
    """Add a scheme if missing and strip fragments. Does not touch the network."""
    raw = raw.strip()
    if not raw:
        raise TargetRejectedError("URL is empty")
    if "://" not in raw:
        raw = "https://" + raw
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError as exc:
        raise TargetRejectedError(f"Malformed URL: {exc}") from exc
    if parts.scheme not in ("http", "https"):
        raise TargetRejectedError("Only http and https URLs are allowed")
    if not parts.hostname:
        raise TargetRejectedError("URL has no hostname")
    if parts.username or parts.password:
        raise TargetRejectedError("URLs with embedded credentials are not allowed")
    host = parts.hostname.lower()
    netloc = f"[{host}]" if ":" in host else host
    if port:
        netloc += f":{port}"
    return urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))


def validate_target_sync(raw: str) -> str:
    """Normalize, then run the engine's strict validation (DNS resolved, every A record public)."""
    url = normalize_url(raw)
    mod = _load_url_safety()
    try:
        normalized, _pinned = mod.validate_url_strict(url)
    except mod.URLSafetyError as exc:
        raise TargetRejectedError("That address can't be audited. Enter a public website URL.") from exc
    return str(normalized)


async def validate_target(raw: str) -> str:
    return await asyncio.to_thread(validate_target_sync, raw)


class RateLimiter:
    """Sliding-window limiter keyed by an arbitrary string (client id)."""

    def __init__(self, limit: int, window_seconds: float = 3600.0) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str, now: float | None = None) -> float | None:
        """Record a hit. Returns None if allowed, else seconds until the next slot."""
        now = time.monotonic() if now is None else now
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return self.window - (now - hits[0])
        hits.append(now)
        return None
