from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.models import (
    AdaptiveVariationRequest,
    AdaptiveVariationResponse,
    CoachAttemptEvaluationRequest,
    CoachAttemptEvaluationResponse,
    CoachAttemptFeedbackRequest,
    CoachAttemptFeedbackResponse,
    CoachPracticeHistoryRequest,
    CoachPracticeHistoryResponse,
    CoachProviderDefaultResponse,
    CoachPromptToggleExplanationRequest,
    CoachPromptToggleExplanationResponse,
    CoachSessionPlanRequest,
    CoachSessionPlanResponse,
    MultipleChoiceDrillsRequest,
    MultipleChoiceDrillsResponse,
    SequentialVariationRequest,
    SequentialVariationResponse,
    SkillMapDrillsRequest,
    SkillMapDrillsResponse,
)
from app.services import coach_service
from app.services import problem_practice_service

router = APIRouter(prefix="/api/coach", tags=["coach"])


@router.get("/provider-default", response_model=CoachProviderDefaultResponse)
async def coach_provider_default():
    return await coach_service.coach_provider_default()


@router.post("/evaluate-attempt", response_model=CoachAttemptEvaluationResponse)
async def coach_attempt_evaluation(body: CoachAttemptEvaluationRequest):
    return await coach_service.coach_attempt_evaluation(body)


@router.post("/attempt-feedback", response_model=CoachAttemptFeedbackResponse)
async def coach_attempt_feedback(body: CoachAttemptFeedbackRequest):
    return await coach_service.coach_attempt_feedback(body)


@router.post("/session-plan", response_model=CoachSessionPlanResponse)
async def coach_session_plan(body: CoachSessionPlanRequest):
    return await coach_service.coach_session_plan(body)


@router.post("/prompt-toggle-explanation", response_model=CoachPromptToggleExplanationResponse)
async def coach_prompt_toggle_explanation(body: CoachPromptToggleExplanationRequest):
    return await coach_service.coach_prompt_toggle_explanation(body)


@router.post("/history", response_model=CoachPracticeHistoryResponse)
async def coach_practice_history(body: CoachPracticeHistoryRequest):
    return await coach_service.coach_practice_history(body)


@router.post("/skill-map-drills", response_model=SkillMapDrillsResponse)
async def coach_skill_map_drills(body: SkillMapDrillsRequest):
    return await coach_service.coach_skill_map_drills(body)


@router.post("/skill-map-drills-stream")
async def coach_skill_map_drills_stream(body: SkillMapDrillsRequest):
    stream = await coach_service.coach_skill_map_drills_stream(body)
    return StreamingResponse(stream, media_type="text/event-stream")


@router.get("/problem-drills", response_model=SkillMapDrillsResponse)
async def coach_random_problem_drills(
    count: int = Query(default=10, ge=1, le=30),
    tag: str | None = Query(default=None),
):
    if tag and tag.strip():
        return await problem_practice_service.problem_drills_for_tag(tag.strip(), count)
    return await problem_practice_service.random_problem_drills(count)


@router.get("/problem-drills/{algorithm_slug}", response_model=SkillMapDrillsResponse)
async def coach_problem_drills(algorithm_slug: str):
    return await problem_practice_service.problem_drills_for_algorithm(algorithm_slug)


@router.get("/problem-drills/technique/{technique_slug}", response_model=SkillMapDrillsResponse)
async def coach_problem_drills_by_technique(technique_slug: str):
    return await problem_practice_service.problem_drills_for_technique(technique_slug)


@router.get("/playlist-drills/{playlist_slug}", response_model=SkillMapDrillsResponse)
async def coach_static_playlist_drills(
    playlist_slug: str,
    order: str = Query(default="curated"),
):
    return await problem_practice_service.static_playlist_drills(playlist_slug, order)


@router.post("/multiple-choice-drills", response_model=MultipleChoiceDrillsResponse)
async def coach_multiple_choice_drills(body: MultipleChoiceDrillsRequest):
    return await coach_service.coach_multiple_choice_drills(body)


@router.post("/adaptive-variation", response_model=AdaptiveVariationResponse)
async def coach_adaptive_variation(body: AdaptiveVariationRequest):
    return await coach_service.coach_adaptive_variation(body)


@router.post("/sequential-variation", response_model=SequentialVariationResponse)
async def coach_sequential_variation(body: SequentialVariationRequest):
    return await coach_service.coach_sequential_variation(body)
