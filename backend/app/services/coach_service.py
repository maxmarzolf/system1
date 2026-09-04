from __future__ import annotations

from app.core.llm import llm_provider_label as _llm_provider_label
from app.domain.llm_resilience import SubmissionFeedbackUnavailableError, coach_llm_http_exception
from app.models import (
    AdaptiveVariationRequest,
    CoachAttemptFeedbackRequest,
    CoachPracticeHistoryRequest,
    CoachPromptToggleExplanationRequest,
    CoachSessionPlanRequest,
    MultipleChoiceDrillsRequest,
    SequentialVariationRequest,
    SkillMapDrillsRequest,
)
from app.services import (
    coach_orchestration_service,
    feedback_service,
    history_service,
)


async def coach_provider_default():
    return await coach_orchestration_service.coach_provider_default()


async def coach_attempt_feedback(body: CoachAttemptFeedbackRequest):
    try:
        return await feedback_service.coach_attempt_feedback(body)
    except SubmissionFeedbackUnavailableError as error:
        raise coach_llm_http_exception(error, _llm_provider_label(error.provider)) from error


async def coach_session_plan(body: CoachSessionPlanRequest):
    return await coach_orchestration_service.coach_session_plan(body)


async def coach_prompt_toggle_explanation(body: CoachPromptToggleExplanationRequest):
    return await coach_orchestration_service.coach_prompt_toggle_explanation(body)


async def coach_practice_history(body: CoachPracticeHistoryRequest):
    return await history_service.coach_practice_history(body)


async def coach_skill_map_drills(body: SkillMapDrillsRequest):
    return await coach_orchestration_service.coach_skill_map_drills(body)


async def coach_skill_map_drills_stream(body: SkillMapDrillsRequest):
    return await coach_orchestration_service.coach_skill_map_drills_stream(body)


async def coach_multiple_choice_drills(body: MultipleChoiceDrillsRequest):
    return await coach_orchestration_service.coach_multiple_choice_drills(body)


async def coach_adaptive_variation(body: AdaptiveVariationRequest):
    return await coach_orchestration_service.coach_adaptive_variation(body)


async def coach_sequential_variation(body: SequentialVariationRequest):
    return await coach_orchestration_service.coach_sequential_variation(body)
