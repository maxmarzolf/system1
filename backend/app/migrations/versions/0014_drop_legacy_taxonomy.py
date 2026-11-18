"""Remove the seeded skill and technique label tables.

Problem tags remain on problem rows; submissions never referenced these tables.

Revision ID: 0014
Revises: 0013
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        DROP TABLE IF EXISTS problem_skill;
        DROP TABLE IF EXISTS problem_technique;
        DROP TABLE IF EXISTS skill;
        DROP TABLE IF EXISTS technique;
        """
    )


def downgrade() -> None:  # pragma: no cover - forward-only
    raise NotImplementedError("0014 is forward-only")
