from __future__ import annotations

import asyncio
import json
from uuid import uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.jev import JevResponse
from app.main import create_app
from app.models import SubmissionModality
from app.services import signal_registry_service
from app.services import jev_gateway
from app.services.evaluators import EVALUATORS
from app.services.evaluators.jev_mcq import JevMcqEvaluator



class CapturingGateway:
    """Records every Jev call and answers each question plausibly."""

    def __init__(self) -> None:
        self.calls: list[tuple[dict, dict]] = []

    async def system_one(self, state, questions):
        self.calls.append((dict(state), dict(questions)))
        answers = {}
        for key, question in questions.items():
            if question["type"] == "choice":
                label = "1" if key == "correctness" else next(iter(question["criteria"]))
                answers[key] = {"type": "choice", "choice": label, "confidence": 0.9, "probabilities": {}}
            elif question["type"] == "score":
                answers[key] = {"type": "score", "score": 1.0, "confidence": 0.8}
            else:
                answers[key] = {"type": "noul", "noul": 0.75}
        return JevResponse(model="jev-itest", answers=answers, request_id="req-itest")


async def _snapshot() -> dict:
    conn = await asyncpg.connect(settings.database_url)
    try:
        return {
            "definitions": await conn.fetchval("SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]') FROM signal_definition s"),
            "directives": await conn.fetchval(
                "SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]') FROM signal_evaluation_directive d"
            ),
            "revision": await conn.fetchval("SELECT COALESCE(MAX(id), 0) FROM signal_definition_revision"),
        }
    finally:
        await conn.close()


async def _restore(snapshot: dict) -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        async with conn.transaction():
            await conn.execute("DELETE FROM signal_definition")
            await conn.execute(
                "INSERT INTO signal_definition SELECT * FROM jsonb_populate_recordset(NULL::signal_definition, $1::jsonb)",
                snapshot["definitions"],
            )
            await conn.execute("DELETE FROM signal_evaluation_directive")
            await conn.execute(
                "INSERT INTO signal_evaluation_directive "
                "SELECT * FROM jsonb_populate_recordset(NULL::signal_evaluation_directive, $1::jsonb)",
                snapshot["directives"],
            )
            await conn.execute("DELETE FROM signal_definition_revision WHERE id > $1", snapshot["revision"])
    finally:
        await conn.close()


async def _seed_problem(problem_id: str) -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(
            """
            INSERT INTO multiple_choice_problem (id, question_text, choices, correct_choice_id, fingerprint)
            VALUES ($1, 'Which heap keeps the kth largest at the root?', '[{"id": "A", "text": "Min-heap of size k"}, {"id": "B", "text": "Max-heap of size k"}, {"id": "C", "text": "Min-heap of all n"}, {"id": "D", "text": "A sorted list"}]'::jsonb, 'A', $1)
            """,
            problem_id,
        )
    finally:
        await conn.close()


async def _cleanup_problem(problem_id: str) -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("DELETE FROM submission WHERE multiple_choice_problem_id = $1", problem_id)
        await conn.execute("DELETE FROM multiple_choice_problem WHERE id = $1", problem_id)
    finally:
        await conn.close()


@pytest.fixture
def admin(monkeypatch):
    """A TestClient with a capturing Jev gateway, and signal tables restored afterwards."""
    try:
        snapshot = asyncio.run(_snapshot())
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")
    gateway = CapturingGateway()
    monkeypatch.setattr(jev_gateway, "default_jev_gateway", lambda: gateway)
    monkeypatch.setitem(EVALUATORS, SubmissionModality.mcq, JevMcqEvaluator(lambda: gateway))
    problem_id = f"mcq-itest-admin-{uuid4().hex[:12]}"
    with TestClient(create_app()) as client:
        asyncio.run(_seed_problem(problem_id))
        try:
            yield client, gateway, problem_id
        finally:
            asyncio.run(_cleanup_problem(problem_id))
            asyncio.run(_restore(snapshot))


def _signals(client: TestClient) -> dict:
    response = client.get("/api/admin/signals")
    assert response.status_code == 200, response.text
    return response.json()


