from __future__ import annotations

import inspect

from app import database


def test_backfill_uses_deterministic_migration_key_prefix() -> None:
    source = inspect.getsource(database._backfill_answer_attempts_from_score_attempts)
    assert "'score_attempts:' || s.legacy_attempt_id::text" in source


def test_backfill_is_idempotent_via_migration_key_conflict_guard() -> None:
    source = inspect.getsource(database._backfill_answer_attempts_from_score_attempts)
    assert "ON CONFLICT (migration_key) DO NOTHING" in source
