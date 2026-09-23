from __future__ import annotations

import asyncio
import json

from app.repositories import unified_catalog_repository as repository
from app.services import catalog_service


class FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


class FakeConnection:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.fetch_calls: list[tuple[str, tuple[object, ...]]] = []
        self.execute_calls: list[tuple[str, tuple[object, ...]]] = []

    async def fetch(self, query, *args):
        self.fetch_calls.append((query, args))
        return self.rows

    async def execute(self, query, *args):
        self.execute_calls.append((query, args))
        return "OK"

    def transaction(self):
        return FakeTransaction()


class FakeConnectionContext:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, *_args):
        return False


def test_fetch_static_playlist_drills_uses_problem_order_projection(monkeypatch):
    connection = FakeConnection([{"id": "p-1", "title": "One"}])
    monkeypatch.setattr(repository, "acquire_connection", lambda: FakeConnectionContext(connection))

    rows = asyncio.run(repository.fetch_static_playlist_drills("google", "mastery"))

    assert rows == [{"id": "p-1", "title": "One"}]
    assert connection.fetch_calls[0][1] == ("google", "mastery")
    assert "playlist_problem_order" in connection.fetch_calls[0][0]
    assert "practice_item" not in connection.fetch_calls[0][0]


def test_delete_static_playlist_aliases_only_removes_static_alias_rows(monkeypatch):
    connection = FakeConnection()
    monkeypatch.setattr(repository, "acquire_connection", lambda: FakeConnectionContext(connection))

    asyncio.run(repository.delete_static_playlist_aliases(["google-skeletons"]))

    assert len(connection.execute_calls) == 1
    query, args = connection.execute_calls[0]
    assert "DELETE FROM playlist" in query
    assert "static_deck = TRUE" in query
    assert args == (["google-skeletons"],)


def test_upsert_generated_problem_writes_problem_only(monkeypatch):
    connection = FakeConnection()
    monkeypatch.setattr(repository, "acquire_connection", lambda: FakeConnectionContext(connection))

    asyncio.run(repository.upsert_generated_problem(
        card_id="generated-1",
        question_type="skill-map",
        title="Generated",
        difficulty="Med.",
        prompt="Recall this",
        solution="def solution(): pass",
        missing="# missing",
        hint="Think in states",
        tags=["skill-map", "sliding-window"],
        llm_used=True,
        generation_context_json=json.dumps({"llmUsed": True}),
    ))

    assert len(connection.execute_calls) == 1
    query, args = connection.execute_calls[0]
    assert "INSERT INTO problem" in query
    assert "generated_skill_map_cards" not in query
    assert args[0] == "generated-1"


def test_catalog_service_groups_problem_backed_playlist_rows(monkeypatch):
    async def _rows():
        return [
            {
                "slug": "google",
                "title": "Google",
                "description": "Deck",
                "show_on_skill_map": True,
                "static_deck": True,
                "item_title": "1. Two Sum",
                "playlist_metadata": json.dumps({
                    "coreShape": "Arrays / Hash Maps",
                    "methods": ["pair lookup"],
                }),
            }
        ]

    monkeypatch.setattr(catalog_service, "fetch_playlist_catalog_rows", _rows)
    payload = asyncio.run(catalog_service.get_playlist_catalog())

    assert payload["playlists"][0]["slug"] == "google"
    assert payload["playlists"][0]["questions"] == [{
        "title": "1. Two Sum",
        "coreShape": "Arrays / Hash Maps",
        "methods": ["pair lookup"],
    }]
