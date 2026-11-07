"""Every HTTP route reaches its service, and every service error maps to the right status."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main as app_main
from app.core.jev import HttpJevGateway, JevUnavailableError, choice
from app.main import create_app
from app.repositories import admin_repository
from app.services import (
    admin_service,
    attempts_service,
    coach_service,
    problem_practice_service,
    signal_admin_service,
)
from app.services.submission_context_service import SubmissionContextError


@pytest.fixture
def client(monkeypatch):
    async def noop():
        return None

    monkeypatch.setattr(app_main, "connect", noop)
    monkeypatch.setattr(app_main, "disconnect", noop)
    with TestClient(create_app()) as test_client:
        yield test_client


def returns(value):
    async def handler(*_args, **_kwargs):
        return value

    return handler


def raises(error):
    async def handler(*_args, **_kwargs):
        raise error

    return handler


DRILLS = {"drills": [], "llmUsed": False}
DRILL = {
    "id": "d",
    "title": "t",
    "difficulty": "Easy",
    "prompt": "p",
    "solution": "s {{missing}}",
    "missing": "m",
    "hint": "h",
    "tags": [],
}


def test_health(client) -> None:
    assert client.get("/api/health").json() == {"ok": True}


def test_read_routes(client, monkeypatch) -> None:
    monkeypatch.setattr(attempts_service, "get_skill_map", returns([{"algorithm": "Heap", "skills": []}]))
    monkeypatch.setattr(attempts_service, "get_signal_history", returns({"signals": [], "points": []}))
    assert client.get("/api/skill-map").json()[0]["algorithm"] == "Heap"
    assert client.get("/api/history/signals?tz=UTC").json() == {"signals": [], "points": []}


def test_coach_routes_reach_their_services(client, monkeypatch) -> None:
    monkeypatch.setattr(coach_service, "coach_provider_default", returns({"provider": "openai"}))
    monkeypatch.setattr(
        coach_service,
        "coach_session_plan",
        returns({"headline": "h", "focusTheme": "f", "warmup": "w", "mainSet": "m", "cooldown": "c", "note": "n"}),
    )
    monkeypatch.setattr(coach_service, "coach_skill_map_drills", returns(DRILLS))
    monkeypatch.setattr(problem_practice_service, "problem_drills_for_algorithm", returns(DRILLS))
    monkeypatch.setattr(problem_practice_service, "problem_drills_for_technique", returns(DRILLS))
    monkeypatch.setattr(problem_practice_service, "static_playlist_drills", returns(DRILLS))
    monkeypatch.setattr(coach_service, "coach_adaptive_variation", returns({"drill": DRILL, "targetDimension": "x"}))
    monkeypatch.setattr(coach_service, "coach_sequential_variation", returns({"drill": DRILL}))

    assert client.get("/api/coach/provider-default").json()["provider"] == "openai"
    assert client.post("/api/coach/session-plan", json={}).json()["headline"] == "h"
    skill_map = {"skillMap": [{"algorithm": "heap", "skills": []}]}
    assert client.post("/api/coach/skill-map-drills", json=skill_map).status_code == 200
    assert client.get("/api/coach/problem-drills/heap").json() == DRILLS
    assert client.get("/api/coach/problem-drills/technique/two-heaps").json() == DRILLS
    assert client.get("/api/coach/playlist-drills/blind-75?order=random").json() == DRILLS
    variation = {"cardId": "c", "expectedAnswer": "x"}
    assert client.post("/api/coach/adaptive-variation", json=variation).json()["targetDimension"] == "x"
    assert client.post("/api/coach/sequential-variation", json=variation).status_code == 200


def test_reset_route_maps_permission_error(client, monkeypatch) -> None:
    monkeypatch.setattr(admin_service, "reset_practice_history", raises(admin_service.AdminResetPermissionError("no")))
    response = client.post("/api/admin/reset-practice-history", json={"confirm": "wrong"})
    assert response.status_code == 403


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (signal_admin_service.SignalValidationError({"label": "Required."}), 422, "invalid_signal"),
        (SubmissionContextError("mcq_unknown_problem", "No such problem."), 422, "mcq_unknown_problem"),
        (signal_admin_service.SignalNotFoundError("gone"), 404, "not_found"),
        (signal_admin_service.SignalConflictError("stale"), 409, "conflict"),
        (signal_admin_service.SignalTryError("down"), 502, "jev_unavailable"),
    ],
)
def test_signal_admin_errors_map_to_statuses(client, monkeypatch, error, status, code) -> None:
    monkeypatch.setattr(signal_admin_service, "list_signals", raises(error))
    response = client.get("/api/admin/signals")
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code


# ── admin repository (fake connection: never truncate the dev database) ──


class FakeConnection:
    def __init__(self, row):
        self.row = row
        self.executed: list[str] = []

    async def fetchrow(self, sql):
        return self.row

    async def execute(self, sql):
        self.executed.append(sql)

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def fake_acquire(connection):
    def acquire():
        return connection

    return acquire


async def test_admin_repository_counts_and_clears(monkeypatch) -> None:
    connection = FakeConnection({"submission": 4, "generated_problems": None})
    monkeypatch.setattr(admin_repository, "acquire_connection", fake_acquire(connection))
    assert await admin_repository.count_practice_history_rows() == {"submission": 4, "generated_problems": 0}
    await admin_repository.truncate_practice_history_tables()
    assert connection.executed[0].startswith("TRUNCATE TABLE submission")
    assert "generated-llm" in connection.executed[1]

    monkeypatch.setattr(admin_repository, "acquire_connection", fake_acquire(FakeConnection(None)))
    assert await admin_repository.count_practice_history_rows() == {
        table: 0 for table in admin_repository.PRACTICE_HISTORY_TABLES
    }


# ── Jev client edge cases ──

QUESTIONS = {"q": choice("pick", {"1": "yes", "0": "no"})}


def gateway(handler, **overrides) -> HttpJevGateway:
    return HttpJevGateway(
        api_key="key",
        model="jev-test",
        retry_delay_seconds=0,
        transport=httpx.MockTransport(handler),
        **overrides,
    )


async def test_jev_requires_questions() -> None:
    with pytest.raises(JevUnavailableError) as error:
        await gateway(lambda request: httpx.Response(200)).system_one("s", {})
    assert error.value.code == "jev_no_questions"


@pytest.mark.parametrize(
    ("exception", "code"),
    [(httpx.ReadTimeout("slow"), "jev_timeout"), (httpx.ConnectError("refused"), "jev_unreachable")],
)
async def test_jev_transport_failures_retry_then_raise(exception, code) -> None:
    attempts: list[int] = []

    def handler(request):
        attempts.append(1)
        raise exception

    with pytest.raises(JevUnavailableError) as error:
        await gateway(handler, max_retries=1).system_one("s", QUESTIONS)
    assert error.value.code == code
    assert len(attempts) == 2


async def test_jev_invalid_json_and_missing_answers() -> None:
    with pytest.raises(JevUnavailableError) as error:
        await gateway(lambda request: httpx.Response(200, text="not json")).system_one("s", QUESTIONS)
    assert error.value.code == "jev_invalid_response"
    with pytest.raises(JevUnavailableError) as error:
        await gateway(lambda request: httpx.Response(200, json={"model": "m"})).system_one("s", QUESTIONS)
    assert error.value.message == "Jev returned no answers."
