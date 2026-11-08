"""Add algorithm.signal_spec (databases created before the signal catalog).

Revision ID: 0002
Revises: 0001
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        "ALTER TABLE algorithm ADD COLUMN IF NOT EXISTS signal_spec JSONB NOT NULL DEFAULT '{}'::jsonb"
    )


def downgrade() -> None:  # pragma: no cover
    execute_script("ALTER TABLE algorithm DROP COLUMN IF EXISTS signal_spec")
