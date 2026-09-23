from __future__ import annotations

import asyncio

from app.repositories import problems_repository as repository


class FakeConnection:
    def __init__(self):
        self.fetch_calls: list[tuple[str, tuple[object, ...]]] = []

    async def fetch(self, query, *args):
        self.fetch_calls.append((query, args))
        return []


class FakeConnectionContext:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, *_args):
        return False


def _install_connection(monkeypatch):
    connection = FakeConnection()
    monkeypatch.setattr(
        repository,
        "acquire_connection",
        lambda: FakeConnectionContext(connection),
    )
    return connection


def _assert_core_inventory_only(query: str) -> None:
    assert "p.source_type IN ('core-catalog', 'core-meta')" in query


def test_algorithm_practice_matches_dashboard_core_inventory(monkeypatch) -> None:
    connection = _install_connection(monkeypatch)

    asyncio.run(repository.fetch_problem_practice_rows("sliding-window"))

    query, args = connection.fetch_calls[0]
    _assert_core_inventory_only(query)
    assert "p.algorithm_slug = $1" in query
    assert args == ("sliding-window",)


def test_other_core_practice_queries_exclude_generated_and_playlist_rows(monkeypatch) -> None:
    connection = _install_connection(monkeypatch)

    asyncio.run(repository.fetch_problem_practice_rows_by_technique("monotonic-deque"))
    asyncio.run(repository.fetch_problem_practice_rows_by_tag("frequency-maps", 10))
    asyncio.run(repository.fetch_random_problem_practice_rows(10))

    assert len(connection.fetch_calls) == 3
    for query, _args in connection.fetch_calls:
        _assert_core_inventory_only(query)
