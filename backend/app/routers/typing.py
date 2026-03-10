from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query

from app.database import get_pool
from app.models import (
    TypingActivityResponse,
    TypingSessionCreate,
    TypingSessionSavedResponse,
)

router = APIRouter(prefix="/api", tags=["typing"])


@router.post(
    "/typing-sessions", status_code=201, response_model=TypingSessionSavedResponse
)
async def create_typing_session(body: TypingSessionCreate):
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO typing_sessions
                (card_id, card_title, question_type, category_tags,
                 correct, accuracy, wpm, score,
                 elapsed_ms, mistakes, backspaces, chars_typed, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING id
            """,
            body.cardId,
            body.cardTitle,
            body.questionType,
            body.categoryTags,
            1 if body.correct else 0,
            body.accuracy,
            body.wpm,
            body.score,
            body.elapsedMs,
            body.mistakes,
            body.backspaces,
            body.charsTyped,
            now,
        )

    return {"saved": True, "sessionId": row["id"]}


@router.get("/typing-activity", response_model=TypingActivityResponse)
async def typing_activity(days: int = Query(default=365, ge=1, le=730)):
    pool = get_pool()

    async with pool.acquire() as conn:
        activity_rows = await conn.fetch(
            """
            SELECT
                created_at::date AS day,
                COUNT(*)          AS sessions,
                SUM(elapsed_ms)   AS total_ms,
                ROUND(AVG(accuracy)::numeric, 1) AS avg_accuracy,
                ROUND(AVG(wpm)::numeric, 1)      AS avg_wpm,
                SUM(chars_typed)  AS total_chars,
                SUM(correct)      AS correct_count,
                STRING_AGG(DISTINCT question_type, ',') AS question_types,
                STRING_AGG(DISTINCT category_tags, ',') AS category_tags
            FROM typing_sessions
            WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
            GROUP BY created_at::date
            ORDER BY day ASC
            """,
            str(days),
        )

        summary_row = await conn.fetchrow(
            """
            SELECT
                COUNT(*)                              AS total_sessions,
                COALESCE(SUM(elapsed_ms), 0)          AS total_ms,
                COALESCE(SUM(chars_typed), 0)         AS total_chars,
                COALESCE(ROUND(AVG(accuracy)::numeric, 1), 0) AS avg_accuracy,
                COALESCE(ROUND(AVG(wpm)::numeric, 1), 0)      AS avg_wpm,
                COALESCE(SUM(correct), 0)             AS total_correct,
                COALESCE(MAX(score), 0)               AS best_score,
                COALESCE(MAX(wpm), 0)                 AS best_wpm
            FROM typing_sessions
            """
        )

        recent_rows = await conn.fetch(
            """
            SELECT
                id, card_id, card_title, question_type, category_tags,
                correct, accuracy, wpm, score, elapsed_ms,
                mistakes, backspaces, chars_typed, created_at
            FROM typing_sessions
            ORDER BY created_at DESC
            LIMIT 15
            """
        )

        streak_row = await conn.fetchrow(
            """
            WITH RECURSIVE days_with_sessions AS (
                SELECT DISTINCT created_at::date AS day
                FROM typing_sessions
            ),
            streak AS (
                SELECT CURRENT_DATE AS d,
                       EXISTS (SELECT 1 FROM days_with_sessions WHERE day = CURRENT_DATE) AS has_session
                UNION ALL
                SELECT (d - INTERVAL '1 day')::date,
                       EXISTS (SELECT 1 FROM days_with_sessions WHERE day = (d - INTERVAL '1 day')::date)
                FROM streak
                WHERE has_session AND d > CURRENT_DATE - INTERVAL '365 days'
            )
            SELECT COUNT(*) - 1 AS streak_days
            FROM streak
            WHERE has_session
            """
        )

    activity = [
        {
            "day": r["day"].isoformat(),
            "sessions": int(r["sessions"]),
            "total_ms": int(r["total_ms"] or 0),
            "avg_accuracy": float(r["avg_accuracy"] or 0),
            "avg_wpm": float(r["avg_wpm"] or 0),
            "total_chars": int(r["total_chars"] or 0),
            "correct_count": int(r["correct_count"] or 0),
            "question_types": r["question_types"] or "",
            "category_tags": r["category_tags"] or "",
        }
        for r in activity_rows
    ]

    summary = {
        "total_sessions": int(summary_row["total_sessions"]),
        "total_ms": int(summary_row["total_ms"]),
        "total_chars": int(summary_row["total_chars"]),
        "avg_accuracy": float(summary_row["avg_accuracy"]),
        "avg_wpm": float(summary_row["avg_wpm"]),
        "total_correct": int(summary_row["total_correct"]),
        "best_score": int(summary_row["best_score"]),
        "best_wpm": int(summary_row["best_wpm"]),
    }

    recent = [dict(r) for r in recent_rows]
    streak = int(streak_row["streak_days"]) if streak_row else 0

    return {
        "activity": activity,
        "summary": summary,
        "recent": recent,
        "streak": streak,
    }
