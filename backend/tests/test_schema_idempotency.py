from __future__ import annotations

import asyncio
import inspect
import json
import sys
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path

import asyncpg
import pytest
from alembic.script import ScriptDirectory

from app import database
from app.config import settings
from app.core.signal_catalog import get_signal_spec, spec_to_json
from app.core.signals.mcq import DEFAULT_MCQ_DEFINITIONS
from app.core.taxonomy_catalog import ALGORITHMS
from app.migrations import runner

BASELINE_SQL = runner.MIGRATIONS_DIR / "versions" / "0001_baseline.sql"


# ---------------------------------------------------------------------------
# Startup and migration wiring
# ---------------------------------------------------------------------------


def test_startup_migrates_then_seeds_under_an_advisory_lock() -> None:
    source = inspect.getsource(database.connect)
    order = [
        source.index("pg_advisory_lock"),
        source.index("upgrade_to_head("),
        source.index("_seed_catalog(pool)"),
        source.index("seed_signal_definitions()"),
        source.index("pg_advisory_unlock"),
    ]
    assert order == sorted(order)
    assert "schema.sql" not in inspect.getsource(database)


def test_migrations_form_one_linear_chain_from_the_baseline() -> None:
    script = ScriptDirectory.from_config(runner.alembic_config(settings.database_url))
    assert len(script.get_heads()) == 1
    revisions = list(script.walk_revisions("base", "heads"))
    assert revisions[-1].revision == "0001"
    assert revisions[-1].down_revision is None
    assert [rev.revision for rev in reversed(revisions)] == sorted(rev.revision for rev in revisions)


def test_baseline_is_idempotent_sql_with_the_current_columns() -> None:
    schema = BASELINE_SQL.read_text(encoding="utf-8")
    assert "signal_spec JSONB NOT NULL DEFAULT '{}'::jsonb" in schema
    assert "migration_key" not in schema
    for line in schema.splitlines():
        stripped = line.strip().upper()
        if stripped.startswith("CREATE "):
            assert "IF NOT EXISTS" in stripped, line
    # The one non-CREATE statement (the submission -> problem FK) is guarded.
    assert "IF NOT EXISTS (\n        SELECT 1\n        FROM pg_constraint" in schema


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("postgresql://u:p@h:5432/db", "postgresql+asyncpg://u:p@h:5432/db"),
        ("postgres://u:p@h/db", "postgresql+asyncpg://u:p@h/db"),
        ("postgresql+asyncpg://u:p@h/db", "postgresql+asyncpg://u:p@h/db"),
    ],
)
def test_async_database_url(url: str, expected: str) -> None:
    assert runner.async_database_url(url) == expected


def test_alembic_config_escapes_percent_in_passwords() -> None:
    config = runner.alembic_config("postgresql://u:p%40ss@h/db")
    assert config.get_main_option("sqlalchemy.url") == "postgresql+asyncpg://u:p%40ss@h/db"


# ---------------------------------------------------------------------------
# Seeding (pure parts)
# ---------------------------------------------------------------------------


def test_catalog_hash_is_stable_and_sensitive_to_content() -> None:
    rows = database._taxonomy_rows()
    assert database._catalog_hash(rows, {"b": {2, 1}}) == database._catalog_hash(rows, {"b": {1, 2}})
    assert database._catalog_hash(rows, "x") != database._catalog_hash(rows, "y")


def test_taxonomy_rows_cover_every_algorithm_with_its_signal_spec() -> None:
    rows = database._taxonomy_rows()
    specs = {slug: json.loads(spec) for slug, _name, _order, spec in rows["algorithm"]}
    assert set(specs) == set(ALGORITHMS)
    for slug in ALGORITHMS:
        assert specs[slug] == spec_to_json(get_signal_spec(slug))
    assert {row[0] for row in rows["problem_skill"]} <= {row[0] for row in rows["problem"]}


def test_dedupe_pairs_keeps_the_last_order_per_pair() -> None:
    assert database._dedupe_pairs([("p", "s", 1), ("p", "t", 2), ("p", "s", 3)]) == [("p", "s", 3), ("p", "t", 2)]


def test_seed_taxonomy_prunes_stale_rows_but_never_problems_with_submissions() -> None:
    source = inspect.getsource(database._write_taxonomy)
    assert "NOT EXISTS (SELECT 1 FROM submission s WHERE s.problem_slug = p.slug)" in source
    assert "DELETE FROM skill WHERE slug <> ALL($1::text[])" in source
    assert "executemany" in source


def test_admin_reset_preserves_static_practice_items() -> None:
    from app.repositories import admin_repository

    source = inspect.getsource(admin_repository.truncate_practice_history_tables)

    assert "problem WHERE source_type = 'generated-llm'" in source
    assert "TRUNCATE TABLE" in source


# ---------------------------------------------------------------------------
# Integration: the local dev database
# ---------------------------------------------------------------------------


def _run_integration(coro_factory: Callable[[], Awaitable[object]]) -> object:
    try:
        return asyncio.run(coro_factory())
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")


async def _fetch(query: str, *args: object) -> list[asyncpg.Record]:
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(query, *args)
    finally:
        await conn.close()


