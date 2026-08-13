from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import cast

from app.repositories.base import acquire_connection
from app.repositories.types import (
    AlgorithmSkillRow,
    SubmissionInsertResult,
    SkillMapOverviewAlgorithmRow,
    SkillMapOverviewAttemptRow,
    SkillMapOverviewGeneratedRow,
)


def _normalize_question_fingerprint_text(value: str) -> str:
    text = str(value or "").replace("\r\n", "\n").strip()
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def _attempt_problem_fingerprint(
    *,
    question: str,
    correct_answer: str,
    question_type: str,
    generated_card_json: str | None,
) -> str:
    payload = json.dumps(
        {
            "kind": "attempt-problem",
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


def _is_multiple_choice_attempt(
    *,
    generated_card_id: str | None,
    question_type: str,
    category_tags: list[str],
    activity_format: str | None,
) -> bool:
    return (
        activity_format == "multiple-choice"
        or str(question_type or "").startswith("skill-map-mcq")
        or "skill-map-mcq" in category_tags
        or str(generated_card_id or "").startswith("mcq-")
    )


async def _resolve_multiple_choice_problem_id(
    *,
    generated_card_id: str | None,
    question: str,
    question_type: str,
    correct_answer: str,
    generated_card_json: str | None,
    category_tags: list[str],
    activity_format: str | None,
    created_at: datetime,
    updated_at: datetime,
) -> str | None:
    if not _is_multiple_choice_attempt(
        generated_card_id=generated_card_id,
        question_type=question_type,
        category_tags=category_tags,
        activity_format=activity_format,
    ):
        return None

    fingerprint = _attempt_problem_fingerprint(
        question=question,
        correct_answer=correct_answer,
        question_type=question_type,
        generated_card_json=generated_card_json,
    )
    default_problem_id = f"mcq-{fingerprint[:24]}"
    problem_id = (generated_card_id or "").strip() or default_problem_id
    if not problem_id.startswith("mcq-"):
        problem_id = default_problem_id
    created_date = created_at.replace(tzinfo=None) if created_at.tzinfo else created_at
    modified_date = updated_at.replace(tzinfo=None) if updated_at.tzinfo else updated_at

    async with acquire_connection() as conn:
        if generated_card_id:
            existing = await conn.fetchrow("SELECT id FROM multiple_choice_problem WHERE id = $1", generated_card_id)
            if existing:
                return str(existing["id"])

        row = await conn.fetchrow(
            """
            INSERT INTO multiple_choice_problem (
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
            problem_id,
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
        return problem_id
    return str(row["id"])


async def insert_submission_attempt_row(
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
    activity_format: str | None,
    target_source: str | None,
    target_control: str | None,
    format_control: str | None,
    created_at: datetime,
    updated_at: datetime,
) -> SubmissionInsertResult | None:
    del card_id, card_title, mode

    normalized_question = str(question or "")
    normalized_correct_answer = str(correct_answer or "")
    normalized_user_answer = str(user_answer or "")
    multiple_choice_problem_id = await _resolve_multiple_choice_problem_id(
        generated_card_id=generated_card_id,
        question=normalized_question,
        question_type=question_type,
        correct_answer=normalized_correct_answer,
        generated_card_json=generated_card_json,
        category_tags=category_tags,
        activity_format=activity_format,
        created_at=created_at,
        updated_at=updated_at,
    )

    async with acquire_connection() as conn, conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO submission
                (session_id, user_id, multiple_choice_problem_id, answer, question_type, category_tags,
                 correct_answer, is_correct, accuracy, exact, elapsed_ms, interaction_id,
                 generated_card_id, generated_card, template_mode, support_layer,
                 live_coach_used, coach_feedback, submission_rubric, activity_format,
                 target_source, target_control, format_control, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
            RETURNING id
            """,
            interaction_id or generated_card_id or multiple_choice_problem_id or "0000",
            "0000",
            multiple_choice_problem_id,
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
            activity_format,
            target_source,
            target_control,
            format_control,
            created_at,
            updated_at,
        )
        if not row:
            return None

    return cast(SubmissionInsertResult, dict(row)) if row else None


_ALGORITHM_SKILL_JOIN = """
    FROM algorithm a
    LEFT JOIN (
        SELECT
            p.algorithm_slug,
            ps.skill_slug,
            MIN(ps.display_order) AS display_order
        FROM problem p
        JOIN problem_skill ps ON ps.problem_slug = p.slug
        GROUP BY p.algorithm_slug, ps.skill_slug
    ) links ON links.algorithm_slug = a.slug
    LEFT JOIN skill s ON s.slug = links.skill_slug
"""


async def fetch_algorithms_with_skills_rows() -> list[AlgorithmSkillRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            SELECT
                (DENSE_RANK() OVER (ORDER BY a.display_order ASC, a.slug ASC))::int AS algorithm_id,
                a.name AS algorithm_name,
                (ROW_NUMBER() OVER (ORDER BY a.display_order ASC, links.display_order ASC, s.slug ASC))::int AS skill_id,
                s.name AS skill_name
            {_ALGORITHM_SKILL_JOIN}
            ORDER BY a.display_order ASC, links.display_order ASC, s.slug ASC
            """
        )
    return [cast(AlgorithmSkillRow, dict(row)) for row in rows]


async def fetch_skill_map_overview_algorithm_rows() -> list[SkillMapOverviewAlgorithmRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            SELECT
                (DENSE_RANK() OVER (ORDER BY a.display_order ASC, a.slug ASC))::int AS algorithm_id,
                a.name AS algorithm_name,
                s.name AS skill_name
            {_ALGORITHM_SKILL_JOIN}
            ORDER BY a.display_order ASC, links.display_order ASC, s.slug ASC
            """
        )
    return [cast(SkillMapOverviewAlgorithmRow, dict(row)) for row in rows]


async def fetch_skill_map_overview_generated_rows() -> list[SkillMapOverviewGeneratedRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT id, title, tags
            FROM (
                SELECT
                    'core-algorithm-' || slug AS id,
                    title,
                    tags,
                    display_order
                FROM problem
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
                COALESCE(a.generated_card_id, a.multiple_choice_problem_id) AS tracked_card_id,
                COALESCE(NULLIF(a.generated_card->>'title', ''), q.question_text, a.multiple_choice_problem_id) AS card_title,
                a.category_tags AS category_tags,
                a.question_type AS question_type,
                a.accuracy,
                a.exact,
                a.created_at,
                a.template_mode,
                a.support_layer,
                a.activity_format,
                a.live_coach_used,
                a.submission_rubric
            FROM submission a
            LEFT JOIN multiple_choice_problem q ON q.id = a.multiple_choice_problem_id
            WHERE a.question_type LIKE 'skill-map%'
               OR a.question_type LIKE 'playlist:%'
               OR a.category_tags && ARRAY['skill-map']::text[]
            ORDER BY a.created_at DESC
            """
        )
    return [cast(SkillMapOverviewAttemptRow, dict(row)) for row in rows]
