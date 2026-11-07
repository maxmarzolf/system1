from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.models import AttemptCreate, SkillMapNode, SkillMapOverviewResponse
from app.services import attempts_service, submission_service
from app.services.submission_context_service import SubmissionContextError

router = APIRouter(prefix="/api", tags=["attempts"])


@router.post("/attempts", status_code=201)
async def create_attempt(body: AttemptCreate):
    try:
        return await submission_service.create_submission(body)
    except SubmissionContextError as error:
        raise HTTPException(status_code=422, detail={"code": error.code, "message": error.message}) from error


@router.get("/skill-map", response_model=list[SkillMapNode])
async def get_skill_map():
    return await attempts_service.get_skill_map()


@router.get("/skill-map-overview", response_model=SkillMapOverviewResponse)
async def get_skill_map_overview(
    historyDays: int = Query(default=42, ge=0, le=3650, description="Daily activity window in days; 0 = all time."),
    tz: str = Query(default="UTC", max_length=64, description="IANA timezone whose calendar days the activity uses."),
):
    return await attempts_service.get_skill_map_overview(history_days=historyDays or None, timezone_name=tz)


@router.get("/history/day")
async def get_history_day(
    day: date = Query(alias="date"),
    tz: str = Query(default="UTC", max_length=64, description="IANA timezone the calendar day is in."),
):
    """Every submission counted in the daily work grid on ``date`` in ``tz``, with its stored evaluation."""
    return await attempts_service.get_history_day(day, timezone_name=tz)


@router.get("/history/signals")
async def get_signal_history(
    tz: str = Query(default="UTC", max_length=64, description="IANA timezone for each point's calendar date."),
):
    """Every scored signal from every counted submission, all time, for the signal hologram."""
    return await attempts_service.get_signal_history(timezone_name=tz)
