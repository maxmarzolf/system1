from __future__ import annotations

from datetime import date, datetime
from typing import Any, cast

from app.contracts.catalog_ids import problem_slug_candidates
from app.repositories.base import acquire_connection
from app.repositories.types import (
    AlgorithmSkillRow,
    CompetencyOverallRow,
    CompetencySignalRow,
    CompetencyTerrainRow,
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
    created_at: datetime,
    multiple_choice_problem_id: str | None = None,
    problem_slug: str | None = None,
    exercise_id: str | None = None,
) -> SubmissionInsertResult | None:
    """Insert a submission. MCQ rows reference the stored problem the evaluator graded against."""
    del card_id, card_title, mode, question

    normalized_correct_answer = str(correct_answer or "")
    normalized_user_answer = str(user_answer or "")

    async with acquire_connection() as conn, conn.transaction():
        if problem_slug is None and generated_card_id and modality != "mcq":
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
                (session_id, multiple_choice_problem_id, answer, question_type, category_tags,
                 correct_answer, successful, signals, interaction_id,
                 generated_card_id, problem_slug, generated_card, template_mode, support_layer,
                 live_coach_used, modality, created_at, exercise_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
            RETURNING id
            """,
            session_id or "0000",
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
            created_at,
            exercise_id,
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


# Shared by the competency queries: every scored rubric entry of every counted submission, with
# the algorithm it counts toward ($1 time zone, $2/$3 the tag → algorithm table).
_COMPETENCY_ENTRIES_CTES = f"""
tag_algorithm AS (
    SELECT tag, slug FROM unnest($2::text[], $3::text[]) AS m(tag, slug)
),
-- Each counted submission belongs to the algorithm of its first tag that names one.
attributed AS (
    SELECT DISTINCT ON (a.id)
        a.id,
        m.slug AS algorithm,
        (a.created_at AT TIME ZONE $1)::date AS day,
        a.signals->'evaluation' AS evaluation
    FROM submission a
    CROSS JOIN LATERAL unnest(a.category_tags) WITH ORDINALITY AS t(tag, position)
    JOIN tag_algorithm m ON m.tag = lower(t.tag)
    WHERE {_DAILY_WORK_SUBMISSION_FILTER}
    ORDER BY a.id, t.position
),
-- Every scored rubric entry (dimensions and modifiers), clamped to 0-100.
entries AS (
    SELECT x.id, x.algorithm, x.day, e.key, COALESCE(NULLIF(e.value->>'label', ''), e.key) AS label,
           LEAST(GREATEST((e.value->>'score')::float, 0), 100) AS score
    FROM attributed x
    CROSS JOIN LATERAL (
        SELECT key, value FROM jsonb_each(
            CASE WHEN jsonb_typeof(x.evaluation->'dimensions') = 'object' THEN x.evaluation->'dimensions' ELSE '{{}}'::jsonb END)
        UNION ALL
        SELECT key, value FROM jsonb_each(
            CASE WHEN jsonb_typeof(x.evaluation->'modifiers') = 'object' THEN x.evaluation->'modifiers' ELSE '{{}}'::jsonb END)
    ) e
    WHERE e.value->>'status' IN ('pass', 'partial', 'fail') AND jsonb_typeof(e.value->'score') = 'number'
)
"""

_COMPETENCY_TERRAIN_SQL = f"""
WITH {_COMPETENCY_ENTRIES_CTES},
observed AS (
    SELECT algorithm, day, AVG(score) AS average, COUNT(DISTINCT id)::int AS answers, COUNT(*)::int AS signals
    FROM entries
    GROUP BY algorithm, day
),
-- Every day from an algorithm's first practice to today.
grid AS (
    SELECT f.algorithm, d::date AS day
    FROM (SELECT algorithm, MIN(day) AS first_day FROM observed GROUP BY algorithm) f
    CROSS JOIN LATERAL generate_series(f.first_day, GREATEST($5::date, f.first_day), INTERVAL '1 day') AS d
),
filled AS (
    SELECT g.algorithm, g.day, o.average, COALESCE(o.answers, 0) AS answers, COALESCE(o.signals, 0) AS signals,
           COUNT(o.average) OVER (PARTITION BY g.algorithm ORDER BY g.day) AS practice_run
    FROM grid g
    LEFT JOIN observed o USING (algorithm, day)
),
-- A day without practice carries the last practised day's average, decayed per day since.
carried AS (
    SELECT *,
           FIRST_VALUE(average) OVER (PARTITION BY algorithm, practice_run ORDER BY day) AS last_average,
           MIN(day) OVER (PARTITION BY algorithm, practice_run) AS last_practised
    FROM filled
)
SELECT
    algorithm,
    day,
    average IS NOT NULL AS observed,
    answers,
    signals,
    ROUND(average::numeric, 1)::float AS average,
    ROUND((last_average * POWER(1 - $4::float, day - last_practised))::numeric, 1)::float AS competency,
    last_practised,
    ROUND(last_average::numeric, 1)::float AS last_average,
    (day - last_practised)::int AS days_since
FROM carried
"""

# Strong when competency is at the threshold; otherwise "learn" if the last practised day was
# already below it (never got good), else "review" (was good, has decayed). In free fall when it
# has been decaying for more than $7 days.
_COMPETENCY_TERRAIN_STANDING_SQL = f"""
SELECT *,
    CASE
        WHEN competency >= $6::float THEN 'strong'
        WHEN last_average < $6::float THEN 'learn'
        ELSE 'review'
    END AS standing,
    days_since > $7::int AS free_fall
FROM ({_COMPETENCY_TERRAIN_SQL}) terrain
ORDER BY algorithm, day
"""


async def fetch_competency_terrain(
    *,
    timezone_name: str,
    tag_slugs: dict[str, str],
    decay_per_day: float,
    today: date,
    strong_at: float = 70.0,
    free_fall_days: int = 10,
) -> list[CompetencyTerrainRow]:
    """Competency per algorithm per calendar day, computed in one aggregate query.

    Competency is the average of every scored signal from the algorithm's counted answers that
    day; a day without practice carries the last practised value, decayed by ``decay_per_day``
    (compounded) for each day since. Rows run from each algorithm's first practice to ``today``.
    ``tag_slugs`` maps lower-case tags to the algorithm slug they count toward. Each row's
    ``standing`` is ``strong`` (competency ≥ ``strong_at``), ``learn`` (the last practised average
    was already below it) or ``review`` (it was above, and has decayed); ``free_fall`` is true after
    more than ``free_fall_days`` days without practice.
    """
    tags = list(tag_slugs)
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            _COMPETENCY_TERRAIN_STANDING_SQL,
            timezone_name, tags, [tag_slugs[tag] for tag in tags], decay_per_day, today, strong_at, free_fall_days,
        )
    return [cast(CompetencyTerrainRow, dict(row)) for row in rows]


# Overall competency per day: the average of every practised algorithm's competency that day
# (each the average of its signals, decayed on days without practice). ``week_change`` is the
# change since 7 days earlier (or since the first day, with less history), and ``trend`` bands
# it: improving above +$6 points, regressing below -$6, maintaining otherwise. The first five
# parameters are the terrain query's.
_COMPETENCY_OVERALL_SQL = f"""
WITH daily AS (
    SELECT day, AVG(competency) AS competency, COUNT(*)::int AS algorithms
    FROM ({_COMPETENCY_TERRAIN_SQL}) terrain
    GROUP BY day
),
changes AS (
    SELECT *,
           competency - COALESCE(LAG(competency, 7) OVER (ORDER BY day), FIRST_VALUE(competency) OVER (ORDER BY day)) AS week_change
    FROM daily
)
SELECT
    day,
    ROUND(competency::numeric, 1)::float AS competency,
    algorithms,
    ROUND(week_change::numeric, 1)::float AS week_change,
    CASE
        WHEN week_change > $6::float THEN 'improving'
        WHEN week_change < -$6::float THEN 'regressing'
        ELSE 'maintaining'
    END AS trend
FROM changes
ORDER BY day
"""


async def fetch_competency_overall(
    *, timezone_name: str, tag_slugs: dict[str, str], decay_per_day: float, today: date, steady_within: float = 2.0
) -> list[CompetencyOverallRow]:
    """Overall competency per calendar day, across every practised algorithm (one aggregate query),
    with the change over the past week and its trend (``steady_within`` points either way is
    maintaining)."""
    tags = list(tag_slugs)
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            _COMPETENCY_OVERALL_SQL, timezone_name, tags, [tag_slugs[tag] for tag in tags], decay_per_day, today, steady_within,
        )
    return [cast(CompetencyOverallRow, dict(row)) for row in rows]


# Each signal's all-time average per algorithm, and the $4 strongest and $4 weakest. A signal is
# never on both sides: with fewer than 2 × $4 signals they are split, the strongest side taking
# the odd one.
_COMPETENCY_SIGNALS_SQL = f"""
WITH {_COMPETENCY_ENTRIES_CTES},
per_signal AS (
    SELECT algorithm, key, MAX(label) AS label, AVG(score) AS average, COUNT(DISTINCT id)::int AS answers
    FROM entries
    GROUP BY algorithm, key
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY algorithm ORDER BY average DESC, key) AS from_top,
           ROW_NUMBER() OVER (PARTITION BY algorithm ORDER BY average ASC, key DESC) AS from_bottom,
           LEAST($4::int, CEIL(COUNT(*) OVER (PARTITION BY algorithm) / 2.0)::int) AS strongest_count
    FROM per_signal
)
SELECT
    algorithm,
    key,
    label,
    ROUND(average::numeric, 1)::float AS average,
    answers,
    CASE WHEN from_top <= strongest_count THEN 'strongest' ELSE 'weakest' END AS side,
    CASE WHEN from_top <= strongest_count THEN from_top ELSE from_bottom END AS position
FROM ranked
WHERE from_top <= strongest_count OR from_bottom <= $4
ORDER BY algorithm, side, position
"""


async def fetch_competency_signals(
    *, timezone_name: str, tag_slugs: dict[str, str], per_side: int = 3
) -> list[CompetencySignalRow]:
    """Per algorithm, the ``per_side`` signals with the highest and the lowest all-time average."""
    tags = list(tag_slugs)
    async with acquire_connection() as conn:
        rows = await conn.fetch(_COMPETENCY_SIGNALS_SQL, timezone_name, tags, [tag_slugs[tag] for tag in tags], per_side)
    return [cast(CompetencySignalRow, dict(row)) for row in rows]


async def fetch_history_day_rows(day_start: datetime, day_end: datetime) -> list[dict[str, Any]]:
    """Every daily-work submission created in [day_start, day_end), oldest first, with MCQ choices
    and the LLM exchanges that generated the MCQ."""
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
                q.choices AS multiple_choice_choices,
                q.correct_choice_id AS multiple_choice_correct_choice_id,
                q.generation_trace AS multiple_choice_generation_trace
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
