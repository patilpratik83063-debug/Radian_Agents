"""FastAPI entrypoint for Radian Agents."""

from __future__ import annotations

import asyncio
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import routes_extra
from app.api import router
from app.config import get_settings
from app.store import get_store


async def _purge_loop() -> None:
    """Erase anything older than the TTL, once a minute."""
    while True:
        await asyncio.sleep(60)
        get_store().purge(timedelta(minutes=get_settings().ephemeral_ttl_minutes))


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    purger = asyncio.create_task(_purge_loop())
    yield
    purger.cancel()
    get_store().wipe()


if sys.platform == "win32":  # subprocess support for the engine runner
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

app = FastAPI(title="Radian Agents API", version="0.1.0", lifespan=lifespan)
# The browser opens the SSE stream straight to the API (a compressing proxy would buffer it), so allow the web origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(routes_extra.router)
