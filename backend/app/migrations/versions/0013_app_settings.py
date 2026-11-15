"""Server-side settings edited on /admin, and the end of the code-defined recall specs.

- ``app_setting``: one JSON document per section (``grading``, ``generation``, ``practice``),
  versioned for safe concurrent edits. Missing sections use the defaults in
  ``app/services/app_settings_service.py``.
- ``algorithm.signal_spec`` is dropped: recall signals are ``signal_definition`` rows now
  (migration 0011), edited on /admin like every other modality's.

Revision ID: 0013
Revises: 0012
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        CREATE TABLE IF NOT EXISTS app_setting (
            key VARCHAR(40) PRIMARY KEY,
            value JSONB NOT NULL CHECK (jsonb_typeof(value) = 'object'),
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE algorithm DROP COLUMN IF EXISTS signal_spec;
        """
    )


def downgrade() -> None:  # pragma: no cover - forward-only
    raise NotImplementedError("0013 is forward-only")
