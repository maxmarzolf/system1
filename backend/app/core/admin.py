from __future__ import annotations

from fastapi import HTTPException, status

from app.config import settings
from app.models import (
    AdminResetPracticeHistoryRequest,
    AdminResetPracticeHistoryResponse,
)
from app.repositories.admin_repository import (
    PRACTICE_HISTORY_TABLES,
    count_practice_history_rows,
    truncate_practice_history_tables,
)


async def _count_rows() -> dict[str, int]:
    return await count_practice_history_rows()


async def reset_practice_history(body: AdminResetPracticeHistoryRequest):
    if body.confirm != settings.admin_reset_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Confirmation token did not match.",
        )

    before = await _count_rows()

    await truncate_practice_history_tables()

    after = await _count_rows()
    return {
        "clearedTables": PRACTICE_HISTORY_TABLES,
        "before": before,
        "after": after,
    }
