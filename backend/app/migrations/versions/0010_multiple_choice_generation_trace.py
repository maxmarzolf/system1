"""Store how each generated MCQ was made.

``multiple_choice_problem.generation_trace`` holds the LLM exchanges that produced the
question, in order, failed attempts included: provider, model, call settings, system prompt,
payload, raw reply, parsed reply, token usage, latency and any error. API keys and headers
are never stored. Rows generated before this migration get ``[]``.

Revision ID: 0010
Revises: 0009
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        ALTER TABLE multiple_choice_problem
            ADD COLUMN IF NOT EXISTS generation_trace JSONB NOT NULL DEFAULT '[]'::jsonb;
        """
    )


def downgrade() -> None:  # pragma: no cover - forward-only
    raise NotImplementedError("0010 is forward-only")
