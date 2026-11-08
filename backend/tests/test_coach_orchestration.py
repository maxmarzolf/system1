"""Coach orchestration: error mapping, persistence hooks, catalog drills and the coach endpoints."""

from __future__ import annotations

import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main as app_main
from app.domain.llm_resilience import SubmissionFeedbackUnavailableError
from app.main import create_app
from app.models import (
    CoachSessionPlanRequest,
    MultipleChoiceDrillsRequest,
)
from app.services import (
    coach_orchestration_service as orchestration,
    inline_completion_service,
    micro_drill_service,
    problem_practice_service,
    sliding_window_ladder_service,
)

UNAVAILABLE = SubmissionFeedbackUnavailableError("coach_llm_no_response", "No response.", "claude", "provider_empty_response")


async def raise_unavailable(*_args, **_kwargs):
    raise UNAVAILABLE


@pytest.mark.parametrize(
    ("call", "target", "body"),
    [
        (orchestration.coach_session_plan, (orchestration.session_service, "coach_session_plan"), CoachSessionPlanRequest()),
        (
            orchestration.coach_multiple_choice_drills,
            (orchestration.drill_generation_service, "coach_multiple_choice_drills"),
            MultipleChoiceDrillsRequest(),
        ),
    ],
)
async def test_llm_failures_become_503s(monkeypatch, call, target, body) -> None:
    monkeypatch.setattr(*target, raise_unavailable)
    with pytest.raises(HTTPException) as error:
        await call(body)
    assert error.value.status_code == 503
    assert error.value.detail["providerLabel"] == "Claude"
    assert error.value.detail["code"] == "coach_llm_no_response"


async def test_provider_default_reports_configured_provider(monkeypatch) -> None:
    monkeypatch.setattr("app.core.llm.settings.coach_llm_provider", "anthropic")
    assert (await orchestration.coach_provider_default()).provider == "claude"


async def test_skill_map_drills_are_persisted_with_progress_context(monkeypatch, skill_map_request, progress_summary) -> None:
    stored: list[dict] = []

    async def summary(_body):
        return progress_summary

    async def upsert(**kwargs):
        stored.append(kwargs)

    async def generate(body, *, progress_summary, persist_skill_map_drills):
        drill = {
            "id": "llm-1",
            "title": "t",
            "difficulty": "Med.",
            "prompt": "p",
            "solution": "s",
            "missing": "m",
            "hint": "h",
            "tags": ["skill-map", "sliding-window"],
            "explanation": "why",
        }
        await persist_skill_map_drills([drill], True, progress_summary)
        return {"drills": [drill], "llmUsed": True}

    monkeypatch.setattr(orchestration.history_service, "load_skill_map_generation_summary", summary)
    monkeypatch.setattr(orchestration, "upsert_generated_problem", upsert)
    monkeypatch.setattr(orchestration.drill_generation_service, "coach_skill_map_drills", generate)
    monkeypatch.setattr(orchestration.drill_generation_service, "coach_skill_map_drills_stream", generate)

    for call in (orchestration.coach_skill_map_drills, orchestration.coach_skill_map_drills_stream):
        result = await call(skill_map_request)
        assert result["llmUsed"]
    context = json.loads(stored[0]["generation_context_json"])
    assert context["patternProgress"] == progress_summary["patterns"]["sliding-window"]
    assert context["explanation"] == "why"
    assert stored[0]["question_type"] == "skill-map"


async def test_generated_questions_are_stored_and_mapped(monkeypatch) -> None:
    async def insert(**kwargs):
        assert kwargs["user_id"] == "0000"
        return [{"id": "q1", "choices": [], "correctChoiceId": "A"}, None]

    async def generate(body, *, persist_generated_questions):
        return {"stored": await persist_generated_questions([{}, {}])}

    monkeypatch.setattr(orchestration, "insert_generated_multiple_choice_question_rows", insert)
    monkeypatch.setattr(orchestration.drill_generation_service, "coach_multiple_choice_drills", generate)
    result = await orchestration.coach_multiple_choice_drills(MultipleChoiceDrillsRequest())
    assert result["stored"] == [{"id": "q1", "choices": [], "correctChoiceId": "A"}, None]


# ── catalog drills ──


@pytest.fixture
def catalog(monkeypatch):
    calls: list[tuple] = []

    def rows(name):
        async def fetch(*args):
            calls.append((name, args))
            return [{"slug": f"{name}-row"}]

        return fetch

    monkeypatch.setattr(problem_practice_service, "build_core_algorithm_drill", lambda row: {"id": row["slug"]})
    for name in (
        "fetch_random_problem_practice_rows",
        "fetch_problem_practice_rows_by_tag",
        "fetch_problem_practice_rows",
    ):
        monkeypatch.setattr(problem_practice_service, name, rows(name))
    return calls


async def test_catalog_drills_clamp_counts_and_build_cards(catalog) -> None:
    assert (await problem_practice_service.random_problem_drills(99))["drills"] == [
        {"id": "fetch_random_problem_practice_rows-row"}
    ]
    await problem_practice_service.random_problem_drills(0)
    await problem_practice_service.problem_drills_for_tag("heap", -5)
    await problem_practice_service.problem_drills_for_algorithm("heap")
    assert catalog[0][1] == (30,)
    assert catalog[1][1] == (10,)
    assert catalog[2][1] == ("heap", 1)
    assert [call[0] for call in catalog[3:]] == ["fetch_problem_practice_rows"]