async def _boot() -> None:
    await database.connect()
    await database.disconnect()


async def _startup_twice_and_read() -> tuple[list[asyncpg.Record], list[asyncpg.Record], int, int, str]:
    snapshots = []
    for _ in range(2):
        await _boot()
        snapshots.append(await _fetch("SELECT slug, signal_spec FROM algorithm ORDER BY slug"))
    unstamped = (await _fetch(
        "SELECT COUNT(*) AS n FROM submission WHERE signals ? 'evaluation' AND NOT (signals->'evaluation' ? 'signalSpec')"
    ))[0]["n"]
    migration_key_columns = (await _fetch(
        "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_name = 'submission' AND column_name = 'migration_key'"
    ))[0]["n"]
    version = (await _fetch("SELECT version_num FROM alembic_version"))[0]["version_num"]
    return snapshots[0], snapshots[1], unstamped, migration_key_columns, version


@pytest.mark.integration
def test_startup_is_idempotent_and_seeds_signal_specs() -> None:
    first, second, unstamped, migration_key_columns, version = _run_integration(_startup_twice_and_read)

    assert [dict(row) for row in first] == [dict(row) for row in second]
    stored = {row["slug"]: row["signal_spec"] for row in second}
    assert set(ALGORITHMS) <= set(stored)
    for slug in ALGORITHMS:
        assert json.loads(stored[slug]) == spec_to_json(get_signal_spec(slug))
    assert unstamped == 0
    assert migration_key_columns == 0
    script = ScriptDirectory.from_config(runner.alembic_config(settings.database_url))
    assert version == script.get_current_head()


async def _boot_with_seeders_tracked(monkeypatch: pytest.MonkeyPatch, *, stale: bool) -> tuple[list[str], str]:
    await _boot()  # make sure the stored hash matches the code
    if stale:
        conn = await asyncpg.connect(settings.database_url)
        try:
            await conn.execute("UPDATE seed_state SET hash = 'stale' WHERE key = $1", database.CATALOG_SEED_KEY)
        finally:
            await conn.close()

    calls: list[str] = []
    real_seed_taxonomy = database._seed_taxonomy

    async def _tracked_seed_taxonomy(*args, **kwargs):
        calls.append("taxonomy")
        await real_seed_taxonomy(*args, **kwargs)

    monkeypatch.setattr(database, "_seed_taxonomy", _tracked_seed_taxonomy)
    await _boot()
    stored = (await _fetch("SELECT hash FROM seed_state WHERE key = $1", database.CATALOG_SEED_KEY))[0]["hash"]
    return calls, stored


@pytest.mark.integration
def test_unchanged_catalog_skips_the_seed(monkeypatch: pytest.MonkeyPatch) -> None:
    calls, stored = _run_integration(lambda: _boot_with_seeders_tracked(monkeypatch, stale=False))

    assert calls == []
    assert len(stored) == 64


@pytest.mark.integration
def test_changed_catalog_hash_reseeds_and_stores_the_new_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    calls, stored = _run_integration(lambda: _boot_with_seeders_tracked(monkeypatch, stale=True))

    assert calls == ["taxonomy"]
    assert stored != "stale" and len(stored) == 64


async def _retire_core_problems() -> tuple[bool, bool]:
    await database.connect()
    pool = database.get_pool()
    kept_slug, free_slug = "fx-retired-core-kept", "fx-retired-core-free"
    submission_id = None
    try:
        async with pool.acquire() as conn:
            for slug in (kept_slug, free_slug):
                await conn.execute(
                    """
                    INSERT INTO problem (slug, algorithm_slug, title, difficulty, code, source_type)
                    VALUES ($1, (SELECT slug FROM algorithm ORDER BY slug LIMIT 1), $1, 'Easy', 'pass', 'core-catalog')
                    """,
                    slug,
                )
            submission_id = await conn.fetchval(
                "INSERT INTO submission (answer, problem_slug) VALUES ('fx-retired', $1) RETURNING id",
                kept_slug,
            )
        await database._seed_taxonomy(pool)
        async with pool.acquire() as conn:
            remaining = {row["slug"] for row in await conn.fetch(
                "SELECT slug FROM problem WHERE slug = ANY($1::text[])", [kept_slug, free_slug]
            )}
        return kept_slug in remaining, free_slug in remaining
    finally:
        async with pool.acquire() as conn:
            if submission_id is not None:
                await conn.execute("DELETE FROM submission WHERE id = $1", submission_id)
            await conn.execute("DELETE FROM problem WHERE slug = ANY($1::text[])", [kept_slug, free_slug])
        await database.disconnect()


@pytest.mark.integration
def test_retired_core_problem_with_submissions_is_kept_instead_of_aborting_boot() -> None:
    kept, free = _run_integration(_retire_core_problems)

    assert kept is True
    assert free is False


# ---------------------------------------------------------------------------
# Integration: throwaway databases (fresh, and shaped like a pre-Alembic one)
# ---------------------------------------------------------------------------


def _database_url(name: str) -> str:
    return settings.database_url.rsplit("/", 1)[0] + "/" + name


