from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.models import AttemptCreate, SkillMapNode, SkillMapOverviewResponse
from app.services import submission_service
from app.services.read_models import history, overview
from app.services.evaluation.context import SubmissionContextError
from app.api_schemas import AttemptSubmitResponse, CompetencyTerrainResponse, HistorySubmissionsResponse

router = APIRouter(prefix="/api", tags=["attempts"])


@router.post("/attempts", status_code=201, response_model=AttemptSubmitResponse, response_model_exclude_none=True)
async def create_attempt(body: AttemptCreate):
    try:
        return await submission_service.create_submission(body)
    except SubmissionContextError as error:
        raise HTTPException(status_code=422, detail={"code": error.code, "message": error.message}) from error


@router.get("/skill-map", response_model=list[SkillMapNode])
async def get_skill_map():
    return await overview.get_skill_map()


@router.get("/skill-map-overview", response_model=SkillMapOverviewResponse)
async def get_skill_map_overview(
    historyDays: int = Query(default=42, ge=0, le=3650, description="Daily activity window in days; 0 = all time."),
    tz: str = Query(default="UTC", max_length=64, description="IANA timezone whose calendar days the activity uses."),
):
    return await overview.get_skill_map_overview(history_days=historyDays or None, timezone_name=tz)


@router.get("/history/submissions", response_model=HistorySubmissionsResponse)
async def get_history_submissions(
    day: date | None = Query(default=None, alias="date", description="A calendar day in tz; omit to search the last year."),
    algorithm: list[str] = Query(default=[], max_length=50, description="Algorithm slugs to keep (any of them); repeatable."),
    tz: str = Query(default="UTC", max_length=64, description="IANA timezone the calendar days are in."),
):
    """Submissions counted in the daily work grid, with their stored evaluations: on ``date``, for
    the ``algorithm`` slugs over the last year, or both."""
    return await history.get_history_submissions(day, algorithm, timezone_name=tz)


@router.get("/history/competency", response_model=CompetencyTerrainResponse)
async def get_competency_terrain(
    tz: str = Query(default="UTC", max_length=64, description="IANA timezone whose calendar days the terrain uses."),
):
    """Competency per algorithm per day (average of every scored signal, decayed on days without practice)."""
    return await history.get_competency_terrain(timezone_name=tz)
