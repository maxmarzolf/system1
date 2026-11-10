"""Drop columns nothing reads and indexes no query uses.

- submission: user_id (always '0000'; single user), target_source, target_control,
  format_control (write-only), updated_at (submissions are immutable).
- problem: prompt (always equal to description), llm_used (also in generation_context).
- playlist_problem_order: tier, family (also in metadata).
- Indexes: the single-user and write-only ones, the plain multiple_choice_problem_id
  index (the (id, created_at) index covers it), and interaction/session lookups no
  query makes. The card-id lookup gets an expression index matching how it is queried.

Revision ID: 0008
Revises: 0007
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script(
        """
        DROP INDEX IF EXISTS idx_submission_session_user;
        DROP INDEX IF EXISTS idx_submission_multiple_choice_problem_id;
        DROP INDEX IF EXISTS idx_submission_interaction_id;
        DROP INDEX IF EXISTS idx_submission_session_id_created_at;
        DROP INDEX IF EXISTS idx_submission_generated_card_id;

        ALTER TABLE submission
            DROP COLUMN IF EXISTS user_id,
            DROP COLUMN IF EXISTS target_source,
            DROP COLUMN IF EXISTS target_control,
            DROP COLUMN IF EXISTS format_control,
            DROP COLUMN IF EXISTS updated_at;

        CREATE INDEX IF NOT EXISTS idx_submission_card_id_created_at
            ON submission ((COALESCE(generated_card_id, multiple_choice_problem_id)), created_at DESC);

        ALTER TABLE problem
            DROP COLUMN IF EXISTS prompt,
            DROP COLUMN IF EXISTS llm_used;

        ALTER TABLE playlist_problem_order
            DROP COLUMN IF EXISTS tier,
            DROP COLUMN IF EXISTS family;
        """
    )


def downgrade() -> None:  # pragma: no cover - the dropped columns held nothing that is read
    pass
