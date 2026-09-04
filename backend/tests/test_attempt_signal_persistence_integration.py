from __future__ import annotations

import asyncio
from uuid import uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app


async def _read_and_cleanup(attempt_id: int, question_id: str) -> asyncpg.Record:
    conn = await asyncpg.connect(settings.database_url)
    try:
        submission = await conn.fetchrow(
            """
            SELECT
                multiple_choice_problem_id,
                activity_format,
                (signals->>'elapsed_ms')::int AS elapsed_ms,
                EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'submission' AND column_name = 'signals'
                ) AS has_signals,
                EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'submission'
                      AND column_name = ANY(ARRAY['is_correct', 'exact', 'elapsed_ms', 'coach_feedback', 'submission_rubric'])
                ) AS has_legacy_columns
            FROM submission
            WHERE id = $1
            """,
            attempt_id,
        )
        await conn.execute("DELETE FROM submission WHERE id = $1", attempt_id)
        await conn.execute("DELETE FROM multiple_choice_problem WHERE id = $1", question_id)
        assert submission is not None
        return submission
    finally:
        await conn.close()


@pytest.mark.integration
def test_mcq_attempt_persists_multiple_choice_problem_link() -> None:
    token = uuid4().hex[:12]
    question_id = f"mcq-itest-signal-{token}"
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
                    "elapsedMs": 725,
                    "activityFormat": "multiple-choice",
                    "targetSource": "skill-map",
                    "targetControl": "user",
                    "formatControl": "user",
                },
            )
    except Exception as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert response.status_code == 201, response.text
    attempt_id = int(response.json()["attemptId"])
    submission = asyncio.run(_read_and_cleanup(attempt_id, question_id))

    assert submission["multiple_choice_problem_id"] == question_id
    assert submission["activity_format"] == "multiple-choice"
    assert submission["elapsed_ms"] == 725
    assert submission["has_signals"] is True
    assert submission["has_legacy_columns"] is False
