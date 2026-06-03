from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.models import (
    CoachAttemptEvaluationRequest,
    CoachAttemptEvaluationResponse,
    CoachProviderDefaultResponse,
    CoachPromptToggleExplanationRequest,
    CoachPromptToggleExplanationResponse,
    CoachSessionPlanRequest,
    CoachSessionPlanResponse,
    MultipleChoiceDrillsRequest,
    MultipleChoiceDrillsResponse,
    SkillMapDrillsRequest,
    SkillMapDrillsResponse,
)
from app.services import drill_generation_service, prompt_explanation_service, session_service
from app.services import evaluation_service
from app.core.llm import (
    resolve_llm_provider as _resolve_llm_provider,
)
from app.core.generator import (
    _clean_concise_prompt,
    _pattern_slug,
    _template_mode_value,
)


async def _noop_persist_skill_map_drills(
    drills: list[dict[str, Any]], llm_used: bool, progress_summary: dict[str, Any]
) -> None:
    del drills, llm_used, progress_summary


SKILL_MAP_DRILL_GENERATOR = drill_generation_service._make_skill_map_drill_generator(_noop_persist_skill_map_drills)


async def coach_provider_default() -> CoachProviderDefaultResponse:
    configured = _resolve_llm_provider("")
    return CoachProviderDefaultResponse(provider=configured)

async def coach_prompt_toggle_explanation(body: CoachPromptToggleExplanationRequest) -> dict[str, Any]:
    return await prompt_explanation_service.coach_prompt_toggle_explanation(body)


async def coach_attempt_evaluation(body: CoachAttemptEvaluationRequest):
    return await evaluation_service.coach_attempt_evaluation(body)


async def coach_session_plan(body: CoachSessionPlanRequest):
    return await session_service.coach_session_plan(body)


async def coach_skill_map_drills(
    body: SkillMapDrillsRequest,
    progress_summary: dict[str, Any],
    persist_skill_map_drills: Callable[[list[dict[str, Any]], bool, dict[str, Any]], Awaitable[Any]],
):
    return await drill_generation_service.coach_skill_map_drills(
        body=body,
        progress_summary=progress_summary,
        persist_skill_map_drills=persist_skill_map_drills,
    )


async def coach_skill_map_drills_stream(
    body: SkillMapDrillsRequest,
    progress_summary: dict[str, Any],
    persist_skill_map_drills: Callable[[list[dict[str, Any]], bool, dict[str, Any]], Awaitable[Any]],
):
    return await drill_generation_service.coach_skill_map_drills_stream(
        body=body,
        progress_summary=progress_summary,
        persist_skill_map_drills=persist_skill_map_drills,
    )


async def coach_multiple_choice_drills(
    body: MultipleChoiceDrillsRequest,
    persist_generated_questions: Callable[[list[dict[str, Any]]], Awaitable[Any]],
) -> MultipleChoiceDrillsResponse:
    return await drill_generation_service.coach_multiple_choice_drills(
        body=body,
        persist_generated_questions=persist_generated_questions,
    )


