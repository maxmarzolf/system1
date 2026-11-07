from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from app.core.core_algorithm_practice import problem_slug_candidates
from app.repositories.base import acquire_connection
from app.repositories.types import (
    AlgorithmSkillRow,
    SubmissionInsertResult,
    SkillMapOverviewAlgorithmRow,
    SkillMapOverviewAttemptRow,
    SkillMapOverviewGeneratedRow,
)


async def insert_submission_attempt_row(
    *,
    session_id: str,
    card_id: str,
    card_title: str,
    question: str,
    question_type: str,
    category_tags: list[str],
    correct_answer: str,
    user_answer: str,
    mode: str,
    successful: bool,
    signals_json: str,
    interaction_id: str,
    generated_card_id: str | None,
    generated_card_json: str | None,
    template_mode: str,
    support_layer: str,
    live_coach_used: bool,
    modality: str,
    target_source: str | None,
    target_control: str | None,
    format_control: str | None,
    created_at: datetime,
    updated_at: datetime,
    multiple_choice_problem_id: str | None = None,
) -> SubmissionInsertResult | None:
    """Insert a submission. MCQ rows reference the stored problem the evaluator graded against."""
    del card_id, card_title, mode, question

    normalized_correct_answer = str(correct_answer or "")
    normalized_user_answer = str(user_answer or "")

    async with acquire_connection() as conn, conn.transaction():
        problem_slug = None
        if generated_card_id and modality != "mcq":
            candidates = problem_slug_candidates([generated_card_id])
            problem_slug = await conn.fetchval(
                """
                SELECT slug FROM problem
                WHERE slug = ANY($1::text[])
                ORDER BY array_position($1::text[], slug::text)
                LIMIT 1
                """,
                candidates,
            )
        row = await conn.fetchrow(
            """
            INSERT INTO submission
                (session_id, user_id, multiple_choice_problem_id, answer, question_type, category_tags,
                 correct_answer, successful, signals, interaction_id,
                 generated_card_id, problem_slug, generated_card, template_mode, support_layer,
                 live_coach_used, modality,
                 target_source, target_control, format_control, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
            RETURNING id
            """,
            session_id or "0000",
            "0000",
            multiple_choice_problem_id,
            normalized_user_answer,
            question_type,
            category_tags,
            normalized_correct_answer,
            successful,
            signals_json,
            interaction_id,
            generated_card_id,
            problem_slug,
            generated_card_json,
            template_mode,
            support_layer,
            live_coach_used,
            modality,
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
                a.slug AS algorithm_slug,
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
            SELECT id, title, tags, algorithm_slug, source_type
            FROM (
                SELECT
                    CASE
                        WHEN source_type IN ('core-catalog', 'core-meta')
                            THEN 'core-algorithm-' || slug
                        ELSE slug
                    END AS id,
                    title,
                    tags,
                    algorithm_slug,
                    source_type,
                    display_order
                FROM problem
                WHERE source_type <> 'static-playlist'
                   OR EXISTS (
                        SELECT 1
                        FROM playlist_problem_order ppo
                        JOIN playlist pl ON pl.slug = ppo.playlist_slug
                        WHERE ppo.problem_slug = problem.slug
                          AND ppo.order_slug = 'curated'
                          AND pl.show_on_skill_map
                   )
            ) rows
            ORDER BY display_order ASC
            """
        )
    return [cast(SkillMapOverviewGeneratedRow, dict(row)) for row in rows]


# Submissions the daily work grid counts and the history day view show.
_DAILY_WORK_SUBMISSION_FILTER = """
    (a.question_type LIKE 'skill-map%'
     OR a.question_type LIKE 'playlist:%'
     OR a.category_tags && ARRAY['skill-map']::text[])
"""


async def fetch_skill_map_overview_attempt_rows() -> list[SkillMapOverviewAttemptRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            SELECT
                COALESCE(a.generated_card_id, a.multiple_choice_problem_id) AS tracked_card_id,
                COALESCE(NULLIF(a.generated_card->>'title', ''), q.question_text, a.multiple_choice_problem_id) AS card_title,
                a.category_tags AS category_tags,
                a.question_type AS question_type,
                a.successful,
                a.created_at,
                a.template_mode,
                a.support_layer,
                a.modality,
                a.live_coach_used,
                a.signals
            FROM submission a
            LEFT JOIN multiple_choice_problem q ON q.id = a.multiple_choice_problem_id
            WHERE {_DAILY_WORK_SUBMISSION_FILTER}
            ORDER BY a.created_at DESC
            """
        )
    return [cast(SkillMapOverviewAttemptRow, dict(row)) for row in rows]


async def fetch_history_day_rows(day_start: datetime, day_end: datetime) -> list[dict[str, Any]]:
    """Every daily-work submission created in [day_start, day_end), oldest first, with MCQ choices."""
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            SELECT
                a.id,
                a.created_at,
                a.modality,
                a.question_type,
                a.category_tags,
                a.successful,
                a.answer,
                a.correct_answer,
                a.signals,
                a.multiple_choice_problem_id,
                a.problem_slug,
                COALESCE(NULLIF(a.generated_card->>'title', ''), a.generated_card_id, a.multiple_choice_problem_id) AS title,
                COALESCE(q.question_text, NULLIF(a.generated_card->>'question', ''), NULLIF(a.generated_card->>'prompt', ''), '') AS question,
                q.multiple_choice_answer_label_1, q.multiple_choice_answer_text_1,
                q.multiple_choice_answer_label_2, q.multiple_choice_answer_text_2,
                q.multiple_choice_answer_label_3, q.multiple_choice_answer_text_3,
                q.multiple_choice_answer_label_4, q.multiple_choice_answer_text_4,
                q.multiple_choice_correct_answer_label
            FROM submission a
            LEFT JOIN multiple_choice_problem q ON q.id = a.multiple_choice_problem_id
            WHERE {_DAILY_WORK_SUBMISSION_FILTER}
              AND a.created_at >= $1 AND a.created_at < $2
            ORDER BY a.created_at ASC, a.id ASC
            """,
            day_start,
            day_end,
        )
    return [dict(row) for row in rows]
