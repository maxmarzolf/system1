from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
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


GENERATION_TRACE = [{"attempt": 1, "provider": "claude", "model": "claude-fast", "systemPrompt": "write", "ok": True}]


async def _insert_submission(problem_id: str) -> int:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(
            """
            INSERT INTO multiple_choice_problem (id, question_text, choices, correct_choice_id, fingerprint, generation_trace)
            VALUES ($1, 'When does the window shrink?', '[{"id": "A", "text": "While invalid"}, {"id": "B", "text": "Never"}]'::jsonb, 'A', $1, $2::jsonb)
            """,
            problem_id,
            json.dumps(GENERATION_TRACE),
        )
        return await conn.fetchval(
            """
            INSERT INTO submission (multiple_choice_problem_id, answer, category_tags, correct_answer,
                                    successful, signals, modality, created_at)
            VALUES ($1, 'A. While invalid', ARRAY['skill-map', 'sliding-window'],
                    'A. While invalid', TRUE, $2::jsonb, 'mcq', $3)
            RETURNING id
            """,
            problem_id,
            json.dumps({"elapsed_ms": 4200, "evaluation": EVALUATION}),
            CREATED_AT,
        )
    finally:
        await conn.close()


async def _insert_recent(problem_id: str) -> tuple[int, int]:
    """Two answers from an hour ago under the same marker: one sliding window, and one tagged heap
    first and sliding window second (it counts toward heap only)."""
    conn = await asyncpg.connect(settings.database_url)
    try:
        ids = []
        for tags in (["skill-map", "sliding-window"], ["skill-map", "heap", "sliding-window"]):
            ids.append(await conn.fetchval(
                """
                INSERT INTO submission (multiple_choice_problem_id, answer, category_tags, successful,
                                        signals, modality, created_at)
                VALUES ($1, 'x', $2, FALSE, '{"elapsed_ms": 1}'::jsonb, 'mcq', $3)
                RETURNING id
                """,
                problem_id, tags, datetime.now(timezone.utc) - timedelta(hours=1),
            ))
        return ids[0], ids[1]
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
def test_history_submissions_by_day_algorithm_or_both() -> None:
    problem_id = f"mcq-itest-history-{uuid4().hex[:12]}"
    try:
        submission_id = asyncio.run(_insert_submission(problem_id))
        window_id, heap_id = asyncio.run(_insert_recent(problem_id))
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")
    try:
        with TestClient(create_app()) as client:
            new_york_14 = client.get("/api/history/submissions", params={"date": "2026-01-14", "tz": "America/New_York"})
            new_york_15 = client.get("/api/history/submissions", params={"date": "2026-01-15", "tz": "America/New_York"})
            utc_15 = client.get("/api/history/submissions", params={"date": "2026-01-15"})
            bad_date = client.get("/api/history/submissions", params={"date": "not-a-date"})
            filtered_day = client.get("/api/history/submissions", params={"date": "2026-01-14", "tz": "America/New_York", "algorithm": "heap"})
            windows = client.get("/api/history/submissions", params={"algorithm": ["sliding-window", "sliding-window"]})
            either = client.get("/api/history/submissions", params={"algorithm": ["sliding-window", "heap"]})
            nothing = client.get("/api/history/submissions")
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
    assert submission["generationTrace"] == GENERATION_TRACE
    assert submission["date"] == "2026-01-14"  # the day in the requested time zone
    assert new_york_14.json()["date"] == "2026-01-14" and new_york_14.json()["algorithms"] == []

    # A day narrowed to an algorithm it didn't have.
    assert submission_id not in ids(filtered_day)
    assert filtered_day.json()["algorithms"] == ["heap"]

    # Algorithms without a day: the last year, deduplicated, newest first, any of them.
    assert window_id in ids(windows) and heap_id not in ids(windows)
    assert windows.json()["date"] is None and windows.json()["algorithms"] == ["sliding-window"]
    assert {window_id, heap_id} <= set(ids(either))
    heap_answer = next(item for item in either.json()["submissions"] if item["id"] == heap_id)
    assert heap_answer["algorithms"] == [{"slug": "heap", "algorithm": "Heap / Priority Queue"}]
    dates = [item["createdAt"] for item in either.json()["submissions"]]
    assert dates == sorted(dates, reverse=True)

    # Neither: nothing to show.
    assert nothing.json() == {"date": None, "algorithms": [], "submissions": []}
