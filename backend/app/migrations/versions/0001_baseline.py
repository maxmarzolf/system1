"""Baseline: the schema as it stood when Alembic was introduced.

Every statement in 0001_baseline.sql is IF NOT EXISTS (the submission FK is
guarded by a DO block), so this revision is also safe on databases created
before Alembic: it creates nothing that already exists.

Revision ID: 0001
Revises:
"""

from __future__ import annotations

from app.migrations.runner import execute_script, read_sql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(read_sql(__file__))


def downgrade() -> None:  # pragma: no cover - the baseline is never rolled back
    raise NotImplementedError("Drop the database instead of downgrading the baseline.")
