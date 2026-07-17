from __future__ import annotations

from typing import cast

from app.repositories.base import acquire_connection
from app.repositories.types import ProblemPracticeRow

_PROBLEM_PRACTICE_SELECT = """
    SELECT
        p.slug,
        p.title,
        p.difficulty,
        p.description,
        p.code,
        p.tags,
        p.leetcode_examples,
        p.algorithm_slug,
        a.name AS algorithm_name,
        COALESCE(tech.slugs, '{}') AS technique_slugs,
        COALESCE(sk.slugs, '{}') AS skill_slugs,
        p.display_order
    FROM problem p
    JOIN algorithm a ON a.slug = p.algorithm_slug
    LEFT JOIN LATERAL (
        SELECT array_agg(pt.technique_slug ORDER BY pt.display_order, pt.technique_slug) AS slugs
        FROM problem_technique pt
        WHERE pt.problem_slug = p.slug
    ) tech ON TRUE
    LEFT JOIN LATERAL (
        SELECT array_agg(ps.skill_slug ORDER BY ps.display_order, ps.skill_slug) AS slugs
        FROM problem_skill ps
        WHERE ps.problem_slug = p.slug
    ) sk ON TRUE
"""


async def fetch_problem_practice_rows(algorithm_slug: str) -> list[ProblemPracticeRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            {_PROBLEM_PRACTICE_SELECT}
            WHERE p.algorithm_slug = $1
            ORDER BY p.display_order ASC
            """,
            algorithm_slug,
        )
    return [cast(ProblemPracticeRow, dict(row)) for row in rows]


async def fetch_problem_practice_rows_by_technique(technique_slug: str) -> list[ProblemPracticeRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            {_PROBLEM_PRACTICE_SELECT}
            WHERE EXISTS (
                SELECT 1
                FROM problem_technique pt2
                WHERE pt2.problem_slug = p.slug
                  AND pt2.technique_slug = $1
            )
            ORDER BY p.display_order ASC
            """,
            technique_slug,
        )
    return [cast(ProblemPracticeRow, dict(row)) for row in rows]


async def fetch_problem_practice_rows_by_tag(tag_slug: str, count: int) -> list[ProblemPracticeRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            {_PROBLEM_PRACTICE_SELECT}
            WHERE p.tags && ARRAY[$1]::text[]
            ORDER BY p.display_order ASC
            LIMIT $2
            """,
            tag_slug,
            count,
        )
    return [cast(ProblemPracticeRow, dict(row)) for row in rows]


async def fetch_random_problem_practice_rows(count: int) -> list[ProblemPracticeRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            {_PROBLEM_PRACTICE_SELECT}
            ORDER BY random()
            LIMIT $1
            """,
            count,
        )
    return [cast(ProblemPracticeRow, dict(row)) for row in rows]
