from __future__ import annotations

import json as _json
from datetime import datetime, timezone

from fastapi import APIRouter, Query

from app.database import get_pool
from app.models import AttemptCreate, AttemptSavedResponse, ScoreAttemptsResponse
from app.routers.stats import get_stats

router = APIRouter(prefix="/api", tags=["attempts"])


@router.post("/attempts", status_code=201, response_model=AttemptSavedResponse)
async def create_attempt(body: AttemptCreate):
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO score_attempts
                (card_id, card_title, question, options,
                 correct_answer, user_answer, mode, correct, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            """,
            body.cardId,
            body.cardTitle,
            body.question,
            _json.dumps(body.options) if body.options else None,
            body.correctAnswer,
            body.userAnswer,
            body.mode.value,
            body.correct,
            now,
        )

    stats = await get_stats()
    return {"saved": True, "stats": stats}


@router.get("/score-attempts", response_model=ScoreAttemptsResponse)
async def list_score_attempts(limit: int = Query(default=100, ge=1, le=1000)):
    pool = get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                id,
                card_id   AS "cardId",
                card_title AS "cardTitle",
                question,
                options,
                correct_answer AS "correctAnswer",
                user_answer    AS "userAnswer",
                mode,
                correct,
                created_at AS "timestamp"
            FROM score_attempts
            ORDER BY created_at DESC
            LIMIT $1
            """,
            limit,
        )

    return {"attempts": [dict(r) for r in rows]}
