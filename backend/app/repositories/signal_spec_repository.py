from __future__ import annotations

from typing import cast

from app.repositories.base import acquire_connection
from app.repositories.types import AlgorithmSignalSpecRow


async def fetch_algorithm_signal_spec(
    problem_slugs: list[str],
    algorithm_slug: str,
) -> AlgorithmSignalSpecRow | None:
    """Return the algorithm row owning the first matching problem, else the
    row for ``algorithm_slug``."""
    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT slug, signal_spec
            FROM (
                SELECT a.slug, a.signal_spec, 0 AS priority
                FROM problem p
                JOIN algorithm a ON a.slug = p.algorithm_slug
                WHERE p.slug = ANY($1::text[])
                UNION ALL
                SELECT a.slug, a.signal_spec, 1 AS priority
                FROM algorithm a
                WHERE a.slug = $2
            ) candidates
            ORDER BY priority
            LIMIT 1
            """,
            [slug for slug in problem_slugs if slug],
            algorithm_slug,
        )
    return cast(AlgorithmSignalSpecRow, dict(row)) if row else None
