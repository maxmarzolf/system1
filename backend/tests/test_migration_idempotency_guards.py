from __future__ import annotations

import inspect

from app import database


def test_backfill_uses_deterministic_migration_key_prefix() -> None:
    source = inspect.getsource(database._backfill_submission_attempts_from_score_attempts)
    assert "'score_attempts:' || s.legacy_attempt_id::text" in source


def test_backfill_is_idempotent_via_migration_key_conflict_guard() -> None:
    source = inspect.getsource(database._backfill_submission_attempts_from_score_attempts)
    assert "ON CONFLICT (migration_key) WHERE migration_key IS NOT NULL DO NOTHING" in source


def test_dead_signal_tables_are_dropped_on_startup() -> None:
    source = inspect.getsource(database._ensure_generated_question_schema)
    assert "DROP TABLE IF EXISTS submission_skill_evidence" in source
    assert "DROP TABLE IF EXISTS submission_misconception" in source


def test_taxonomy_remap_only_touches_legacy_slugs() -> None:
    source = inspect.getsource(database._apply_taxonomy_remap_migration)
    assert "&& $1::text[]" in source
    assert "IS DISTINCT FROM p.tags" in source


def test_taxonomy_remap_drops_legacy_tables_after_remap() -> None:
    source = inspect.getsource(database._apply_taxonomy_remap_migration)
    drop_index = source.index("DROP TABLE IF EXISTS core_algorithm_skill_map")
    remap_index = source.index("UPDATE submission a")
    assert remap_index < drop_index
    for table in (
        "core_algorithm_skill_map",
        "core_algorithm_methods",
        "core_algorithms",
        "core_algorithm_patterns",
    ):
        assert f"DROP TABLE IF EXISTS {table} CASCADE;" in source


def test_seed_taxonomy_prunes_stale_problems_and_retired_skills() -> None:
    source = inspect.getsource(database._seed_taxonomy)
    assert "DELETE FROM problem WHERE slug <> ALL($1::text[])" in source
    assert "DELETE FROM skill WHERE slug = ANY($1::text[])" in source


def test_storage_cleanup_drops_legacy_pattern_method_tables() -> None:
    source = inspect.getsource(database._apply_storage_cleanup)
    assert "DROP TABLE IF EXISTS methods CASCADE;" in source
    assert "DROP TABLE IF EXISTS patterns CASCADE;" in source
