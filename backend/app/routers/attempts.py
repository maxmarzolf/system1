from __future__ import annotations

import json as _json
from datetime import datetime, timezone

from fastapi import APIRouter

from app.database import get_pool
from app.models import AttemptCreate, SkillMapNode

router = APIRouter(prefix="/api", tags=["attempts"])


@router.post("/attempts", status_code=201)
async def create_attempt(body: AttemptCreate):
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO score_attempts
                (card_id, card_title, question, question_type, category_tags, options,
                 correct_answer, user_answer, mode, correct, accuracy, exact, elapsed_ms,
                 interaction_id, generated_card_id, generated_card, coach_feedback, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
            RETURNING id
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
            body.interactionId,
            body.generatedCardId,
            _json.dumps(body.generatedCard) if body.generatedCard else None,
            _json.dumps(body.coachFeedback) if body.coachFeedback else None,
            now,
            now,
        )

    return {"saved": True, "attemptId": row["id"] if row else None}


@router.get("/skill-map", response_model=list[SkillMapNode])
async def get_skill_map():
    pool = get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                p.id AS pattern_id,
                p.name AS pattern_name,
                m.id AS method_id,
                m.name AS method_name
            FROM patterns p
            LEFT JOIN methods m ON m.pattern_id = p.id
            ORDER BY p.id ASC, m.id ASC
            """
        )

    grouped: dict[int, SkillMapNode] = {}
    for row in rows:
        pattern_id = int(row["pattern_id"])
        pattern_name = str(row["pattern_name"])
        method_name = row["method_name"]

        if pattern_id not in grouped:
            grouped[pattern_id] = SkillMapNode(pattern=pattern_name, methods=[])

        if method_name:
            grouped[pattern_id].methods.append(str(method_name))

    return list(grouped.values())
