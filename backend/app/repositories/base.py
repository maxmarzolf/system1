from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from app.database import get_pool


@asynccontextmanager
async def acquire_connection() -> AsyncIterator[Any]:
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn
