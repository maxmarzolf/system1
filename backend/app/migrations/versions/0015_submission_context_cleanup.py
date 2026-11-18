"""Remove redundant submission context columns after repairing legacy modalities.

Revision ID: 0015
Revises: 0014
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        -- Older MCQ submissions defaulted to total-recall. Their stored question
        -- reference and question_type are more reliable than that old default.
        UPDATE submission
        SET modality = 'mcq'
        WHERE (multiple_choice_problem_id IS NOT NULL OR question_type LIKE 'skill-map-mcq%')
          AND modality <> 'mcq';

        UPDATE submission s
        SET modality = e.modality
        FROM generated_exercise e
        WHERE s.exercise_id = e.id AND s.modality <> e.modality;

        UPDATE submission
        SET modality = 'ghost-rep'
        WHERE support_layer = 'ghost-reps'
          AND multiple_choice_problem_id IS NULL
          AND exercise_id IS NULL
          AND modality <> 'ghost-rep';

        DROP INDEX IF EXISTS idx_submission_question_type_created_at;
        DROP INDEX IF EXISTS idx_submission_template_support_created_at;
        DROP INDEX IF EXISTS idx_submission_card_id_created_at;

        CREATE INDEX idx_submission_card_id_created_at
            ON submission ((COALESCE(generated_card_id, multiple_choice_problem_id, exercise_id)), created_at DESC);

        ALTER TABLE submission
            DROP COLUMN IF EXISTS question_type,
            DROP COLUMN IF EXISTS template_mode,
            DROP COLUMN IF EXISTS support_layer;
        """
    )


def downgrade() -> None:  # pragma: no cover - forward-only
    raise NotImplementedError("0015 is forward-only")
