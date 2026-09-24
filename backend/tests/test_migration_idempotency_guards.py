from __future__ import annotations

import inspect

from app import database


def test_backfill_uses_deterministic_migration_key_prefix() -> None:
    source = inspect.getsource(database._backfill_submission_attempts_from_score_attempts)
    assert "'score_attempts:' || s.legacy_attempt_id::text" in source


def test_backfill_is_idempotent_via_migration_key_conflict_guard() -> None:
    source = inspect.getsource(database._backfill_submission_attempts_from_score_attempts)
    assert "ON CONFLICT (migration_key) WHERE migration_key IS NOT NULL DO NOTHING" in source


def test_answer_migration_targets_submission_signals_column() -> None:
    source = inspect.getsource(database._ensure_generated_question_schema)
    assert "successful,\n                        signals,\n                        interaction_id," in source
    assert "'source', 'answer-migration'" in source
    assert "SET signals = '{\"elapsed_ms\": 0}'::jsonb || signals;\n\n            ALTER TABLE submission\n            DROP CONSTRAINT IF EXISTS submission_signals_object_check;" in source


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
    assert "DELETE FROM problem WHERE source_type IN ('core-catalog', 'core-meta')" in source
    assert "DELETE FROM skill WHERE slug = ANY($1::text[])" in source


def test_storage_cleanup_drops_legacy_pattern_method_tables() -> None:
    source = inspect.getsource(database._apply_storage_cleanup)
    assert "DROP TABLE IF EXISTS methods CASCADE;" in source
    assert "DROP TABLE IF EXISTS patterns CASCADE;" in source


def test_canonical_problem_schema_is_initialized_before_seeding() -> None:
    connect_source = inspect.getsource(database.connect)
    schema_source = inspect.getsource(database._ensure_canonical_problem_schema)

    assert "await _ensure_canonical_problem_schema(pool)" in connect_source
    assert "ALTER TABLE problem" in schema_source
    assert "CREATE TABLE IF NOT EXISTS playlist_problem_order" in schema_source
    assert "submission_problem_slug_fkey" in schema_source


def test_canonical_problem_schema_drops_practice_tables() -> None:
    source = inspect.getsource(database._ensure_canonical_problem_schema)

    for table in (
        "practice_item_generation_event",
        "practice_item_focus_profile",
        "practice_item_related_problem",
        "playlist_ordering",
        "playlist_item",
        "practice_item",
    ):
        assert f"DROP TABLE IF EXISTS {table}" in source


def test_admin_reset_preserves_static_practice_items() -> None:
    from app.repositories import admin_repository

    source = inspect.getsource(admin_repository.truncate_practice_history_tables)

    assert "problem WHERE source_type = 'generated-llm'" in source
    assert "TRUNCATE TABLE" in source
