"""The process-wide asyncpg pool. Repositories depend on this module only, never on boot/seed code."""

from __future__ import annotations

import asyncpg

_pool: asyncpg.Pool | None = None


async def open_pool(database_url: str) -> asyncpg.Pool:
    global _pool
    _pool = await asyncpg.create_pool(database_url)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    assert _pool is not None, "Database pool not initialised – call connect() first"
    return _pool
