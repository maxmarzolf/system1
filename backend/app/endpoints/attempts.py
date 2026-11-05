from fastapi import APIRouter, HTTPException

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
async def get_skill_map_overview():
    return await attempts_service.get_skill_map_overview()
