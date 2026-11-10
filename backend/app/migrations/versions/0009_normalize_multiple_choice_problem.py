"""Normalize multiple_choice_problem.

- The four fixed label/text column pairs become one ``choices`` JSONB array of
  ``{"id", "text"}``, and the correct answer is stored once, as ``correct_choice_id``.
- ``question_help_text`` becomes ``explanation``, the name the API uses.
- ``algorithm_slug`` links an MCQ to its algorithm (nullable; set when generated).
  Existing rows are linked from the tags of submissions that answered them.
- ``created_date`` (naive TIMESTAMP, stored as UTC) becomes ``created_at TIMESTAMPTZ``.
- ``user_id``, ``recall_answer``, ``modified_date`` and the duplicated
  ``multiple_choice_correct_answer_text`` are dropped.

Revision ID: 0009
Revises: 0008
"""

from __future__ import annotations

from sqlalchemy import text

from alembic import op
from app.migrations.runner import execute_script

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def _has_column(column: str) -> bool:
    return bool(
        op.get_bind()
        .execute(
            text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'multiple_choice_problem' AND column_name = :column
                """
            ),
            {"column": column},
        )
        .scalar()
    )


def upgrade() -> None:
    if not _has_column("multiple_choice_answer_label_1"):
        return  # already normalized
    execute_script(
        """
        ALTER TABLE multiple_choice_problem
            ADD COLUMN choices JSONB NOT NULL DEFAULT '[]'::jsonb
                CONSTRAINT multiple_choice_problem_choices_array_check CHECK (jsonb_typeof(choices) = 'array'),
            ADD COLUMN correct_choice_id VARCHAR(8) NOT NULL DEFAULT '',
            ADD COLUMN algorithm_slug VARCHAR(80) REFERENCES algorithm(slug) ON DELETE SET NULL,
            ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        UPDATE multiple_choice_problem q
        SET choices = COALESCE(
                (
                    SELECT jsonb_agg(jsonb_build_object('id', c.label, 'text', c.body) ORDER BY c.position)
                    FROM (VALUES
                        (1, q.multiple_choice_answer_label_1, q.multiple_choice_answer_text_1),
                        (2, q.multiple_choice_answer_label_2, q.multiple_choice_answer_text_2),
                        (3, q.multiple_choice_answer_label_3, q.multiple_choice_answer_text_3),
                        (4, q.multiple_choice_answer_label_4, q.multiple_choice_answer_text_4)
                    ) AS c(position, label, body)
                    WHERE COALESCE(c.label, '') <> '' AND COALESCE(c.body, '') <> ''
                ),
                '[]'::jsonb
            ),
            correct_choice_id = COALESCE(q.multiple_choice_correct_answer_label, ''),
            created_at = q.created_date AT TIME ZONE 'UTC',
            algorithm_slug = (
                SELECT a.slug
                FROM submission s
                JOIN algorithm a ON a.slug = ANY(s.category_tags)
                WHERE s.multiple_choice_problem_id = q.id
                ORDER BY s.created_at
                LIMIT 1
            );

        DROP INDEX IF EXISTS idx_multiple_choice_problem_user_id;
        DROP INDEX IF EXISTS idx_multiple_choice_problem_created_date;

        ALTER TABLE multiple_choice_problem
            DROP COLUMN user_id,
            DROP COLUMN recall_answer,
            DROP COLUMN multiple_choice_answer_label_1,
            DROP COLUMN multiple_choice_answer_text_1,
            DROP COLUMN multiple_choice_answer_label_2,
            DROP COLUMN multiple_choice_answer_text_2,
            DROP COLUMN multiple_choice_answer_label_3,
            DROP COLUMN multiple_choice_answer_text_3,
            DROP COLUMN multiple_choice_answer_label_4,
            DROP COLUMN multiple_choice_answer_text_4,
            DROP COLUMN multiple_choice_correct_answer_label,
            DROP COLUMN multiple_choice_correct_answer_text,
            DROP COLUMN created_date,
            DROP COLUMN modified_date;

        ALTER TABLE multiple_choice_problem RENAME COLUMN question_help_text TO explanation;

        CREATE INDEX IF NOT EXISTS idx_multiple_choice_problem_created_at
            ON multiple_choice_problem(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_multiple_choice_problem_algorithm
            ON multiple_choice_problem(algorithm_slug);
        """
    )


def downgrade() -> None:  # pragma: no cover - forward-only
    raise NotImplementedError("0009 is forward-only")