def _signal(body: dict, key: str) -> dict:
    return next(signal for signal in body["signals"] if signal["key"] == key)


def _submit(client: TestClient, problem_id: str, tag: str, choice: str = "B"):
    response = client.post(
        "/api/attempts",
        json={
            "cardId": problem_id,
            "generatedCardId": problem_id,
            "multipleChoiceProblemId": problem_id,
            "selectedChoiceId": choice,
            "questionType": "skill-map-mcq:card:random",
            "categoryTags": ["skill-map", "skill-map-mcq", tag],
            "mode": "main-recall",
            "modality": "mcq",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.integration
def test_listing_shows_seeded_signals_directive_and_jev_payloads(admin) -> None:
    client, _gateway, _problem_id = admin

    body = _signals(client)

    assert body["directive"]["labels"] == ["1", "0"]
    assert {"conceptRecognition", "nearMiss", "distractorMisconception", "completionTime"} <= {
        signal["key"] for signal in body["signals"]
    }
    concept = _signal(body, "conceptRecognition")
    assert concept["jevQuestion"]["type"] == "noul"
    assert 0 < concept["effectiveShare"] < 1
    assert _signal(body, "completionTime")["jevQuestion"] is None
    assert any(algorithm["slug"] == "heap" for algorithm in body["algorithms"])
    assert body["implementations"][0]["name"] == "completionTime"


@pytest.mark.integration
def test_writes_validate_every_field(admin) -> None:
    client, _gateway, _problem_id = admin

    invalid = client.post(
        "/api/admin/signals",
        json={"key": "Bad Key", "label": "", "primitive": "score", "criteria": ["one"], "appliesWhen": "never"},
    )
    assert invalid.status_code == 422
    assert {"key", "label", "instructions", "criteria", "appliesWhen"} <= set(invalid.json()["detail"]["errors"])


@pytest.mark.integration
def test_edits_apply_to_the_very_next_jev_payload(admin) -> None:
    client, gateway, problem_id = admin
    body = _signals(client)
    concept = _signal(body, "conceptRecognition")
    near_miss = _signal(body, "nearMiss")

    reworded = {**concept, "instructions": "ITEST: did they recognize the invariant?"}
    assert client.put(f"/api/admin/signals/{concept['key']}", json=reworded).status_code == 200
    archived = client.post(
        f"/api/admin/signals/{near_miss['key']}/archive", json={"version": near_miss["version"]}
    )
    assert archived.status_code == 200 and archived.json()["status"] == "archived"
    created = client.post(
        "/api/admin/signals",
        json={
            "key": "itestHeapInvariant",
            "label": "Heap invariant",
            "scope": "heap",
            "primitive": "choice",
            "instructions": "Which heap invariant does submittedAnswer apply?",
            "criteria": {"min_heap_k": "Min-heap of size k", "other": None},
            "scoreMap": {"min_heap_k": 100, "other": 0},
            "weight": 0.2,
        },
    )
    assert created.status_code == 201, created.text
    directive = body["directive"]
    assert client.put(
        "/api/admin/signals/directive/mcq",
        json={**directive, "instructions": "ITEST: is submittedAnswer correctAnswer?"},
    ).status_code == 200

    heap_result = _submit(client, problem_id, "heap-priority-queue")
    _state, heap_questions = gateway.calls[-1]
    window_result = _submit(client, problem_id, "sliding-window")
    _state, window_questions = gateway.calls[-1]

    assert heap_questions["conceptRecognition"]["instructions"] == "ITEST: did they recognize the invariant?"
    assert heap_questions["correctness"]["instructions"] == "ITEST: is submittedAnswer correctAnswer?"
    assert "nearMiss" not in heap_questions
    assert "itestHeapInvariant" in heap_questions
    assert "itestHeapInvariant" not in window_questions
    assert heap_result["evaluation"]["signalSpec"]["algorithm"] == "heap"
    assert heap_result["evaluation"]["signalSpec"]["hash"] != window_result["evaluation"]["signalSpec"]["hash"]
    assert heap_result["evaluation"]["signalResults"]["itestHeapInvariant"]["score"] == 100.0
    assert list(heap_questions["itestHeapInvariant"]["criteria"]) == ["min_heap_k", "other"]


@pytest.mark.integration
def test_stale_versions_conflict_and_every_change_is_recorded(admin) -> None:
    client, _gateway, _problem_id = admin
    concept = _signal(_signals(client), "conceptRecognition")

    first = client.put("/api/admin/signals/conceptRecognition", json={**concept, "weight": 0.3})
    stale = client.put("/api/admin/signals/conceptRecognition", json={**concept, "weight": 0.4})
    archived = client.post(
        "/api/admin/signals/conceptRecognition/archive", json={"version": first.json()["version"]}
    )
    restored = client.post(
        "/api/admin/signals/conceptRecognition/restore", json={"version": archived.json()["version"]}
    )
    duplicate = client.post("/api/admin/signals", json={**concept, "version": None})
    revisions = client.get("/api/admin/signals/revisions/conceptRecognition").json()

    assert first.status_code == 200 and first.json()["version"] == concept["version"] + 1
    assert stale.status_code == 409
    assert restored.status_code == 200 and restored.json()["status"] == "active"
    assert duplicate.status_code == 409
    assert [revision["action"] for revision in revisions[:3]] == ["restore", "archive", "update"]
    assert revisions[2]["before"]["weight"] == concept["weight"]
    assert revisions[2]["after"]["weight"] == 0.3


@pytest.mark.integration
def test_seeding_never_overwrites_edits(admin) -> None:
    client, _gateway, _problem_id = admin
    concept = _signal(_signals(client), "conceptRecognition")
    client.put("/api/admin/signals/conceptRecognition", json={**concept, "label": "Edited label"})

    inserted = client.portal.call(signal_registry_service.seed_signal_definitions)

    assert inserted == 0
    assert _signal(_signals(client), "conceptRecognition")["label"] == "Edited label"


@pytest.mark.integration
def test_try_runs_a_draft_against_a_stored_question_without_saving(admin) -> None:
    client, gateway, problem_id = admin
    draft = {
        "label": "Draft",
        "primitive": "score",
        "instructions": "How close is submittedAnswer?",
        "criteria": ["far", "close", "same idea"],
        "appliesWhen": "incorrect",
        "needsCorrectness": True,
    }

    response = client.post(
        "/api/admin/signals/try",
        json={"draft": draft, "problemId": problem_id, "choiceId": "B"},
    )
    samples = client.get("/api/admin/signals/samples").json()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["answeredCorrectly"] is False
    assert body["applies"] is True
    assert body["state"]["answeredCorrectly"] == 0
    assert body["result"]["score"] == 50.0
    state, questions = gateway.calls[-1]
    assert list(questions) == ["draftSignal"]
    assert state["submittedAnswer"]["id"] == "B"
    assert "draftSignal" not in {signal["key"] for signal in _signals(client)["signals"]}
    assert any(sample["id"] == problem_id for sample in samples)
    assert json.dumps(samples)  # serializable for the picker


@pytest.mark.integration
def test_descriptions_are_for_admins_only(admin) -> None:
    client, gateway, problem_id = admin
    concept = _signal(_signals(client), "conceptRecognition")
    assert concept["description"]  # seeded signals come with a description

    before = _submit(client, problem_id, "sliding-window")["evaluation"]["signalSpec"]["hash"]
    updated = client.put(
        "/api/admin/signals/conceptRecognition",
        json={**concept, "description": "ITEST: admin-only note"},
    )
    after_result = _submit(client, problem_id, "sliding-window")
    _state, questions = gateway.calls[-1]

    assert updated.status_code == 200 and updated.json()["description"] == "ITEST: admin-only note"
    assert "ITEST" not in json.dumps(questions)
    assert after_result["evaluation"]["signalSpec"]["hash"] == before
    too_long = client.put(
        "/api/admin/signals/conceptRecognition",
        json={**updated.json(), "description": "x" * 2001},
    )
    assert too_long.status_code == 422 and "description" in too_long.json()["detail"]["errors"]
