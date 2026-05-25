from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import Any, cast

from app.repositories.base import acquire_connection
from app.repositories.types import PracticeHistoryEntry, PracticeHistoryRow, QuestionInsertResult
from app.submission_rubric import compact_submission_rubric

_PRACTICE_HISTORY_SELECT = """
    SELECT
        a.id AS "attemptId",
        COALESCE(a.interaction_id, '') AS "interactionId",
        COALESCE(a.generated_card_id, a.question_id) AS "cardId",
        COALESCE(NULLIF(a.generated_card->>'title', ''), q.question_text, a.question_id) AS "cardTitle",
        COALESCE(q.question_text, '') AS question,
        a.question_type AS "questionType",
        a.correct_answer AS "correctAnswer",
        a.answer AS "userAnswer",
        a.accuracy,
        a.exact,
        a.elapsed_ms AS "elapsedMs",
        a.template_mode AS "templateMode",
        a.support_layer AS "supportLayer",
        a.live_coach_used AS "liveCoachUsed",
        a.category_tags AS "categoryTags",
        a.generated_card AS "generatedCard",
        a.coach_feedback AS "submissionFeedback",
        a.submission_rubric AS "submissionRubric",
        a.created_at,
        COALESCE(live.live_feedback_count, 0) AS "liveFeedbackCount",
        latest.feedback AS "latestLiveFeedback"
    FROM answer a
    LEFT JOIN question q ON q.id = a.question_id
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS live_feedback_count
        FROM coach_feedback_events fe
        WHERE fe.feedback_stage = 'live'
          AND (
            (fe.answer_id IS NOT NULL AND fe.answer_id = a.id)
            OR (a.interaction_id IS NOT NULL AND fe.interaction_id = a.interaction_id)
            OR (
                a.interaction_id IS NULL
                AND fe.card_id = COALESCE(a.generated_card_id, a.question_id)
                AND fe.question_type = a.question_type
                AND fe.created_at <= a.created_at
            )
          )
    ) live ON TRUE
    LEFT JOIN LATERAL (
        SELECT fe.feedback
        FROM coach_feedback_events fe
        WHERE fe.feedback_stage = 'live'
          AND (
                        (fe.answer_id IS NOT NULL AND fe.answer_id = a.id)
                        OR (a.interaction_id IS NOT NULL AND fe.interaction_id = a.interaction_id)
            OR (
                                a.interaction_id IS NULL
                                AND fe.card_id = COALESCE(a.generated_card_id, a.question_id)
                                AND fe.question_type = a.question_type
                                AND fe.created_at <= a.created_at
            )
          )
        ORDER BY fe.created_at DESC
        LIMIT 1
    ) latest ON TRUE
        WHERE a.question_type <> ''
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
                                    AND a.question_type = $2
                                    AND (COALESCE(a.generated_card_id, a.question_id) = $1 OR a.category_tags && $3::text[])
                                ORDER BY a.created_at DESC
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
                                    AND (COALESCE(a.generated_card_id, a.question_id) = $1 OR a.category_tags && $2::text[])
                                ORDER BY a.created_at DESC
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
                                    AND (COALESCE(a.generated_card_id, a.question_id) = $1)
                                ORDER BY a.created_at DESC
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


def _normalize_question_fingerprint_text(value: str) -> str:
    text = str(value or "").replace("\r\n", "\n").strip()
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def _multiple_choice_question_fingerprint(question: dict[str, Any]) -> str:
    question_text = _normalize_question_fingerprint_text(str(question.get("question") or ""))
    normalized_choices = sorted(
        _normalize_question_fingerprint_text(str(choice.get("text") or ""))
        for choice in question.get("choices", [])
        if isinstance(choice, dict)
    )
    normalized_correct_text = _normalize_question_fingerprint_text(
        next(
            (
                str(choice.get("text") or "")
                for choice in question.get("choices", [])
                if isinstance(choice, dict) and str(choice.get("id") or "") == str(question.get("correctChoiceId") or "")
            ),
            "",
        )
    )
    payload = json.dumps(
        {
            "kind": "mcq",
            "question": question_text,
            "choices": normalized_choices,
            "correctText": normalized_correct_text,
        },
        separators=(",", ":"),
        ensure_ascii=True,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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


async def fetch_latest_answer_id_for_feedback(
    *,
    interaction_id: str,
    card_id: str,
    question_type: str,
) -> int | None:
    normalized_interaction_id = str(interaction_id or "").strip()
    normalized_card_id = str(card_id or "").strip()
    normalized_question_type = str(question_type or "").strip()

    async with acquire_connection() as conn:
        if normalized_interaction_id:
            row = await conn.fetchrow(
                """
                SELECT id
                FROM answer
                WHERE interaction_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                normalized_interaction_id,
            )
            if row:
                return int(row["id"])

        row = await conn.fetchrow(
            """
            SELECT id
            FROM answer
            WHERE question_type = $2
              AND (generated_card_id = $1 OR question_id = $1)
            ORDER BY created_at DESC
            LIMIT 1
            """,
            normalized_card_id,
            normalized_question_type,
        )
        if row:
            return int(row["id"])

    return None


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
    answer_id: int | None = None,
) -> None:
    async with acquire_connection() as conn:
        await conn.execute(
            """
            INSERT INTO coach_feedback_events
                (interaction_id, card_id, answer_id, generated_card_id, question_type, feedback_stage, live_mode,
                 prompt, expected_answer, user_answer, accuracy, exact, elapsed_ms, skill_tags,
                 previous_attempts, live_milestones, feedback, llm_used, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
            """,
            interaction_id,
            card_id,
            answer_id,
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


async def insert_generated_multiple_choice_question_rows(
    *,
    questions: list[dict[str, Any]],
    user_id: str,
    created_date: datetime,
    modified_date: datetime,
) -> list[str]:
    saved_ids: list[str] = []
    async with acquire_connection() as conn:
        for question in questions:
            choices = [choice for choice in question.get("choices", []) if isinstance(choice, dict)]
            if len(choices) < 4:
                continue

            correct_label = str(question.get("correctChoiceId") or "")
            correct_text = next(
                (str(choice.get("text") or "") for choice in choices if str(choice.get("id") or "") == correct_label),
                "",
            )
            fingerprint = _multiple_choice_question_fingerprint(question)
            row = await conn.fetchrow(
                """
                INSERT INTO question (
                    id, user_id, question_text, question_help_text, recall_answer,
                    multiple_choice_answer_label_1, multiple_choice_answer_text_1,
                    multiple_choice_answer_label_2, multiple_choice_answer_text_2,
                    multiple_choice_answer_label_3, multiple_choice_answer_text_3,
                    multiple_choice_answer_label_4, multiple_choice_answer_text_4,
                    multiple_choice_correct_answer_label, multiple_choice_correct_answer_text,
                    fingerprint, created_date, modified_date
                )
                VALUES (
                    $1,$2,$3,$4,$5,
                    $6,$7,
                    $8,$9,
                    $10,$11,
                    $12,$13,
                    $14,$15,
                    $16,$17,$18
                )
                ON CONFLICT (fingerprint) DO UPDATE
                SET modified_date = EXCLUDED.modified_date
                RETURNING id
                """,
                str(question.get("id") or ""),
                user_id,
                str(question.get("question") or ""),
                str(question.get("explanation") or ""),
                None,
                str(choices[0].get("id") or ""),
                str(choices[0].get("text") or ""),
                str(choices[1].get("id") or ""),
                str(choices[1].get("text") or ""),
                str(choices[2].get("id") or ""),
                str(choices[2].get("text") or ""),
                str(choices[3].get("id") or ""),
                str(choices[3].get("text") or ""),
                correct_label,
                correct_text,
                fingerprint,
                created_date,
                modified_date,
            )
            if row:
                saved_ids.append(cast(QuestionInsertResult, dict(row))["id"])
    return saved_ids
