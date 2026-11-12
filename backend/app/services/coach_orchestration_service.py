from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.core.llm import resolve_llm_provider
from app.core.taxonomy import algorithm_slug_for_tags
from app.models import (
    CoachProviderDefaultResponse,
    CoachSessionPlanRequest,
    MultipleChoiceDrillsRequest,
    SkillMapDrillsRequest,
)
from app.repositories.coach_repository import insert_generated_multiple_choice_question_rows
from app.repositories.unified_catalog_repository import upsert_generated_problem
from app.services import history_service
from app.services import drill_generation_service
from app.services import session_service
from app.services.contracts import (
    MultipleChoiceQuestionPayload,
    SkillMapCardGenerationContext,
    SkillMapDrillPayload,
    SkillMapProgressSummary,
)


async def coach_provider_default():
    configured = resolve_llm_provider("")
    return CoachProviderDefaultResponse(provider=configured)


async def coach_session_plan(body: CoachSessionPlanRequest):
    return await session_service.coach_session_plan(body)


async def _persist_skill_map_drills(
    drills: list[SkillMapDrillPayload], llm_used: bool, progress_summary: SkillMapProgressSummary
) -> None:
    for drill in drills:
        tags = [str(tag) for tag in drill.get("tags", []) if str(tag).strip()]
        pattern_slug = next((tag for tag in tags if tag != "skill-map"), "")
        generation_context: SkillMapCardGenerationContext = {
            "llmUsed": llm_used,
            "historySummary": progress_summary.get("overall", {}),
            "patternProgress": progress_summary.get("patterns", {}).get(pattern_slug, {}),
            "explanation": str(drill.get("explanation", "") or ""),
        }
        await upsert_generated_problem(
            card_id=drill["id"],
            question_type=str(drill.get("questionType") or "skill-map"),
            title=drill["title"],
            difficulty=drill["difficulty"],
            prompt=drill["prompt"],
            solution=drill["solution"],
            missing=drill["missing"],
            hint=drill["hint"],
            tags=drill["tags"],
            generation_context_json=json.dumps(generation_context),
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


async def _persist_generated_questions(
    drills: list[MultipleChoiceQuestionPayload],
    generation_traces: list[list[dict[str, Any]]],
) -> list[MultipleChoiceQuestionPayload | None]:
    stored = await insert_generated_multiple_choice_question_rows(
        questions=drills,
        algorithm_slugs=[algorithm_slug_for_tags(list(drill.get("tags") or [])) or None for drill in drills],
        created_at=datetime.now(tz=timezone.utc),
        generation_traces=generation_traces,
    )
    return [
        {"id": row["id"], "choices": row["choices"], "correctChoiceId": row["correctChoiceId"]} if row else None
        for row in stored
    ]


async def coach_multiple_choice_drills(body: MultipleChoiceDrillsRequest):
    return await drill_generation_service.coach_multiple_choice_drills(
        body,
        persist_generated_questions=_persist_generated_questions,
    )

