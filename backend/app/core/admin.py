from __future__ import annotations

from fastapi import HTTPException, status

from app.config import settings
from app.database import get_pool
from app.models import (
    AdminResetPracticeHistoryRequest,
    AdminResetPracticeHistoryResponse,
)

_PRACTICE_HISTORY_TABLES = [
    "coach_feedback_events",
    "score_attempts",
    "generated_skill_map_cards",
]


async def _count_rows() -> dict[str, int]:
    pool = get_pool()
    counts: dict[str, int] = {}
    async with pool.acquire() as conn:
        for table in _PRACTICE_HISTORY_TABLES:
            value = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
            counts[table] = int(value or 0)
    return counts


async def reset_practice_history(body: AdminResetPracticeHistoryRequest):
    if body.confirm != settings.admin_reset_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Confirmation token did not match.",
        )

    pool = get_pool()
    before = await _count_rows()

    async with pool.acquire() as conn:
        await conn.execute(
            "TRUNCATE TABLE coach_feedback_events, score_attempts, generated_skill_map_cards RESTART IDENTITY"
        )

    after = await _count_rows()
    return {
        "clearedTables": _PRACTICE_HISTORY_TABLES,
        "before": before,
        "after": after,
    }
