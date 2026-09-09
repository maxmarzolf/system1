from __future__ import annotations

from app.repositories.base import acquire_connection

PRACTICE_HISTORY_TABLES = [
    "submission",
    "generated problem rows",
]


async def count_practice_history_rows() -> dict[str, int]:
    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                (SELECT COUNT(*)::int FROM submission) AS submission,
                (SELECT COUNT(*)::int FROM problem WHERE source_type = 'generated-llm') AS generated_problems
            """
        )

    if not row:
        return {table: 0 for table in PRACTICE_HISTORY_TABLES}

    return {
        "submission": int(row["submission"] or 0),
        "generated_problems": int(row["generated_problems"] or 0),
    }


async def truncate_practice_history_tables() -> None:
    async with acquire_connection() as conn:
        async with conn.transaction():
            await conn.execute("TRUNCATE TABLE submission RESTART IDENTITY")
            await conn.execute("DELETE FROM problem WHERE source_type = 'generated-llm'")