async def _with_scratch_database(body: Callable[[str], Awaitable[object]]) -> object:
    name = f"fx_migrations_{uuid.uuid4().hex[:12]}"
    admin = await asyncpg.connect(settings.database_url)
    try:
        await admin.execute(f'CREATE DATABASE "{name}"')
        try:
            return await body(_database_url(name))
        finally:
            await admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await admin.close()


async def _upgrade_in_subprocess(url: str) -> asyncio.subprocess.Process:
    # Alembic keeps per-process global state, so concurrent upgrades are separate processes (like real boots).
    return await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import asyncio, sys; from app.migrations.runner import upgrade_to_head; asyncio.run(upgrade_to_head(sys.argv[1]))",
        url,
        cwd=str(Path(__file__).parents[1]),
    )


async def _fresh_database_upgrades(url: str) -> tuple[str, list[str]]:
    # Two concurrent upgrades (the advisory lock serialises them), then a third.
    processes = [await _upgrade_in_subprocess(url) for _ in range(2)]
    assert [await process.wait() for process in processes] == [0, 0]
    await runner.upgrade_to_head(url)
    conn = await asyncpg.connect(url)
    try:
        version = await conn.fetchval("SELECT version_num FROM alembic_version")
        tables = [row["table_name"] for row in await conn.fetch(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        )]
    finally:
        await conn.close()
    return version, tables


@pytest.mark.integration
def test_migrations_run_twice_cleanly_on_a_fresh_database() -> None:
    version, tables = _run_integration(lambda: _with_scratch_database(_fresh_database_upgrades))

    script = ScriptDirectory.from_config(runner.alembic_config(settings.database_url))
    assert version == script.get_current_head()
    for table in ("alembic_version", "seed_state", "submission", "problem", "signal_definition", "playlist"):
        assert table in tables


LEGACY_SHAPE = """
ALTER TABLE algorithm DROP COLUMN signal_spec;
ALTER TABLE submission ADD COLUMN migration_key VARCHAR(120);
CREATE INDEX idx_submission_migration_key ON submission(migration_key);
ALTER TABLE signal_definition DROP COLUMN description;
INSERT INTO algorithm (slug, name) VALUES ('fx-algo', 'Fx');
INSERT INTO problem (slug, algorithm_slug, title, difficulty, code) VALUES ('fx-problem', 'fx-algo', 'Fx', 'Easy', 'pass');
"""


async def _legacy_database_upgrades(url: str) -> dict[str, object]:
    default = DEFAULT_MCQ_DEFINITIONS[0]
    conn = await asyncpg.connect(url)
    try:
        await conn.execute(BASELINE_SQL.read_text(encoding="utf-8"))
        await conn.execute(LEGACY_SHAPE)
        await conn.execute(
            """
            INSERT INTO signal_definition (key, modality, label, source, primitive, role)
            VALUES ($1, 'mcq', $2, 'jev', 'noul', 'dimension')
            """,
            default["key"],
            default["label"],
        )
        unstamped_id = await conn.fetchval(
            """INSERT INTO submission (answer, signals) VALUES ('a', '{"elapsed_ms": 1, "evaluation": {"score": 1}}')
            RETURNING id"""
        )
        unlinked_id = await conn.fetchval(
            "INSERT INTO submission (answer, generated_card_id) VALUES ('b', 'core-algorithm-fx-problem') RETURNING id"
        )
    finally:
        await conn.close()

    await runner.upgrade_to_head(url)
    await runner.upgrade_to_head(url)

    conn = await asyncpg.connect(url)
    try:
        columns = {
            (row["table_name"], row["column_name"])
            for row in await conn.fetch("SELECT table_name, column_name FROM information_schema.columns")
        }
        return {
            "version": await conn.fetchval("SELECT version_num FROM alembic_version"),
            "signal_spec": ("algorithm", "signal_spec") in columns,
            "migration_key": ("submission", "migration_key") in columns,
            "stamped": json.loads(await conn.fetchval(
                "SELECT signals->'evaluation'->'signalSpec' FROM submission WHERE id = $1", unstamped_id
            )),
            "linked": await conn.fetchval("SELECT problem_slug FROM submission WHERE id = $1", unlinked_id),
            "description": await conn.fetchval(
                "SELECT description FROM signal_definition WHERE key = $1", default["key"]
            ),
            "fk": await conn.fetchval(
                "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'submission_problem_slug_fkey'"
            ),
        }
    finally:
        await conn.close()


@pytest.mark.integration
def test_migrations_upgrade_a_pre_alembic_database_and_rerun_cleanly() -> None:
    result = _run_integration(lambda: _with_scratch_database(_legacy_database_upgrades))

    script = ScriptDirectory.from_config(runner.alembic_config(settings.database_url))
    assert result["version"] == script.get_current_head()
    assert result["signal_spec"] is True
    assert result["migration_key"] is False
    assert result["stamped"] == {"algorithm": "default", "version": 0}
    assert result["linked"] == "fx-problem"
    assert result["description"] == DEFAULT_MCQ_DEFINITIONS[0]["description"]
    assert result["fk"] == 1
