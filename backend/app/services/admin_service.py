from __future__ import annotations

from app.models import AdminResetPracticeHistoryRequest


async def reset_practice_history(body: AdminResetPracticeHistoryRequest):
    from app.core import admin as admin_core

    return await admin_core.reset_practice_history(body)
