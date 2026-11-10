"""Add signal_definition.description; when the column is new, describe the seeded signals.

Revision ID: 0005
Revises: 0004
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text
from sqlalchemy.util import await_only

from app.migrations.runner import execute_script

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    exists = op.get_bind().execute(
        text(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'signal_definition' AND column_name = 'description'
            """
        )
    ).scalar()
    if exists:
        return
    execute_script("ALTER TABLE signal_definition ADD COLUMN description TEXT NOT NULL DEFAULT ''")

    # The descriptions of the defaults at the time; keys that no longer exist are skipped.
    from app.core.signals.mcq import DEFAULT_MCQ_DEFINITIONS

    driver_connection = op.get_bind().connection.driver_connection
    await_only(
        driver_connection.executemany(
            "UPDATE signal_definition SET description = $2 WHERE key = $1 AND description = ''",
            [(definition["key"], definition["description"]) for definition in DEFAULT_MCQ_DEFINITIONS],
        )
    )


def downgrade() -> None:  # pragma: no cover
    execute_script("ALTER TABLE signal_definition DROP COLUMN IF EXISTS description")
