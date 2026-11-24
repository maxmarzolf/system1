from __future__ import annotations

from app.repositories.base import acquire_connection

PRACTICE_HISTORY_TABLES = [
    "submission",
    "submission_evaluation",
    "submission_signal",
    "generated problem rows",
]


async def count_practice_history_rows() -> dict[str, int]:
    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                (SELECT COUNT(*)::int FROM submission) AS submission,
                (SELECT COUNT(*)::int FROM submission_evaluation) AS submission_evaluation,
                (SELECT COUNT(*)::int FROM submission_signal) AS submission_signal,
                (SELECT COUNT(*)::int FROM problem WHERE source_type = 'generated-llm') AS generated_problems
            """
        )

    if not row:
        return {table: 0 for table in PRACTICE_HISTORY_TABLES}

    return {
        "submission": int(row["submission"] or 0),
        "submission_evaluation": int(row.get("submission_evaluation") or 0),
        "submission_signal": int(row.get("submission_signal") or 0),
        "generated_problems": int(row["generated_problems"] or 0),
    }


async def truncate_practice_history_tables() -> None:
    async with acquire_connection() as conn:
        async with conn.transaction():
            # The evaluation and signal rows belong to submissions; clear them together.
            await conn.execute("TRUNCATE TABLE submission_signal, submission_evaluation, submission RESTART IDENTITY")
            await conn.execute("DELETE FROM problem WHERE source_type = 'generated-llm'")
