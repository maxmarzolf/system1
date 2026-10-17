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
                session_id,
                interaction_id,
                multiple_choice_problem_id,
                modality,
                signals->'modality'->>'kind' AS modality_signal_kind,
                (signals->>'elapsed_ms')::int AS elapsed_ms,
                signals->'evaluation'->'signalSpec'->>'algorithm' AS signal_spec_algorithm
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
                    "sessionId": "flow-session-itest",
                    "interactionId": "interaction-itest",
                    "modality": "mcq",
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

    assert submission["session_id"] == "flow-session-itest"
    assert submission["interaction_id"] == "interaction-itest"
    assert submission["multiple_choice_problem_id"] == question_id
    assert submission["modality"] == "mcq"
    assert submission["modality_signal_kind"] == "mcq"
    assert submission["elapsed_ms"] == 725
    assert submission["signal_spec_algorithm"] == "dynamic-programming"


def _post_mcq_attempt(client: TestClient, question_id: str, algorithm_tag: str):
    return client.post(
        "/api/attempts",
        json={
            "cardId": question_id,
            "generatedCardId": question_id,
            "question": "Which step comes next?",
            "questionType": "skill-map-mcq:algorithm:random",
            "categoryTags": ["skill-map", "skill-map-mcq", algorithm_tag],
            "correctAnswer": "A. Shrink",
            "userAnswer": "A. Shrink",
            "mode": "main-recall",
            "modality": "mcq",
        },
    )


@pytest.mark.integration
def test_signal_spec_is_stored_per_algorithm_and_read_back_through_history() -> None:
    token = uuid4().hex[:12]
    window_id = f"mcq-itest-window-{token}"
    search_id = f"mcq-itest-search-{token}"
    try:
        with TestClient(create_app()) as client:
            window_response = _post_mcq_attempt(client, window_id, "sliding-window")
            search_response = _post_mcq_attempt(client, search_id, "binary-search")
            history = client.post(
                "/api/coach/history",
                json={"cardId": window_id, "questionType": "skill-map-mcq:algorithm:random", "skillTags": ["sliding-window"]},
            )
    except Exception as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert window_response.status_code == 201, window_response.text
    assert search_response.status_code == 201, search_response.text
    window_attempt = int(window_response.json()["attemptId"])
    window = asyncio.run(_read_and_cleanup(window_attempt, window_id))
    search = asyncio.run(_read_and_cleanup(int(search_response.json()["attemptId"]), search_id))

    assert window["signal_spec_algorithm"] == "sliding-window"
    assert search["signal_spec_algorithm"] == "binary-search"
    assert history.status_code == 200, history.text
    entries = [entry for entry in history.json()["entries"] if entry["attemptId"] == window_attempt]
    assert entries
    assert entries[0]["signals"]["evaluation"]["signalSpec"] == {"algorithm": "sliding-window", "version": 1}
