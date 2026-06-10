from __future__ import annotations

import json
from datetime import datetime, timezone

from app.core.llm import llm_provider_label as _llm_provider_label
from app.domain.llm_resilience import SubmissionFeedbackUnavailableError, coach_llm_http_exception
from app.models import (
    AdaptiveVariationRequest,
    CoachPromptToggleExplanationRequest,
    CoachSessionPlanRequest,
    MultipleChoiceDrillsRequest,
    SequentialVariationRequest,
    SkillMapDrillsRequest,
)
from app.repositories.coach_repository import (
    insert_generated_multiple_choice_question_rows,
    insert_generated_skill_map_card_row,
)
from app.services import history_service
from app.services import drill_generation_service
from app.services import prompt_explanation_service
from app.services import session_service
from app.services import variation_service
from app.services.contracts import (
    MultipleChoiceQuestionPayload,
    SkillMapCardGenerationContext,
    SkillMapDrillPayload,
    SkillMapProgressSummary,
)


async def coach_provider_default():
    from app.core.llm import resolve_llm_provider
    from app.models import CoachProviderDefaultResponse

    configured = resolve_llm_provider("")
    return CoachProviderDefaultResponse(provider=configured)


async def coach_session_plan(body: CoachSessionPlanRequest):
    try:
        return await session_service.coach_session_plan(body)
    except SubmissionFeedbackUnavailableError as error:
        raise coach_llm_http_exception(error, _llm_provider_label(error.provider)) from error


async def coach_prompt_toggle_explanation(body: CoachPromptToggleExplanationRequest):
    return await prompt_explanation_service.coach_prompt_toggle_explanation(body)


async def _persist_skill_map_drills(
    drills: list[SkillMapDrillPayload], llm_used: bool, progress_summary: SkillMapProgressSummary
) -> None:
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    for drill in drills:
        tags = [str(tag) for tag in drill.get("tags", []) if str(tag).strip()]
        pattern_slug = next((tag for tag in tags if tag != "skill-map"), "")
        generation_context: SkillMapCardGenerationContext = {
            "llmUsed": llm_used,
            "historySummary": progress_summary.get("overall", {}),
            "patternProgress": progress_summary.get("patterns", {}).get(pattern_slug, {}),
            "explanation": str(drill.get("explanation", "") or ""),
        }
        await insert_generated_skill_map_card_row(
            card_id=drill["id"],
            question_type=str(drill.get("questionType") or "skill-map"),
            title=drill["title"],
            difficulty=drill["difficulty"],
            prompt=drill["prompt"],
            solution=drill["solution"],
            missing=drill["missing"],
            hint=drill["hint"],
            tags=drill["tags"],
            llm_used=llm_used,
            generation_context_json=json.dumps(generation_context),
            created_at=now,
        )


async def coach_skill_map_drills(body: SkillMapDrillsRequest):
    progress_summary = await history_service.load_skill_map_generation_summary(body)
    return await drill_generation_service.coach_skill_map_drills(
        body,
        progress_summary=progress_summary,
        persist_skill_map_drills=_persist_skill_map_drills,
    )


async def coach_skill_map_drills_stream(body: SkillMapDrillsRequest):
    progress_summary = await history_service.load_skill_map_generation_summary(body)
    return await drill_generation_service.coach_skill_map_drills_stream(
        body,
        progress_summary=progress_summary,
        persist_skill_map_drills=_persist_skill_map_drills,
    )


async def _persist_generated_questions(drills: list[MultipleChoiceQuestionPayload]) -> None:
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)
    await insert_generated_multiple_choice_question_rows(
        questions=drills,
        user_id="0000",
        created_date=now,
        modified_date=now,
    )


async def coach_multiple_choice_drills(body: MultipleChoiceDrillsRequest):
    try:
        return await drill_generation_service.coach_multiple_choice_drills(
            body,
            persist_generated_questions=_persist_generated_questions,
        )
    except SubmissionFeedbackUnavailableError as error:
        raise coach_llm_http_exception(error, _llm_provider_label(error.provider)) from error


async def coach_adaptive_variation(body: AdaptiveVariationRequest):
    try:
        return await variation_service.coach_adaptive_variation(body)
    except SubmissionFeedbackUnavailableError as error:
        raise coach_llm_http_exception(error, _llm_provider_label(error.provider)) from error


async def coach_sequential_variation(body: SequentialVariationRequest):
    try:
        return await variation_service.coach_sequential_variation(body)
    except SubmissionFeedbackUnavailableError as error:
        raise coach_llm_http_exception(error, _llm_provider_label(error.provider)) from error
