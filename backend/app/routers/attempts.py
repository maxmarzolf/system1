from __future__ import annotations

import json as _json
from datetime import datetime, timezone

from fastapi import APIRouter

from app.database import get_pool
from app.models import AttemptCreate

router = APIRouter(prefix="/api", tags=["attempts"])


@router.post("/attempts", status_code=201)
async def create_attempt(body: AttemptCreate):
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO score_attempts
                (card_id, card_title, question, question_type, category_tags, options,
                 correct_answer, user_answer, mode, correct, accuracy, exact, elapsed_ms,
                 generated_card, coach_feedback, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            """,
            body.cardId,
            body.cardTitle,
            body.question,
            body.questionType,
            body.categoryTags,
            _json.dumps(body.options) if body.options else None,
            body.correctAnswer,
            body.userAnswer,
            body.mode.value,
            body.correct,
            body.accuracy,
            body.exact,
            body.elapsedMs,
            _json.dumps(body.generatedCard) if body.generatedCard else None,
            _json.dumps(body.coachFeedback) if body.coachFeedback else None,
            now,
            now,
        )

    return {"saved": True}
