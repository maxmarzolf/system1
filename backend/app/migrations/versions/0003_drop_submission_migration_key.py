"""Drop the retired submission.migration_key column and its index.

Revision ID: 0003
Revises: 0002
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        DROP INDEX IF EXISTS idx_submission_migration_key;
        ALTER TABLE submission DROP COLUMN IF EXISTS migration_key;
        """
    )


def downgrade() -> None:  # pragma: no cover - the column held nothing worth restoring
    pass
