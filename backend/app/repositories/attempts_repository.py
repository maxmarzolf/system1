from __future__ import annotations

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


async def insert_score_attempt_row(
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
    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO score_attempts
                (card_id, card_title, question, question_type, category_tags,
                 correct_answer, user_answer, mode, correct, accuracy, exact, elapsed_ms,
                 interaction_id, generated_card_id, generated_card, template_mode,
                 support_layer, live_coach_used, coach_feedback, submission_rubric, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
            RETURNING id
            """,
            card_id,
            card_title,
            question,
            question_type,
            category_tags,
            correct_answer,
            user_answer,
            mode,
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
            FROM static_function_patterns p
            LEFT JOIN static_function_methods m ON m.pattern_slug = p.pattern_slug
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
            FROM static_function_patterns p
            LEFT JOIN static_function_methods m ON m.pattern_slug = p.pattern_slug
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
                    'static-function-' || name AS id,
                    title,
                    tags,
                    display_order
                FROM static_functions
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
                COALESCE(sa.generated_card_id, sa.card_id) AS tracked_card_id,
                COALESCE(sa.card_title, '') AS card_title,
                sa.category_tags AS category_tags,
                sa.accuracy,
                sa.created_at,
                sa.template_mode,
                sa.support_layer,
                sa.live_coach_used,
                sa.submission_rubric
            FROM score_attempts sa
            WHERE sa.mode = 'main-recall'
              AND sa.question_type LIKE 'skill-map%'
            ORDER BY sa.created_at DESC
            """
        )
    return [cast(SkillMapOverviewAttemptRow, dict(row)) for row in rows]
