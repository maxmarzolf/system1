from __future__ import annotations

import re
from typing import Any

from app.domain.coach_context import summarize_attempt_history, summarize_skill_map_progress
from app.models import CoachAttemptFeedbackRequest, CoachPracticeHistoryRequest, SkillMapDrillsRequest
from app.repositories.coach_repository import fetch_practice_history_entries


def _pattern_slug(pattern: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", str(pattern).strip().lower())
    return cleaned.strip("-")


async def load_feedback_context(body: CoachAttemptFeedbackRequest) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    history = await fetch_practice_history_entries(
        card_id=body.cardId,
        question_type=body.questionType,
        skill_tags=body.skillTags,
        limit=20,
    )
    return history, summarize_attempt_history(history)


async def coach_practice_history(body: CoachPracticeHistoryRequest) -> dict[str, Any]:
    history = await fetch_practice_history_entries(
        card_id=body.cardId,
        question_type=body.questionType,
        skill_tags=body.skillTags,
        limit=body.limit,
    )
    return {
        "summary": summarize_attempt_history(history),
        "entries": history,
    }


async def load_skill_map_generation_summary(body: SkillMapDrillsRequest) -> dict[str, Any]:
    pattern_tags = [_pattern_slug(node.pattern) for node in body.skillMap[: body.count] if _pattern_slug(node.pattern)]
    history = await fetch_practice_history_entries(
        card_id="",
        question_type=body.questionType,
        skill_tags=pattern_tags,
        limit=max(20, body.count * 6),
    )
    return summarize_skill_map_progress(body.skillMap[: body.count], history)
