"""Stored generated exercises: every generated microdrill and ladder rung, graded against its stored copy.

``generated_exercise`` holds what the learner was asked and the server's answer for it, like
``multiple_choice_problem`` does for MCQs:

- ``modality`` (``microdrill`` or ``ladder``), ``algorithm_slug`` when known;
- ``prompt`` (the task), ``reference`` (the correct solution);
- ``metadata`` (modality details: a microdrill's ``template`` and ``answers``, a rung's
  ``starterCode``, ``technique`` and ``rungIndex``…);
- ``generation_trace``: the LLM exchanges that produced it.

``submission.exercise_id`` links an answer to the item it answered.

Revision ID: 0012
Revises: 0011
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        CREATE TABLE IF NOT EXISTS generated_exercise (
            id VARCHAR(80) PRIMARY KEY,
            modality VARCHAR(30) NOT NULL CHECK (modality IN ('microdrill', 'ladder')),
            algorithm_slug VARCHAR(80) REFERENCES algorithm(slug) ON DELETE SET NULL,
            prompt TEXT NOT NULL,
            reference TEXT NOT NULL,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
            generation_trace JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(generation_trace) = 'array'),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_generated_exercise_modality_created_at ON generated_exercise(modality, created_at DESC);

        ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS exercise_id VARCHAR(80) REFERENCES generated_exercise(id) ON DELETE SET NULL;
        """
    )


def downgrade() -> None:  # pragma: no cover - forward-only
    raise NotImplementedError("0012 is forward-only")
