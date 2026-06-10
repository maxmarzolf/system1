from __future__ import annotations

from app.models import AdminResetPracticeHistoryRequest


async def reset_practice_history(body: AdminResetPracticeHistoryRequest):
    from app.services import admin_service

    return await admin_service.reset_practice_history(body)
