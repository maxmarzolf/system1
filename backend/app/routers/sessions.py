from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query

from app.database import get_pool
from app.models import (
    System1SessionActivityResponse,
    System1SessionCreate,
    System1SessionSavedResponse,
)

router = APIRouter(prefix="/api", tags=["system1-sessions"])


def _safe_parse_iso(timestamp: str | None, fallback: datetime) -> datetime:
    if not timestamp:
        return fallback
    try:
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    except ValueError:
        return fallback


@router.post("/system1-sessions", status_code=201, response_model=System1SessionSavedResponse)
async def create_system1_session(body: System1SessionCreate):
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)
    started_at = _safe_parse_iso(body.startedAt, now)
    completed_at = _safe_parse_iso(body.completedAt, now)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO system1_sessions
                (mode, question_type, order_type, card_count, attempts, correct_count,
                 accuracy, duration_ms, total_score, avg_automaticity, started_at, completed_at, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING id
            """,
            body.mode.value,
            body.questionType,
            body.orderType,
            body.cardCount,
            body.attempts,
            body.correctCount,
            body.accuracy,
            body.durationMs,
            body.totalScore,
            body.avgAutomaticity,
            started_at,
            completed_at,
            now,
        )

    return {"saved": True, "sessionId": row["id"]}


@router.get("/system1-session-activity", response_model=System1SessionActivityResponse)
async def system1_session_activity(days: int = Query(default=365, ge=1, le=730)):
    pool = get_pool()

    async with pool.acquire() as conn:
        summary_row = await conn.fetchrow(
            """
            SELECT
                COUNT(*) AS total_sessions,
                COALESCE(ROUND(AVG(accuracy)::numeric, 1), 0) AS avg_accuracy,
                COALESCE(ROUND(AVG(duration_ms)::numeric, 0), 0) AS avg_duration_ms,
                COALESCE(ROUND(AVG(total_score)::numeric, 1), 0) AS avg_score,
                COALESCE(MAX(accuracy), 0) AS best_accuracy,
                COALESCE(MAX(total_score), 0) AS best_score
            FROM system1_sessions
            """
        )

        by_day_rows = await conn.fetch(
            """
            SELECT
                completed_at::date AS date,
                COUNT(*) AS sessions,
                ROUND(AVG(accuracy)::numeric, 1) AS avg_accuracy,
                ROUND(AVG(total_score)::numeric, 1) AS avg_score,
                ROUND(AVG(duration_ms)::numeric, 0) AS avg_duration_ms
            FROM system1_sessions
            WHERE completed_at >= CURRENT_DATE - ($1 || ' days')::interval
            GROUP BY completed_at::date
            ORDER BY date ASC
            """,
            str(days),
        )

        by_mode_rows = await conn.fetch(
            """
            SELECT
                mode,
                COUNT(*) AS sessions,
                ROUND(AVG(accuracy)::numeric, 1) AS avg_accuracy,
                ROUND(AVG(total_score)::numeric, 1) AS avg_score
            FROM system1_sessions
            GROUP BY mode
            """
        )

        recent_rows = await conn.fetch(
            """
            SELECT
                id,
                mode,
                question_type,
                order_type,
                card_count,
                attempts,
                correct_count,
                accuracy,
                duration_ms,
                total_score,
                avg_automaticity,
                started_at,
                completed_at,
                created_at
            FROM system1_sessions
            ORDER BY completed_at DESC, created_at DESC
            LIMIT 20
            """
        )

    by_mode = {
        r["mode"]: {
            "sessions": int(r["sessions"]),
            "avg_accuracy": float(r["avg_accuracy"] or 0),
            "avg_score": float(r["avg_score"] or 0),
        }
        for r in by_mode_rows
    }

    by_day = [
        {
            "date": r["date"].isoformat(),
            "sessions": int(r["sessions"]),
            "avg_accuracy": float(r["avg_accuracy"] or 0),
            "avg_score": float(r["avg_score"] or 0),
            "avg_duration_ms": int(r["avg_duration_ms"] or 0),
        }
        for r in by_day_rows
    ]

    return {
        "summary": {
            "total_sessions": int(summary_row["total_sessions"]),
            "avg_accuracy": float(summary_row["avg_accuracy"]),
            "avg_duration_ms": int(summary_row["avg_duration_ms"]),
            "avg_score": float(summary_row["avg_score"]),
            "best_accuracy": float(summary_row["best_accuracy"]),
            "best_score": int(summary_row["best_score"]),
        },
        "byDay": by_day,
        "byMode": by_mode,
        "recent": [dict(r) for r in recent_rows],
    }