async def test_static_playlist_drills_merge_metadata(monkeypatch) -> None:
    row = {
        "id": "p1",
        "question_type": "static-playlist",
        "title": "t",
        "difficulty": "Easy",
        "prompt": "p",
        "solution": "s",
        "missing": "m",
        "hint": "h",
        "tags": None,
        "metadata": json.dumps({"family": "windows"}),
        "playlist_metadata": {"skeletonApplicability": "full"},
    }

    async def fetch(slug, order):
        return [row, {**row, "id": "p2", "metadata": "not json", "playlist_metadata": "[1]"}]

    monkeypatch.setattr(problem_practice_service, "fetch_static_playlist_drills", fetch)
    result = await problem_practice_service.static_playlist_drills("Blind 75")
    first, second = result["drills"]
    assert first["family"] == "windows" and first["skeletonApplicability"] == "full" and first["tags"] == []
    assert "skeletonApplicability" not in second


async def test_static_playlist_drills_fall_back_to_code(monkeypatch) -> None:
    async def failing(slug, order):
        raise AssertionError("no database")

    monkeypatch.setattr(problem_practice_service, "fetch_static_playlist_drills", failing)
    monkeypatch.setattr(problem_practice_service, "build_static_playlist_drills", lambda slug, order: None)
    assert await problem_practice_service.static_playlist_drills("unknown") == {"drills": [], "llmUsed": False}


def test_json_object_coercion() -> None:
    assert problem_practice_service._json_object({"a": 1}) == {"a": 1}
    assert problem_practice_service._json_object('{"a": 1}') == {"a": 1}
    assert problem_practice_service._json_object("[1]") == {}
    assert problem_practice_service._json_object(None) == {}


# ── endpoints ──


@pytest.fixture
def client(monkeypatch):
    async def noop():
        return None

    monkeypatch.setattr(app_main, "connect", noop)
    monkeypatch.setattr(app_main, "disconnect", noop)
    with TestClient(create_app()) as test_client:
        yield test_client


def test_problem_drills_endpoint_routes_by_tag(client, monkeypatch) -> None:
    seen: list[str] = []

    async def by_tag(tag, count):
        seen.append(f"tag:{tag}:{count}")
        return {"drills": [], "llmUsed": False}

    async def random(count):
        seen.append(f"random:{count}")
        return {"drills": [], "llmUsed": False}

    monkeypatch.setattr(problem_practice_service, "problem_drills_for_tag", by_tag)
    monkeypatch.setattr(problem_practice_service, "random_problem_drills", random)
    assert client.get("/api/coach/problem-drills?tag=%20heap%20&count=3").status_code == 200
    assert client.get("/api/coach/problem-drills?tag=%20").status_code == 200
    assert seen == ["tag:heap:3", "random:10"]


def test_stream_endpoint_returns_event_stream(client, monkeypatch, skill_map_request) -> None:
    async def stream(body):
        async def events():
            yield "data: {}\n\n"

        return events()

    monkeypatch.setattr(orchestration, "coach_skill_map_drills_stream", stream)
    response = client.post("/api/coach/skill-map-drills-stream", json=skill_map_request.model_dump(mode="json"))
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text == "data: {}\n\n"


@pytest.mark.parametrize(
    ("path", "target", "error", "status"),
    [
        (
            "/api/coach/inline-completion",
            (inline_completion_service, "generate_inline_completion"),
            inline_completion_service.InlineCompletionProviderUnavailable("no key"),
            503,
        ),
        (
            "/api/coach/inline-completion",
            (inline_completion_service, "generate_inline_completion"),
            inline_completion_service.InlineCompletionGenerationError("bad output"),
            502,
        ),
        (
            "/api/coach/micro-drill",
            (micro_drill_service, "generate_flow_micro_drill"),
            micro_drill_service.MicroDrillGenerationError("down"),
            503,
        ),
        (
            "/api/coach/sliding-window-ladder",
            (sliding_window_ladder_service, "generate_ladder_question"),
            sliding_window_ladder_service.LadderGenerationError("down"),
            503,
        ),
    ],
)
def test_generation_errors_map_to_status_codes(client, monkeypatch, path, target, error, status) -> None:
    async def failing(body):
        raise error

    monkeypatch.setattr(*target, failing)
    # Minimal bodies; validation errors (422) would mean the payload is wrong, not the mapping.
    payloads = {
        "/api/coach/inline-completion": {"prefix": "x", "suffix": "", "language": "python"},
        "/api/coach/micro-drill": {"cardTitle": "t", "prompt": "p", "target": "x"},
        "/api/coach/sliding-window-ladder": {"cardTitle": "t", "technique": "fixed", "rungIndex": 0, "rep": 1},
    }
    response = client.post(path, json=payloads[path])
    assert response.status_code in (status, 422)
    if response.status_code == 422:
        pytest.fail(f"payload for {path} is invalid: {response.json()}")
