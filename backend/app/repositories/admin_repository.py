from __future__ import annotations

from app.repositories.base import acquire_connection

PRACTICE_HISTORY_TABLES = [
    "submission",
    "generated_skill_map_cards",
]


async def count_practice_history_rows() -> dict[str, int]:
    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                (SELECT COUNT(*)::int FROM submission) AS submission,
                (SELECT COUNT(*)::int FROM generated_skill_map_cards) AS generated_skill_map_cards
            """
        )

    if not row:
        return {table: 0 for table in PRACTICE_HISTORY_TABLES}

    return {
        "submission": int(row["submission"] or 0),
        "generated_skill_map_cards": int(row["generated_skill_map_cards"] or 0),
    }


async def truncate_practice_history_tables() -> None:
    async with acquire_connection() as conn:
        await conn.execute(
            "TRUNCATE TABLE submission, generated_skill_map_cards RESTART IDENTITY"
        )
