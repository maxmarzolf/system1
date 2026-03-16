from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.database import get_pool
from app.models import StatsResponse

router = APIRouter(prefix="/api", tags=["stats"])

_MODE_KEYS = ("main-recall", "snap-classify", "template-hunt", "gut-check", "no-go-trap", "near-miss-duel", "multiple-choice", "full-solution", "typing-race")


def _mode_stats_default() -> dict[str, dict[str, int]]:
    return {k: {"correct": 0, "incorrect": 0, "attempts": 0, "accuracy": 0} for k in _MODE_KEYS}


async def get_stats() -> dict[str, Any]:
    """Build the aggregated stats payload.

    Exposed as a plain function so other routers (e.g. attempts) can reuse it.
    """
    pool = get_pool()

    async with pool.acquire() as conn:
        totals_row = await conn.fetchrow(
            """
            SELECT
                COUNT(*)                                   AS attempts,
                SUM(CASE WHEN correct THEN 1 ELSE 0 END)  AS correct,
                SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) AS incorrect
            FROM score_attempts
            """
        )

        by_mode_rows = await conn.fetch(
            """
            SELECT
                mode,
                COUNT(*)                                   AS attempts,
                SUM(CASE WHEN correct THEN 1 ELSE 0 END)  AS correct,
                SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) AS incorrect
            FROM score_attempts
            GROUP BY mode
            """
        )

        by_day_rows = await conn.fetch(
            """
            SELECT
                created_at::date AS date,
                COUNT(*)                                   AS attempts,
                SUM(CASE WHEN correct THEN 1 ELSE 0 END)  AS correct,
                SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) AS incorrect
            FROM score_attempts
            WHERE created_at >= CURRENT_DATE - INTERVAL '365 days'
            GROUP BY created_at::date
            ORDER BY date ASC
            """
        )

        recent_rows = await conn.fetch(
            """
            SELECT
                card_id    AS "cardId",
                mode,
                correct,
                created_at AS "timestamp"
            FROM score_attempts
            ORDER BY created_at DESC
            LIMIT 10
            """
        )

    # totals
    a = int(totals_row["attempts"])
    c = int(totals_row["correct"])
    totals = {
        "correct": c,
        "incorrect": int(totals_row["incorrect"]),
        "attempts": a,
        "accuracy": round(c / a * 100) if a else 0,
    }

    # by mode
    by_mode = _mode_stats_default()
    for r in by_mode_rows:
        key = r["mode"]
        if key in by_mode:
            ma, mc = int(r["attempts"]), int(r["correct"])
            by_mode[key] = {
                "correct": mc,
                "incorrect": int(r["incorrect"]),
                "attempts": ma,
                "accuracy": round(mc / ma * 100) if ma else 0,
            }

    # by day
    by_day = []
    for r in by_day_rows:
        da, dc = int(r["attempts"]), int(r["correct"])
        by_day.append({
            "date": r["date"].isoformat(),
            "correct": dc,
            "incorrect": int(r["incorrect"]),
            "attempts": da,
            "accuracy": round(dc / da * 100) if da else 0,
        })

    # recent
    recent = [
        {
            "cardId": r["cardId"],
            "mode": r["mode"],
            "correct": r["correct"],
            "timestamp": r["timestamp"].isoformat(),
        }
        for r in recent_rows
    ]

    return {"totals": totals, "byMode": by_mode, "byDay": by_day, "recent": recent}


@router.get("/stats", response_model=StatsResponse)
async def stats():
    return await get_stats()
