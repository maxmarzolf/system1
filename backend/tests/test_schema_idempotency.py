from __future__ import annotations

import asyncio
import inspect
import json

import asyncpg
import pytest

from app import database
from app.config import settings
from app.core.signal_catalog import get_signal_spec, spec_to_json
from app.core.taxonomy_catalog import ALGORITHMS


def test_startup_runs_schema_then_upgrades_then_seed() -> None:
    source = inspect.getsource(database.connect)
    order = [
        source.index("_ensure_schema(pool)"),
        source.index("_apply_schema_upgrades(pool)"),
        source.index("_seed_taxonomy(pool)"),
        source.index("seed_canonical_catalog()"),
    ]
    assert order == sorted(order)


def test_schema_file_defines_algorithm_signal_spec_and_no_migration_key() -> None:
    schema = database.SCHEMA_PATH.read_text(encoding="utf-8")
    assert "signal_spec JSONB NOT NULL DEFAULT '{}'::jsonb" in schema
    assert "migration_key" not in schema


def test_seed_taxonomy_prunes_stale_problems_and_skills() -> None:
    source = inspect.getsource(database._seed_taxonomy)
    assert "DELETE FROM problem WHERE source_type IN ('core-catalog', 'core-meta')" in source
    assert "DELETE FROM skill WHERE slug <> ALL($1::text[])" in source


def test_admin_reset_preserves_static_practice_items() -> None:
    from app.repositories import admin_repository

    source = inspect.getsource(admin_repository.truncate_practice_history_tables)

    assert "problem WHERE source_type = 'generated-llm'" in source
    assert "TRUNCATE TABLE" in source


async def _startup_twice_and_read() -> tuple[list[asyncpg.Record], list[asyncpg.Record], int, int]:
    snapshots = []
    for _ in range(2):
        await database.connect()
        await database.disconnect()
        conn = await asyncpg.connect(settings.database_url)
        try:
            snapshots.append(await conn.fetch("SELECT slug, signal_spec FROM algorithm ORDER BY slug"))
        finally:
            await conn.close()
    conn = await asyncpg.connect(settings.database_url)
    try:
        unstamped = await conn.fetchval(
            "SELECT COUNT(*) FROM submission WHERE signals ? 'evaluation' AND NOT (signals->'evaluation' ? 'signalSpec')"
        )
        migration_key_columns = await conn.fetchval(
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'submission' AND column_name = 'migration_key'"
        )
    finally:
        await conn.close()
    return snapshots[0], snapshots[1], unstamped, migration_key_columns


@pytest.mark.integration
def test_startup_is_idempotent_and_seeds_signal_specs() -> None:
    try:
        first, second, unstamped, migration_key_columns = asyncio.run(_startup_twice_and_read())
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert [dict(row) for row in first] == [dict(row) for row in second]
    stored = {row["slug"]: row["signal_spec"] for row in second}
    assert set(ALGORITHMS) <= set(stored)
    for slug in ALGORITHMS:
        assert json.loads(stored[slug]) == spec_to_json(get_signal_spec(slug))
    assert unstamped == 0
    assert migration_key_columns == 0



async def _backfill_round_trip() -> tuple[str, str | None]:
    conn = await asyncpg.connect(settings.database_url)
    try:
        slug = await conn.fetchval("SELECT slug FROM problem WHERE source_type = 'core-catalog' ORDER BY display_order LIMIT 1")
        attempt_id = await conn.fetchval(
            """
            INSERT INTO submission (answer, generated_card_id, problem_slug)
            VALUES ('fx-backfill', $1, NULL)
            RETURNING id
            """,
            f"core-algorithm-{slug}",
        )
    finally:
        await conn.close()
    try:
        await database.connect()
        await database.disconnect()
        conn = await asyncpg.connect(settings.database_url)
        try:
            return slug, await conn.fetchval("SELECT problem_slug FROM submission WHERE id = $1", attempt_id)
        finally:
            await conn.close()
    finally:
        conn = await asyncpg.connect(settings.database_url)
        try:
            await conn.execute("DELETE FROM submission WHERE id = $1", attempt_id)
        finally:
            await conn.close()


@pytest.mark.integration
def test_startup_links_core_algorithm_submissions_to_their_problem() -> None:
    try:
        slug, linked = asyncio.run(_backfill_round_trip())
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    assert linked == slug
