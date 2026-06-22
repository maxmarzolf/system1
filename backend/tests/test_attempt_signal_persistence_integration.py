from __future__ import annotations

import asyncio
from uuid import uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app


async def _read_and_cleanup(attempt_id: int, question_id: str) -> tuple[asyncpg.Record, asyncpg.Record, asyncpg.Record]:
    conn = await asyncpg.connect(settings.database_url)
    try:
        mcq = await conn.fetchrow("SELECT * FROM answer_mcq_detail WHERE answer_id = $1", attempt_id)
        evidence = await conn.fetchrow("SELECT * FROM answer_skill_evidence WHERE answer_id = $1", attempt_id)
        misconception = await conn.fetchrow("SELECT * FROM answer_misconception WHERE answer_id = $1", attempt_id)
        await conn.execute("DELETE FROM answer WHERE id = $1", attempt_id)
        await conn.execute("DELETE FROM question WHERE id = $1", question_id)
        assert mcq is not None
        assert evidence is not None
        assert misconception is not None
        return mcq, evidence, misconception
    finally:
        await conn.close()


@pytest.mark.integration
def test_mcq_attempt_persists_reasoning_evidence_and_hybrid_misconception() -> None:
    token = uuid4().hex[:12]
    question_id = f"itest-signal-{token}"
    try:
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/attempts",
                json={
                    "cardId": question_id,
                    "generatedCardId": question_id,
                    "question": "Which state is sufficient?",
                    "questionType": "skill-map-mcq:algorithm:random",
                    "categoryTags": ["skill-map", "skill-map-mcq", "dynamic-programming", "state-definition"],
                    "correctAnswer": "C. Best prefix result",
                    "userAnswer": "B. Current value",
                    "mode": "main-recall",
                    "correct": False,
                    "activityFormat": "multiple-choice",
                    "targetSource": "skill-map",
                    "targetControl": "user",
                    "formatControl": "user",
                    "mcqDetail": {
                        "selectedChoiceLabel": "B",
                        "correctChoiceLabel": "C",
                        "reasoning": "Only the current value is needed.",
                    },
                    "skillEvidence": [{
                        "patternSlug": "dynamic-programming",
                        "skillSlug": "state-definition",
                        "evidenceScore": 0,
                        "confidence": 0.95,
                        "evidenceSource": "mcq-with-reasoning",
                    }],
                    "misconceptionSignals": [{
                        "patternSlug": "dynamic-programming",
                        "skillSlug": "state-definition",
                        "misconceptionTag": "insufficient-state",
                        "evaluatorNote": "The proposed state drops prior decisions.",
                        "confidence": 0.9,
                        "detectedBy": "reasoning-evaluator",
                    }],
                },
            )
    except Exception as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert response.status_code == 201, response.text
    attempt_id = int(response.json()["attemptId"])
    mcq, evidence, misconception = asyncio.run(_read_and_cleanup(attempt_id, question_id))

    assert mcq["reasoning"] == "Only the current value is needed."
    assert evidence["skill_slug"] == "state-definition"
    assert evidence["evidence_source"] == "mcq-with-reasoning"
    assert misconception["misconception_tag"] == "insufficient-state"
    assert misconception["misconception_id"] is not None
