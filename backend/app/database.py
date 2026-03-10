from __future__ import annotations

import asyncpg

from app.config import settings

pool: asyncpg.Pool | None = None


async def connect() -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(settings.database_url)
    return pool


async def disconnect() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None


def get_pool() -> asyncpg.Pool:
    assert pool is not None, "Database pool not initialised – call connect() first"
    return pool
