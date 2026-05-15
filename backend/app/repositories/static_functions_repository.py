from __future__ import annotations

from typing import cast

from app.repositories.base import acquire_connection
from app.repositories.types import StaticFunctionPracticeRow


async def fetch_static_function_practice_rows(pattern_slug: str) -> list[StaticFunctionPracticeRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM (
                SELECT DISTINCT ON (sf.name)
                    sf.name,
                    sf.title,
                    sf.difficulty,
                    sf.description,
                    sf.code,
                    sf.tags,
                    sf.leetcode_examples,
                    sfm.pattern_slug,
                    sfp.name AS pattern_name,
                    sf.display_order
                FROM static_functions sf
                JOIN static_function_skill_map sfm
                    ON sfm.function_name = sf.name
                JOIN static_function_patterns sfp
                    ON sfp.pattern_slug = sfm.pattern_slug
                WHERE sfm.pattern_slug = $1
                ORDER BY sf.name, sfm.display_order ASC
            ) rows
            ORDER BY display_order ASC
            """,
            pattern_slug,
        )
    return [cast(StaticFunctionPracticeRow, dict(row)) for row in rows]


async def fetch_random_static_function_practice_rows(count: int) -> list[StaticFunctionPracticeRow]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM (
                SELECT DISTINCT ON (sf.name)
                    sf.name,
                    sf.title,
                    sf.difficulty,
                    sf.description,
                    sf.code,
                    sf.tags,
                    sf.leetcode_examples,
                    sfm.pattern_slug,
                    sfp.name AS pattern_name,
                    sf.display_order
                FROM static_functions sf
                JOIN static_function_skill_map sfm
                    ON sfm.function_name = sf.name
                JOIN static_function_patterns sfp
                    ON sfp.pattern_slug = sfm.pattern_slug
                ORDER BY sf.name, sfm.display_order ASC
            ) rows
            ORDER BY random()
            LIMIT $1
            """,
            count,
        )
    return [cast(StaticFunctionPracticeRow, dict(row)) for row in rows]
