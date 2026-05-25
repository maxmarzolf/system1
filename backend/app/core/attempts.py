from __future__ import annotations

import json as _json
from datetime import datetime, timezone
from typing import Any

from app.models import AttemptCreate, SkillMapNode, SkillMapOverviewResponse
from app.repositories.attempts_repository import (
    fetch_patterns_with_methods_rows,
    fetch_skill_map_overview_attempt_rows,
    fetch_skill_map_overview_generated_rows,
    fetch_skill_map_overview_pattern_rows,
    insert_answer_attempt_row,
)
from app.submission_rubric import compact_submission_rubric
from app.services.attempts_service import build_skill_map_nodes, build_skill_map_overview

async def create_attempt(body: AttemptCreate):
    now = datetime.now(tz=timezone.utc)
    submission_rubric = compact_submission_rubric(
        body.submissionRubric
        or (body.coachFeedback or {}).get("submissionRubric")
    )

    row = await insert_answer_attempt_row(
        card_id=body.cardId,
        card_title=body.cardTitle,
        question=body.question,
        question_type=body.questionType,
        category_tags=body.categoryTags,
        correct_answer=body.correctAnswer,
        user_answer=body.userAnswer,
        mode=body.mode.value,
        correct=body.correct,
        accuracy=body.accuracy,
        exact=body.exact,
        elapsed_ms=body.elapsedMs,
        interaction_id=body.interactionId,
        generated_card_id=body.generatedCardId,
        generated_card_json=_json.dumps(body.generatedCard) if body.generatedCard else None,
        template_mode=body.templateMode.value,
        support_layer=body.supportLayer.value,
        live_coach_used=body.liveCoachUsed,
        coach_feedback_json=_json.dumps(body.coachFeedback) if body.coachFeedback else None,
        submission_rubric_json=_json.dumps(submission_rubric) if submission_rubric else None,
        created_at=now,
        updated_at=now,
    )

    return {"saved": True, "attemptId": row["id"] if row else None}


async def get_skill_map():
    rows = await fetch_patterns_with_methods_rows()

    return build_skill_map_nodes(rows)


async def get_skill_map_overview():
    pattern_rows = await fetch_skill_map_overview_pattern_rows()
    generated_rows = await fetch_skill_map_overview_generated_rows()
    attempt_rows = await fetch_skill_map_overview_attempt_rows()
    return build_skill_map_overview(pattern_rows, generated_rows, attempt_rows)
