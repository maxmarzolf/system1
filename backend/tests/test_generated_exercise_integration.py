"""Generated exercises (microdrills, ladder rungs) are stored and read back from Postgres."""

from __future__ import annotations

import asyncio

import asyncpg
import pytest

from app.config import settings
from app.repositories import exercise_repository


async def _round_trip() -> tuple[dict, dict | None, list[dict]]:
    created = await exercise_repository.insert_exercise(
        modality="microdrill",
        prompt="Fill the window.",
        reference="def f():\n    return 1",
        metadata={"template": "def f():\n    return ___", "answers": ["1"]},
        generation_trace=[{"attempt": 1, "provider": "claude", "ok": True}],
        algorithm_slug="sliding-window",
    )
    fetched = await exercise_repository.fetch_exercise(created["id"])
    recent = await exercise_repository.fetch_recent_exercises("microdrill", limit=5)
    return created, fetched, recent


async def _cleanup(item_id: str) -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("DELETE FROM generated_exercise WHERE id = $1", item_id)
    finally:
        await conn.close()


@pytest.mark.integration
def test_generated_exercises_round_trip() -> None:
    from app.database import connect, disconnect

    async def run():
        await connect()
        try:
            return await _round_trip()
        finally:
            await disconnect()

    created, fetched, recent = asyncio.run(run())
    try:
        assert created["id"].startswith("microdrill-") and created["algorithmSlug"] == "sliding-window"
        assert fetched == created
        assert fetched["metadata"]["answers"] == ["1"] and fetched["generationTrace"][0]["provider"] == "claude"
        assert any(item["id"] == created["id"] for item in recent)
        assert asyncio.run(_missing()) is None
    finally:
        asyncio.run(_cleanup(created["id"]))


async def _missing():
    from app.database import connect, disconnect

    await connect()
    try:
        return await exercise_repository.fetch_exercise("nope")
    finally:
        await disconnect()
