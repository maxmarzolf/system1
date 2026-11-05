from __future__ import annotations

import asyncio
import json
from uuid import uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.jev import JevResponse
from app.core.signals.mcq import get_mcq_signal_spec
from app.main import create_app
from app.models import SubmissionModality
from app.services.evaluators import EVALUATORS
from app.services.evaluators.jev_mcq import JevMcqEvaluator


class _FakeJevGateway:
    """Answers every question; correctness follows ``correct_label``."""

    def __init__(self, correct_label: str):
        self.correct_label = correct_label

    async def system_one(self, state, questions):
        answers = {}
        for key, question in questions.items():
            if key == "correctness":
                answers[key] = {"type": "choice", "choice": self.correct_label, "confidence": 0.97, "probabilities": {}}
            elif question["type"] == "noul":
                answers[key] = {"type": "noul", "noul": 0.8}
            elif question["type"] == "score":
                answers[key] = {"type": "score", "score": 1.0, "confidence": 0.7}
            else:
                answers[key] = {"type": "choice", "choice": next(iter(question["criteria"])), "confidence": 0.6}
        return JevResponse(model="jev-itest", answers=answers, request_id="req-itest")


@pytest.fixture
def fake_jev(monkeypatch):
    def install(correct_label: str) -> None:
        evaluator = JevMcqEvaluator(lambda: _FakeJevGateway(correct_label))
        monkeypatch.setitem(EVALUATORS, SubmissionModality.mcq, evaluator)

    return install


async def _seed_problem(question_id: str) -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(
            """
            INSERT INTO multiple_choice_problem (
                id, question_text, multiple_choice_answer_label_1, multiple_choice_answer_text_1,
                multiple_choice_answer_label_2, multiple_choice_answer_text_2,
                multiple_choice_answer_label_3, multiple_choice_answer_text_3,
                multiple_choice_answer_label_4, multiple_choice_answer_text_4,
                multiple_choice_correct_answer_label, multiple_choice_correct_answer_text, fingerprint
            )
            VALUES ($1, 'Which state is sufficient?', 'A', 'Every subarray', 'B', 'Current value',
                    'C', 'Best prefix result', 'D', 'A sorted copy', 'C', 'Best prefix result', $1)
            """,
            question_id,
        )
    finally:
        await conn.close()


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
                successful,
                answer,
                correct_answer,
                signals->'modality'->>'kind' AS modality_signal_kind,
                (signals->>'elapsed_ms')::int AS elapsed_ms,
                signals->'evaluation' AS evaluation,
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


async def _delete_problem(question_id: str) -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("DELETE FROM multiple_choice_problem WHERE id = $1", question_id)
    finally:
        await conn.close()


def _mcq_payload(question_id: str, selected: str, algorithm_tag: str, **overrides) -> dict:
    payload = {
        "cardId": question_id,
        "generatedCardId": question_id,
        "multipleChoiceProblemId": question_id,
        "selectedChoiceId": selected,
        "questionType": "skill-map-mcq:algorithm:random",
        "categoryTags": ["skill-map", "skill-map-mcq", algorithm_tag],
        "mode": "main-recall",
        "modality": "mcq",
    }
    payload.update(overrides)
    return payload


@pytest.mark.integration
def test_mcq_attempt_is_graded_against_the_stored_answer_key(fake_jev) -> None:
    token = uuid4().hex[:12]
    question_id = f"mcq-itest-signal-{token}"
    fake_jev("0")
    try:
        asyncio.run(_seed_problem(question_id))
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/attempts",
                json=_mcq_payload(
                    question_id,
                    "B",
                    "dynamic-programming",
                    question="tampered question",
                    correctAnswer="B. Current value",
                    userAnswer="C. Best prefix result",
                    elapsedMs=725,
                    sessionId="flow-session-itest",
                    interactionId="interaction-itest",
                    targetSource="skill-map",
                    targetControl="user",
                    formatControl="user",
                    signals={"modality": {"kind": "mcq", "selectedChoiceId": "B"}},
                ),
            )
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert response.status_code == 201, response.text
    assert response.json()["successful"] is False
    attempt_id = int(response.json()["attemptId"])
    submission = asyncio.run(_read_and_cleanup(attempt_id, question_id))

    assert submission["session_id"] == "flow-session-itest"
    assert submission["interaction_id"] == "interaction-itest"
    assert submission["multiple_choice_problem_id"] == question_id
    assert submission["modality"] == "mcq"
    assert submission["modality_signal_kind"] == "mcq"
    assert submission["elapsed_ms"] == 725
    assert submission["successful"] is False
    assert submission["answer"] == "B. Current value"
    assert submission["correct_answer"] == "C. Best prefix result"
    assert submission["signal_spec_algorithm"] == "dynamic-programming"
    evaluation = json.loads(submission["evaluation"])
    assert evaluation["provenance"]["engine"] == "jev"
    assert evaluation["provenance"]["model"] == "jev-itest"
    assert evaluation["correctness"]["answerKeyAgreement"] is True
    assert evaluation["signalSpec"]["modality"] == "mcq"
    assert evaluation["signalSpecSnapshot"]["signals"]
    assert evaluation["signalResults"]["nearMiss"]["status"] == "scored"


