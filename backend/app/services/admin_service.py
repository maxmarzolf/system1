from __future__ import annotations

from app.config import settings
from app.models import AdminResetPracticeHistoryRequest
from app.repositories.admin_repository import (
    PRACTICE_HISTORY_TABLES,
    count_practice_history_rows,
    truncate_practice_history_tables,
)


class AdminResetPermissionError(ValueError):
    pass


async def reset_practice_history(body: AdminResetPracticeHistoryRequest):
    if body.confirm != settings.admin_reset_token:
        raise AdminResetPermissionError("Confirmation token did not match.")

    before = await count_practice_history_rows()

    await truncate_practice_history_tables()

    after = await count_practice_history_rows()
    return {
        "clearedTables": PRACTICE_HISTORY_TABLES,
        "before": before,
        "after": after,
    }
