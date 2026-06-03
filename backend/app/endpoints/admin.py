from fastapi import APIRouter

from app.models import (
    AdminResetPracticeHistoryRequest,
    AdminResetPracticeHistoryResponse,
)
from app.services import admin_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/reset-practice-history", response_model=AdminResetPracticeHistoryResponse)
async def reset_practice_history(body: AdminResetPracticeHistoryRequest):
    return await admin_service.reset_practice_history(body)