@pytest.mark.integration
def test_mcq_attempt_with_unknown_problem_or_choice_is_rejected(fake_jev) -> None:
    token = uuid4().hex[:12]
    question_id = f"mcq-itest-reject-{token}"
    fake_jev("1")
    try:
        asyncio.run(_seed_problem(question_id))
        with TestClient(create_app()) as client:
            unknown_problem = client.post("/api/attempts", json=_mcq_payload(f"{question_id}-missing", "A", "sliding-window"))
            unknown_choice = client.post("/api/attempts", json=_mcq_payload(question_id, "Z", "sliding-window"))
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")
    finally:
        asyncio.run(_delete_problem(question_id))

    assert unknown_problem.status_code == 422
    assert unknown_problem.json()["detail"]["code"] == "mcq_unknown_problem"
    assert unknown_choice.status_code == 422
    assert unknown_choice.json()["detail"]["code"] == "mcq_unknown_choice"


@pytest.mark.integration
def test_signal_spec_is_stored_per_algorithm_and_read_back_through_history(fake_jev) -> None:
    token = uuid4().hex[:12]
    window_id = f"mcq-itest-window-{token}"
    search_id = f"mcq-itest-search-{token}"
    fake_jev("1")
    try:
        asyncio.run(_seed_problem(window_id))
        asyncio.run(_seed_problem(search_id))
        with TestClient(create_app()) as client:
            window_response = client.post("/api/attempts", json=_mcq_payload(window_id, "C", "sliding-window"))
            search_response = client.post("/api/attempts", json=_mcq_payload(search_id, "C", "binary-search"))
            history = client.post(
                "/api/coach/history",
                json={"cardId": window_id, "questionType": "skill-map-mcq:algorithm:random", "skillTags": ["sliding-window"]},
            )
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
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
    assert entries[0]["signals"]["evaluation"]["signalSpec"] == get_mcq_signal_spec("sliding-window").reference()


async def _core_problem_and_submission(attempt_id: int | None, problem_slug: str | None = None):
    conn = await asyncpg.connect(settings.database_url)
    try:
        if attempt_id is None:
            return await conn.fetchrow(
                "SELECT slug, code FROM problem WHERE source_type = 'core-catalog' ORDER BY display_order LIMIT 1"
            )
        linked = await conn.fetchval("SELECT problem_slug FROM submission WHERE id = $1", attempt_id)
        await conn.execute("DELETE FROM submission WHERE id = $1", attempt_id)
        return linked
    finally:
        await conn.close()


@pytest.mark.integration
def test_core_algorithm_card_attempt_links_to_its_problem() -> None:
    try:
        problem = asyncio.run(_core_problem_and_submission(None))
        card_id = f"core-algorithm-{problem['slug']}"
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/attempts",
                json={
                    "cardId": card_id,
                    "generatedCardId": card_id,
                    "question": "Recall the core algorithm.",
                    "questionType": "skill-map",
                    "categoryTags": ["skill-map"],
                    "correctAnswer": problem["code"],
                    "userAnswer": problem["code"],
                    "mode": "main-recall",
                    "modality": "ghost-rep",
                },
            )
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert response.status_code == 201, response.text
    assert response.json()["evaluation"]["provenance"]["llmUsed"] is False
    linked = asyncio.run(_core_problem_and_submission(int(response.json()["attemptId"])))
    assert linked == problem["slug"]
