from fastapi import APIRouter

from app.models import (
    AdaptiveVariationRequest,
    AdaptiveVariationResponse,
    CoachAttemptEvaluationRequest,
    CoachAttemptEvaluationResponse,
    CoachAttemptFeedbackRequest,
    CoachAttemptFeedbackResponse,
    CoachPracticeHistoryRequest,
    CoachPracticeHistoryResponse,
    CoachSessionPlanRequest,
    CoachSessionPlanResponse,
    SkillMapDrillsRequest,
    SkillMapDrillsResponse,
)
from app.core import coach as coach_service

router = APIRouter(prefix="/api/coach", tags=["coach"])


@router.post("/evaluate-attempt", response_model=CoachAttemptEvaluationResponse)
async def coach_attempt_evaluation(body: CoachAttemptEvaluationRequest):
    return await coach_service.coach_attempt_evaluation(body)


@router.post("/attempt-feedback", response_model=CoachAttemptFeedbackResponse)
async def coach_attempt_feedback(body: CoachAttemptFeedbackRequest):
    return await coach_service.coach_attempt_feedback(body)


@router.post("/session-plan", response_model=CoachSessionPlanResponse)
async def coach_session_plan(body: CoachSessionPlanRequest):
    return await coach_service.coach_session_plan(body)


@router.post("/history", response_model=CoachPracticeHistoryResponse)
async def coach_practice_history(body: CoachPracticeHistoryRequest):
    return await coach_service.coach_practice_history(body)


@router.post("/skill-map-drills", response_model=SkillMapDrillsResponse)
async def coach_skill_map_drills(body: SkillMapDrillsRequest):
    return await coach_service.coach_skill_map_drills(body)


@router.post("/skill-map-drills-stream")
async def coach_skill_map_drills_stream(body: SkillMapDrillsRequest):
    return await coach_service.coach_skill_map_drills_stream(body)


@router.post("/adaptive-variation", response_model=AdaptiveVariationResponse)
async def coach_adaptive_variation(body: AdaptiveVariationRequest):
    return await coach_service.coach_adaptive_variation(body)
