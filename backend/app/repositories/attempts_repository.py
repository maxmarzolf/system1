from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import cast

from app.repositories.base import acquire_connection
from app.repositories.types import (
    PatternMethodRow,
    ScoreAttemptInsertResult,
    SkillMapOverviewAttemptRow,
    SkillMapOverviewGeneratedRow,
    SkillMapOverviewPatternRow,
)


def _normalize_question_fingerprint_text(value: str) -> str:
    text = str(value or "").replace("\r\n", "\n").strip()
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def _attempt_question_fingerprint(
    *,
    question: str,
    correct_answer: str,
    question_type: str,
    generated_card_json: str | None,
) -> str:
    payload = json.dumps(
        {
            "kind": "attempt-question",
            "question": _normalize_question_fingerprint_text(question),
            "correctAnswer": _normalize_question_fingerprint_text(correct_answer),
            "questionType": _normalize_question_fingerprint_text(question_type),
            "generatedCard": generated_card_json or "",
        },
        separators=(",", ":"),
        ensure_ascii=True,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _resolve_question_id(
    *,
    generated_card_id: str | None,
    question: str,
    question_type: str,
    correct_answer: str,
    generated_card_json: str | None,
    created_at: datetime,
    updated_at: datetime,
) -> str:
    fingerprint = _attempt_question_fingerprint(
        question=question,
        correct_answer=correct_answer,
        question_type=question_type,
        generated_card_json=generated_card_json,
    )
    default_question_id = f"q-{fingerprint[:24]}"
    question_id = (generated_card_id or "").strip() or default_question_id
    created_date = created_at.replace(tzinfo=None) if created_at.tzinfo else created_at
    modified_date = updated_at.replace(tzinfo=None) if updated_at.tzinfo else updated_at

    async with acquire_connection() as conn:
        if generated_card_id:
            existing = await conn.fetchrow("SELECT id FROM question WHERE id = $1", generated_card_id)
            if existing:
                return str(existing["id"])

        row = await conn.fetchrow(
            """
            INSERT INTO question (
                id,
                user_id,
                question_text,
                question_help_text,
                recall_answer,
                multiple_choice_correct_answer_text,
                fingerprint,
                created_date,
                modified_date
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (fingerprint) DO UPDATE
            SET modified_date = EXCLUDED.modified_date
            RETURNING id
            """,
            question_id,
            "0000",
            question,
            "",
            None,
            correct_answer,
            fingerprint,
            created_date,
            modified_date,
        )

    if not row:
        return question_id
    return str(row["id"])


async def insert_answer_attempt_row(
    *,
    card_id: str,
    card_title: str,
    question: str,
    question_type: str,
    category_tags: list[str],
    correct_answer: str,
    user_answer: str,
    mode: str,
    correct: bool,
    accuracy: float,
    exact: bool,
    elapsed_ms: int,
    interaction_id: str,
    generated_card_id: str | None,
    generated_card_json: str | None,
    template_mode: str,
    support_layer: str,
    live_coach_used: bool,
    coach_feedback_json: str | None,
    submission_rubric_json: str | None,
    created_at: datetime,
    updated_at: datetime,
) -> ScoreAttemptInsertResult | None:
    del card_id, card_title, mode

    normalized_question = str(question or "")
    normalized_correct_answer = str(correct_answer or "")
    normalized_user_answer = str(user_answer or "")
    question_id = await _resolve_question_id(
        generated_card_id=generated_card_id,
        question=normalized_question,
        question_type=question_type,
        correct_answer=normalized_correct_answer,
        generated_card_json=generated_card_json,
        created_at=created_at,
        updated_at=updated_at,
    )

    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO answer
                (session_id, user_id, question_id, answer, question_type, category_tags,
                 correct_answer, is_correct, accuracy, exact, elapsed_ms, interaction_id,
                 generated_card_id, generated_card, template_mode, support_layer,
                 live_coach_used, coach_feedback, submission_rubric, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
            RETURNING id
            """,
            interaction_id or question_id,
            "0000",
            question_id,
            normalized_user_answer,
            question_type,
            category_tags,
            normalized_correct_answer,
            correct,
            accuracy,
            exact,
            elapsed_ms,
            interaction_id,
            generated_card_id,
            generated_card_json,
            template_mode,
            support_layer,
            live_coach_used,
            coach_feedback_json,
            submission_rubric_json,
            created_at,
            updated_at,
        )
    return cast(ScoreAttemptInsertResult, dict(row)) if row else None


async def fetch_patterns_with_methods_rows() -> list[PatternMethodRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT
                (DENSE_RANK() OVER (ORDER BY p.display_order ASC, p.pattern_slug ASC))::int AS pattern_id,
                p.name AS pattern_name,
                (ROW_NUMBER() OVER (ORDER BY p.display_order ASC, m.display_order ASC, m.method_slug ASC))::int AS method_id,
                m.name AS method_name
            FROM core_algorithm_patterns p
            LEFT JOIN core_algorithm_methods m ON m.pattern_slug = p.pattern_slug
            ORDER BY p.display_order ASC, m.display_order ASC, m.method_slug ASC
            """
        )
    return [cast(PatternMethodRow, dict(row)) for row in rows]


async def fetch_skill_map_overview_pattern_rows() -> list[SkillMapOverviewPatternRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT
                (DENSE_RANK() OVER (ORDER BY p.display_order ASC, p.pattern_slug ASC))::int AS pattern_id,
                p.name AS pattern_name,
                m.name AS method_name
            FROM core_algorithm_patterns p
            LEFT JOIN core_algorithm_methods m ON m.pattern_slug = p.pattern_slug
            ORDER BY p.display_order ASC, m.display_order ASC, m.method_slug ASC
            """
        )
    return [cast(SkillMapOverviewPatternRow, dict(row)) for row in rows]


async def fetch_skill_map_overview_generated_rows() -> list[SkillMapOverviewGeneratedRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT id, title, tags
            FROM (
                SELECT
                    'core-algorithm-' || name AS id,
                    title,
                    tags,
                    display_order
                FROM core_algorithms
            ) rows
            ORDER BY display_order ASC
            """
        )
    return [cast(SkillMapOverviewGeneratedRow, dict(row)) for row in rows]


async def fetch_skill_map_overview_attempt_rows() -> list[SkillMapOverviewAttemptRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT
                COALESCE(a.generated_card_id, a.question_id) AS tracked_card_id,
                COALESCE(NULLIF(a.generated_card->>'title', ''), q.question_text, a.question_id) AS card_title,
                a.category_tags AS category_tags,
                a.accuracy,
                a.created_at,
                a.template_mode,
                a.support_layer,
                a.live_coach_used,
                a.submission_rubric
            FROM answer a
            LEFT JOIN question q ON q.id = a.question_id
            WHERE a.question_type LIKE 'skill-map%'
            ORDER BY a.created_at DESC
            """
        )
    return [cast(SkillMapOverviewAttemptRow, dict(row)) for row in rows]
