from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from uuid import uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app

# 03:30 UTC on Jan 15 is 22:30 on Jan 14 in New York.
CREATED_AT = datetime(2026, 1, 15, 3, 30, tzinfo=timezone.utc)
EVALUATION = {
    "verdict": "sound",
    "score": {"overall": 92.0},
    "signalResults": {"conceptRecognition": {"key": "conceptRecognition", "status": "scored", "score": 90.0}},
}


async def _insert_submission(problem_id: str) -> int:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(
            """
            INSERT INTO multiple_choice_problem (
                id, question_text, multiple_choice_answer_label_1, multiple_choice_answer_text_1,
                multiple_choice_answer_label_2, multiple_choice_answer_text_2,
                multiple_choice_correct_answer_label, multiple_choice_correct_answer_text, fingerprint
            )
            VALUES ($1, 'When does the window shrink?', 'A', 'While invalid', 'B', 'Never', 'A', 'While invalid', $1)
            """,
            problem_id,
        )
        return await conn.fetchval(
            """
            INSERT INTO submission (multiple_choice_problem_id, answer, question_type, category_tags, correct_answer,
                                    successful, signals, modality, created_at, updated_at)
            VALUES ($1, 'A. While invalid', 'skill-map-mcq:card:random', ARRAY['skill-map', 'sliding-window'],
                    'A. While invalid', TRUE, $2::jsonb, 'mcq', $3, $3)
            RETURNING id
            """,
            problem_id,
            json.dumps({"elapsed_ms": 4200, "evaluation": EVALUATION}),
            CREATED_AT,
        )
    finally:
        await conn.close()


async def _cleanup(problem_id: str) -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("DELETE FROM submission WHERE multiple_choice_problem_id = $1", problem_id)
        await conn.execute("DELETE FROM multiple_choice_problem WHERE id = $1", problem_id)
    finally:
        await conn.close()


@pytest.mark.integration
def test_history_day_lists_the_days_submissions_in_the_viewers_timezone() -> None:
    problem_id = f"mcq-itest-history-{uuid4().hex[:12]}"
    try:
        submission_id = asyncio.run(_insert_submission(problem_id))
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")
    try:
        with TestClient(create_app()) as client:
            new_york_14 = client.get("/api/history/day", params={"date": "2026-01-14", "tz": "America/New_York"})
            new_york_15 = client.get("/api/history/day", params={"date": "2026-01-15", "tz": "America/New_York"})
            utc_15 = client.get("/api/history/day", params={"date": "2026-01-15"})
            bad_date = client.get("/api/history/day", params={"date": "not-a-date"})
    finally:
        asyncio.run(_cleanup(problem_id))

    def ids(response):
        assert response.status_code == 200, response.text
        return [submission["id"] for submission in response.json()["submissions"]]

    assert submission_id in ids(new_york_14)
    assert submission_id not in ids(new_york_15)
    assert submission_id in ids(utc_15)
    assert bad_date.status_code == 422
    submission = next(item for item in new_york_14.json()["submissions"] if item["id"] == submission_id)
    assert submission["modality"] == "mcq"
    assert submission["question"] == "When does the window shrink?"
    assert submission["choices"] == [
        {"id": "A", "text": "While invalid", "correct": True},
        {"id": "B", "text": "Never", "correct": False},
    ]
    assert submission["userAnswer"] == "A. While invalid"
    assert submission["elapsedMs"] == 4200
    assert submission["algorithms"] == [{"slug": "sliding-window", "algorithm": "Sliding Window"}]
    assert submission["evaluation"]["signalResults"]["conceptRecognition"]["score"] == 90.0
