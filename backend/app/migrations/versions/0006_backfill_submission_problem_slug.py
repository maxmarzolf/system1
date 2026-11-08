"""Link core catalog submissions ('core-algorithm-<slug>' cards) to their problem.

Revision ID: 0006
Revises: 0005
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        UPDATE submission s
        SET problem_slug = p.slug
        FROM problem p
        WHERE s.problem_slug IS NULL
          AND s.generated_card_id = 'core-algorithm-' || p.slug;
        """
    )


def downgrade() -> None:  # pragma: no cover - one-way data fix
    pass
