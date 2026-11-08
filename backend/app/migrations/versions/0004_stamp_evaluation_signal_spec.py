"""Stamp stored evaluations that predate signalSpec with the default spec, version 0.

Revision ID: 0004
Revises: 0003
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        UPDATE submission
        SET signals = jsonb_set(signals, '{evaluation,signalSpec}', '{"algorithm": "default", "version": 0}'::jsonb)
        WHERE signals ? 'evaluation'
          AND NOT (signals->'evaluation' ? 'signalSpec');
        """
    )


def downgrade() -> None:  # pragma: no cover - one-way data fix
    pass
