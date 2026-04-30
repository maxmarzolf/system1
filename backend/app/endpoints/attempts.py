from fastapi import APIRouter

from app.models import AttemptCreate, SkillMapNode, SkillMapOverviewResponse
from app.core import attempts as attempts_service

router = APIRouter(prefix="/api", tags=["attempts"])


@router.post("/attempts", status_code=201)
async def create_attempt(body: AttemptCreate):
    return await attempts_service.create_attempt(body)


@router.get("/skill-map", response_model=list[SkillMapNode])
async def get_skill_map():
    return await attempts_service.get_skill_map()


@router.get("/skill-map-overview", response_model=SkillMapOverviewResponse)
async def get_skill_map_overview():
    return await attempts_service.get_skill_map_overview()
