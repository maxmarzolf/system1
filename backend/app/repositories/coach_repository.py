from __future__ import annotations

import json
from datetime import datetime
from typing import Any, cast

from app.repositories.base import acquire_connection
from app.repositories.types import PracticeHistoryEntry, PracticeHistoryRow
from app.submission_rubric import compact_submission_rubric

_PRACTICE_HISTORY_SELECT = """
    SELECT
        sa.id AS "attemptId",
        COALESCE(sa.interaction_id, '') AS "interactionId",
        sa.card_id AS "cardId",
        sa.card_title AS "cardTitle",
        sa.question,
        sa.question_type AS "questionType",
        sa.correct_answer AS "correctAnswer",
        sa.user_answer AS "userAnswer",
        sa.accuracy,
        sa.exact,
        sa.elapsed_ms AS "elapsedMs",
        sa.template_mode AS "templateMode",
        sa.support_layer AS "supportLayer",
        sa.live_coach_used AS "liveCoachUsed",
        sa.category_tags AS "categoryTags",
        sa.generated_card AS "generatedCard",
        sa.coach_feedback AS "submissionFeedback",
        sa.submission_rubric AS "submissionRubric",
        sa.created_at,
        COALESCE(live.live_feedback_count, 0) AS "liveFeedbackCount",
        latest.feedback AS "latestLiveFeedback"
    FROM score_attempts sa
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS live_feedback_count
        FROM coach_feedback_events fe
        WHERE fe.feedback_stage = 'live'
          AND (
            (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
            OR (
                sa.interaction_id IS NULL
                AND fe.card_id = sa.card_id
                AND fe.question_type = sa.question_type
                AND fe.created_at <= sa.created_at
            )
          )
    ) live ON TRUE
    LEFT JOIN LATERAL (
        SELECT fe.feedback
        FROM coach_feedback_events fe
        WHERE fe.feedback_stage = 'live'
          AND (
            (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
            OR (
                sa.interaction_id IS NULL
                AND fe.card_id = sa.card_id
                AND fe.question_type = sa.question_type
                AND fe.created_at <= sa.created_at
            )
          )
        ORDER BY fe.created_at DESC
        LIMIT 1
    ) latest ON TRUE
    WHERE sa.mode = 'main-recall'
"""


async def fetch_practice_history_rows(
    card_id: str,
    question_type: str,
    skill_tags: list[str],
    limit: int = 20,
) -> list[PracticeHistoryRow]:
    async with acquire_connection() as conn:
        if question_type:
            rows = await conn.fetch(
                f"""
                {_PRACTICE_HISTORY_SELECT}
                  AND sa.question_type = $2
                  AND (sa.card_id = $1 OR sa.generated_card_id = $1 OR sa.category_tags && $3::text[])
                ORDER BY sa.created_at DESC
                LIMIT $4
                """,
                card_id,
                question_type,
                skill_tags,
                limit,
            )
        elif skill_tags:
            rows = await conn.fetch(
                f"""
                {_PRACTICE_HISTORY_SELECT}
                  AND (sa.card_id = $1 OR sa.generated_card_id = $1 OR sa.category_tags && $2::text[])
                ORDER BY sa.created_at DESC
                LIMIT $3
                """,
                card_id,
                skill_tags,
                limit,
            )
        else:
            rows = await conn.fetch(
                f"""
                {_PRACTICE_HISTORY_SELECT}
                  AND (sa.card_id = $1 OR sa.generated_card_id = $1)
                ORDER BY sa.created_at DESC
                LIMIT $2
                """,
                card_id,
                limit,
            )

    return [cast(PracticeHistoryRow, dict(row)) for row in rows]


def _parse_json_field(value: Any, default_value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return default_value
        return parsed if isinstance(parsed, type(default_value)) else default_value
    return default_value


async def fetch_practice_history_entries(
    card_id: str,
    question_type: str,
    skill_tags: list[str],
    limit: int = 20,
) -> list[PracticeHistoryEntry]:
    rows = await fetch_practice_history_rows(card_id, question_type, skill_tags, limit)
    history: list[PracticeHistoryEntry] = []
    for row in rows:
        history.append({
            "attemptId": int(row["attemptId"]),
            "interactionId": str(row["interactionId"] or ""),
            "cardId": row["cardId"],
            "cardTitle": row["cardTitle"],
            "question": row["question"] or "",
            "questionType": row["questionType"] or "",
            "correctAnswer": row["correctAnswer"] or "",
            "userAnswer": row["userAnswer"] or "",
            "accuracy": float(row["accuracy"] or 0),
            "exact": bool(row["exact"]),
            "elapsedMs": int(row["elapsedMs"] or 0),
            "templateMode": str(row["templateMode"] or "algorithm"),
            "supportLayer": str(row["supportLayer"] or "none"),
            "liveCoachUsed": bool(row["liveCoachUsed"]),
            "categoryTags": list(row["categoryTags"] or []),
            "generatedCard": _parse_json_field(row["generatedCard"], {}),
            "liveFeedbackCount": int(row["liveFeedbackCount"] or 0),
            "latestLiveFeedback": _parse_json_field(row["latestLiveFeedback"], {}),
            "submissionFeedback": _parse_json_field(row["submissionFeedback"], {}),
            "submissionRubric": compact_submission_rubric(row["submissionRubric"]),
            "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
        })
    return history


async def insert_feedback_event_row(
    *,
    interaction_id: str,
    card_id: str,
    generated_card_id: str,
    question_type: str,
    feedback_stage: str,
    live_mode: bool,
    prompt: str,
    expected_answer: str,
    user_answer: str,
    accuracy: float,
    exact: bool,
    elapsed_ms: int,
    skill_tags: list[str],
    previous_attempts_json: str,
    live_milestones_json: str,
    feedback_json: str,
    llm_used: bool,
    created_at: datetime,
) -> None:
    async with acquire_connection() as conn:
        await conn.execute(
            """
            INSERT INTO coach_feedback_events
                (interaction_id, card_id, generated_card_id, question_type, feedback_stage, live_mode,
                 prompt, expected_answer, user_answer, accuracy, exact, elapsed_ms, skill_tags,
                 previous_attempts, live_milestones, feedback, llm_used, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
            """,
            interaction_id,
            card_id,
            generated_card_id,
            question_type,
            feedback_stage,
            live_mode,
            prompt,
            expected_answer,
            user_answer,
            accuracy,
            exact,
            elapsed_ms,
            skill_tags,
            previous_attempts_json,
            live_milestones_json,
            feedback_json,
            llm_used,
            created_at,
        )


async def insert_generated_skill_map_card_row(
    *,
    card_id: str,
    question_type: str,
    title: str,
    difficulty: str,
    prompt: str,
    solution: str,
    missing: str,
    hint: str,
    tags: list[str],
    llm_used: bool,
    generation_context_json: str,
    created_at: datetime,
) -> None:
    async with acquire_connection() as conn:
        await conn.execute(
            """
            INSERT INTO generated_skill_map_cards
                (id, question_type, title, difficulty, prompt, solution, missing, hint, tags,
                 llm_used, generation_context, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (id) DO NOTHING
            """,
            card_id,
            question_type,
            title,
            difficulty,
            prompt,
            solution,
            missing,
            hint,
            tags,
            llm_used,
            generation_context_json,
            created_at,
        )
