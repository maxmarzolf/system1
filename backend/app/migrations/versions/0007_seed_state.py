"""seed_state: a hash of the code catalogs last written, so unchanged boots skip seeding.

Revision ID: 0007
Revises: 0006
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        CREATE TABLE IF NOT EXISTS seed_state (
            key VARCHAR(80) PRIMARY KEY,
            hash VARCHAR(64) NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )


def downgrade() -> None:  # pragma: no cover
    execute_script("DROP TABLE IF EXISTS seed_state")
