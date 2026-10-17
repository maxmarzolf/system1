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
from app.services import signal_spec_service


def _fake_row(monkeypatch, row):
    calls: list[tuple] = []

    async def _fetch(problem_slugs, algorithm_slug):
        calls.append((problem_slugs, algorithm_slug))
        return row

    monkeypatch.setattr(signal_spec_repository, "fetch_algorithm_signal_spec", _fetch)
    return calls


def test_service_passes_card_ids_and_primary_pattern_tag(monkeypatch) -> None:
    calls = _fake_row(monkeypatch, {"slug": "binary-search", "signal_spec": spec_to_json(BINARY_SEARCH_SIGNAL_SPEC)})

    spec = asyncio.run(signal_spec_service.resolve_signal_spec([None, "card-1"], ["skill-map", "binary-search"]))

    assert spec == BINARY_SEARCH_SIGNAL_SPEC
    assert calls == [(["card-1"], "binary-search")]


def test_service_uses_code_catalog_when_stored_spec_is_empty(monkeypatch) -> None:
    _fake_row(monkeypatch, {"slug": "sliding-window", "signal_spec": {}})

    spec = asyncio.run(signal_spec_service.resolve_signal_spec(["card-1"], []))

    assert spec is SLIDING_WINDOW_SIGNAL_SPEC


def test_service_falls_back_to_default_spec_without_a_row(monkeypatch) -> None:
    _fake_row(monkeypatch, None)

    spec = asyncio.run(signal_spec_service.resolve_signal_spec(["unknown"], ["skill-map"]))

    assert spec is DEFAULT_SIGNAL_SPEC


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
        spec = asyncio.run(
            _with_database(lambda: signal_spec_service.resolve_signal_spec([problem_slug], ["sliding-window"]))
        )
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert problem_slug
    assert spec == DYNAMIC_PROGRAMMING_SIGNAL_SPEC


@pytest.mark.integration
def test_skill_tag_and_unknown_inputs_resolve_through_the_database() -> None:
    async def _resolve_both():
        by_tag = await signal_spec_service.resolve_signal_spec(["not-a-problem"], ["skill-map", "sliding-window"])
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
