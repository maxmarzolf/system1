from __future__ import annotations

import asyncio
from uuid import uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.repositories.submission_signal_repository import fetch_evaluations
from app.core.jev import JevResponse
from app.main import create_app
from app.models import SubmissionModality
from app.services.evaluation import pipeline


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
        monkeypatch.setattr(pipeline, 'jev_gateway_factory', lambda: _FakeJevGateway(correct_label))

    return install


async def _purge_problems(question_ids: list[str]) -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("DELETE FROM submission WHERE multiple_choice_problem_id = ANY($1::text[])", question_ids)
        await conn.execute("DELETE FROM multiple_choice_problem WHERE id = ANY($1::text[])", question_ids)
    finally:
        await conn.close()


@pytest.fixture
def seeded_problems():
    """Problem ids a test seeds; they and their submissions are removed even if the test fails."""
    question_ids: list[str] = []
    yield question_ids
    if question_ids:
        try:
            asyncio.run(_purge_problems(question_ids))
        except (OSError, asyncpg.PostgresError):  # pragma: no cover - environment-dependent integration guard
            pass


async def _seed_problem(question_id: str) -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(
            """
            INSERT INTO multiple_choice_problem (id, question_text, choices, correct_choice_id, fingerprint)
            VALUES ($1, 'Which state is sufficient?', '[{"id": "A", "text": "Every subarray"}, {"id": "B", "text": "Current value"}, {"id": "C", "text": "Best prefix result"}, {"id": "D", "text": "A sorted copy"}]'::jsonb, 'C', $1)
            """,
            question_id,
        )
    finally:
        await conn.close()


async def _read_and_cleanup(attempt_id: int, question_id: str) -> dict:
    """The stored submission, its rebuilt evaluation, and its signal rows (deleted afterwards)."""
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
                modality_context->>'kind' AS modality_signal_kind,
                elapsed_ms,
                e.spec_algorithm AS signal_spec_algorithm,
                e.engine, e.model, e.correctness_source, e.correctness_label
            FROM submission s
            JOIN submission_evaluation e ON e.submission_id = s.id
            WHERE s.id = $1
            """,
            attempt_id,
        )
        signals = await conn.fetch(
            """
            SELECT d.key, d.role AS definition_role, s.signal_definition_id, d.id AS definition_id,
                   s.definition_version, d.version AS current_version, s.role, s.status, s.score, s.source, s.model,
                   s.value_kind, s.value_text, s.weight
            FROM submission_signal s JOIN signal_definition d ON d.id = s.signal_definition_id
            WHERE s.submission_id = $1 ORDER BY s.position
            """,
            attempt_id,
        )
        evaluation = (await fetch_evaluations(conn, [attempt_id]))[attempt_id]
        await conn.execute("DELETE FROM submission WHERE id = $1", attempt_id)
        await conn.execute("DELETE FROM multiple_choice_problem WHERE id = $1", question_id)
        # Deleting the submission deletes its evaluation and signal rows.
        assert await conn.fetchval("SELECT COUNT(*) FROM submission_signal WHERE submission_id = $1", attempt_id) == 0
        assert submission is not None
        return {**dict(submission), "evaluation": evaluation, "signals": [dict(row) for row in signals]}
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
def test_mcq_attempt_is_graded_against_the_stored_answer_key(fake_jev, seeded_problems) -> None:
    token = uuid4().hex[:12]
    question_id = f"mcq-itest-signal-{token}"
    seeded_problems.append(question_id)
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
    evaluation = submission["evaluation"]
    assert evaluation["provenance"]["engine"] == "jev"
    assert evaluation["provenance"]["model"] == "jev-itest"
    assert evaluation["correctness"]["answerKeyAgreement"] is True
    assert evaluation["signalSpec"]["modality"] == "mcq"
    assert evaluation["signalSpecSnapshot"]["signals"]
    assert evaluation["signalResults"]["nearMiss"]["status"] == "scored"

    # Relationally: the evaluation's facts are columns, and each signal is a row pointing at its
    # definition, with the version it was graded at, its source and model.
    assert (submission["engine"], submission["model"], submission["correctness_source"]) == ("jev", "jev-itest", "jev")
    rows = {row["key"]: row for row in submission["signals"]}
    assert set(rows) >= {"correctness", "nearMiss", "completionTime"}
    assert all(row["signal_definition_id"] == row["definition_id"] for row in rows.values())
    assert all(row["definition_version"] == row["current_version"] for row in rows.values())
    correctness = rows["correctness"]
    assert (correctness["role"], correctness["definition_role"], correctness["source"]) == ("correctness", "correctness", "jev")
    assert correctness["model"] == "jev-itest" and correctness["score"] == 0.0
    assert (correctness["value_kind"], correctness["value_text"]) == ("text", submission["correctness_label"])
    assert rows["nearMiss"]["source"] == "jev" and rows["nearMiss"]["model"] == "jev-itest"
    assert rows["completionTime"]["source"] == "deterministic" and rows["completionTime"]["model"] is None
    assert rows["completionTime"]["role"] == "modifier"


@pytest.mark.integration
def test_mcq_attempt_with_unknown_problem_or_choice_is_rejected(fake_jev, seeded_problems) -> None:
    token = uuid4().hex[:12]
    question_id = f"mcq-itest-reject-{token}"
    seeded_problems.append(question_id)
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
def test_signal_spec_is_stored_per_algorithm_and_read_back_through_history(fake_jev, seeded_problems) -> None:
    token = uuid4().hex[:12]
    window_id = f"mcq-itest-window-{token}"
    search_id = f"mcq-itest-search-{token}"
    seeded_problems.extend([window_id, search_id])
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
    stored_spec = entries[0]["signals"]["evaluation"]["signalSpec"]
    assert stored_spec["algorithm"] == "sliding-window"
    assert stored_spec["modality"] == "mcq"
    assert len(stored_spec["hash"]) == 16


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
