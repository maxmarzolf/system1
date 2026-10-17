from __future__ import annotations

import asyncio

import asyncpg
import pytest

from app import database
from app.config import settings
from app.core.signal_catalog import (
    BINARY_SEARCH_SIGNAL_SPEC,
    DEFAULT_SIGNAL_SPEC,
    DYNAMIC_PROGRAMMING_SIGNAL_SPEC,
    SLIDING_WINDOW_SIGNAL_SPEC,
    spec_to_json,
)
from app.repositories import signal_spec_repository
from fastapi.testclient import TestClient

from app import main as app_main
from app.main import create_app
from app.services import signal_spec_service


def _fake_row(monkeypatch, row):
    calls: list[tuple] = []

    async def _fetch(problem_slugs, algorithm_slug):
        calls.append((problem_slugs, algorithm_slug))
        return row

    monkeypatch.setattr(signal_spec_repository, "fetch_algorithm_signal_spec", _fetch)
    return calls


def test_service_passes_card_ids_and_primary_pattern_tag(monkeypatch) -> None:
    calls = _fake_row(
        monkeypatch,
        {"slug": "binary-search", "signal_spec": spec_to_json(BINARY_SEARCH_SIGNAL_SPEC), "matched_by": "skill-tag"},
    )

    spec = asyncio.run(signal_spec_service.resolve_signal_spec([None, "card-1"], ["skill-map", "binary-search"]))

    assert spec == BINARY_SEARCH_SIGNAL_SPEC
    assert calls == [(["card-1"], "binary-search")]


def test_core_algorithm_card_ids_also_match_their_problem_slug(monkeypatch) -> None:
    calls = _fake_row(monkeypatch, None)

    asyncio.run(signal_spec_service.resolve_signal_spec(["core-algorithm-binary_search", "plain-card"], []))

    assert calls == [(["core-algorithm-binary_search", "binary_search", "plain-card"], "")]


def test_service_uses_code_catalog_when_stored_spec_is_empty(monkeypatch) -> None:
    _fake_row(monkeypatch, {"slug": "sliding-window", "signal_spec": {}, "matched_by": "problem"})

    spec = asyncio.run(signal_spec_service.resolve_signal_spec(["card-1"], []))

    assert spec is SLIDING_WINDOW_SIGNAL_SPEC


def test_service_falls_back_to_default_spec_without_a_row(monkeypatch) -> None:
    _fake_row(monkeypatch, None)

    spec = asyncio.run(signal_spec_service.resolve_signal_spec(["unknown"], ["skill-map"]))

    assert spec is DEFAULT_SIGNAL_SPEC


def test_source_reports_how_the_spec_was_matched(monkeypatch) -> None:
    _fake_row(monkeypatch, {"slug": "sliding-window", "signal_spec": {}, "matched_by": "problem"})
    assert asyncio.run(signal_spec_service.resolve_signal_spec_with_source(["card-1"], []))[1] == "problem"

    _fake_row(monkeypatch, None)
    assert asyncio.run(signal_spec_service.resolve_signal_spec_with_source(["card-1"], []))[1] == "default"


def _client(monkeypatch) -> TestClient:
    async def _noop():
        return None

    monkeypatch.setattr(app_main, "connect", _noop)
    monkeypatch.setattr(app_main, "disconnect", _noop)
    return TestClient(create_app())


def test_signal_specs_endpoint_lists_stored_specs_and_flags_defaults(monkeypatch) -> None:
    async def _rows():
        return [
            {"slug": "sliding-window", "name": "Sliding Window", "display_order": 1,
             "signal_spec": spec_to_json(SLIDING_WINDOW_SIGNAL_SPEC)},
            {"slug": "graphs", "name": "Graphs", "display_order": 2, "signal_spec": spec_to_json(DEFAULT_SIGNAL_SPEC)},
            {"slug": "trees", "name": "Trees", "display_order": 3, "signal_spec": {}},
        ]

    monkeypatch.setattr(signal_spec_repository, "fetch_algorithm_signal_specs", _rows)
    with _client(monkeypatch) as client:
        response = client.get("/api/catalog/signal-specs")

    assert response.status_code == 200
    body = response.json()
    assert body["default"] == spec_to_json(DEFAULT_SIGNAL_SPEC)
    assert [(item["slug"], item["usesDefault"], item["seeded"]) for item in body["algorithms"]] == [
        ("sliding-window", False, True),
        ("graphs", True, True),
        ("trees", True, False),
    ]
    assert body["algorithms"][0]["spec"]["signals"][0]["key"] == "windowState"


def test_resolve_endpoint_previews_the_assessor_payload(monkeypatch) -> None:
    calls = _fake_row(
        monkeypatch,
        {"slug": "binary-search", "signal_spec": spec_to_json(BINARY_SEARCH_SIGNAL_SPEC), "matched_by": "problem"},
    )
    with _client(monkeypatch) as client:
        response = client.post(
            "/api/catalog/signal-specs/resolve",
            json={"cardId": "binary_search", "generatedCardId": "binary_search", "categoryTags": ["skill-map", "sliding-window"]},
        )

    assert response.status_code == 200
    body = response.json()
    assert calls == [(["binary_search", "binary_search"], "sliding-window")]
    assert body["source"] == "problem"
    assert body["primaryPatternTag"] == "sliding-window"
    assert body["spec"]["algorithm"] == "binary-search"
    assert set(body["assessorPayload"]["signalGuidance"]) == set(BINARY_SEARCH_SIGNAL_SPEC.keys)
    assert "boundUpdate" in body["assessorPayload"]["systemPrompt"]


async def _with_database(callback):
    await database.connect()
    try:
        return await callback()
    finally:
        await database.disconnect()


async def _first_problem_slug(algorithm_slug: str) -> str:
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetchval(
            "SELECT slug FROM problem WHERE algorithm_slug = $1 ORDER BY display_order LIMIT 1",
            algorithm_slug,
        )
    finally:
        await conn.close()


@pytest.mark.integration
def test_problem_slug_resolves_to_its_algorithm_spec_over_skill_tags() -> None:
    try:
        problem_slug = asyncio.run(_first_problem_slug("dynamic-programming"))
        spec, source = asyncio.run(
            _with_database(
                lambda: signal_spec_service.resolve_signal_spec_with_source(
                    [f"core-algorithm-{problem_slug}"], ["sliding-window"]
                )
            )
        )
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert problem_slug
    assert spec == DYNAMIC_PROGRAMMING_SIGNAL_SPEC
    assert source == "problem"


@pytest.mark.integration
def test_skill_tag_and_unknown_inputs_resolve_through_the_database() -> None:
    async def _resolve_both():
        by_tag, by_tag_source = await signal_spec_service.resolve_signal_spec_with_source(
            ["not-a-problem"], ["skill-map", "sliding-window"]
        )
        assert by_tag_source == "skill-tag"
        unknown = await signal_spec_service.resolve_signal_spec(["not-a-problem"], ["skill-map"])
        group_without_spec = await signal_spec_service.resolve_signal_spec([], ["graphs"])
        return by_tag, unknown, group_without_spec

    try:
        by_tag, unknown, group_without_spec = asyncio.run(_with_database(_resolve_both))
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert by_tag == SLIDING_WINDOW_SIGNAL_SPEC
    assert unknown is DEFAULT_SIGNAL_SPEC
    assert group_without_spec == DEFAULT_SIGNAL_SPEC
