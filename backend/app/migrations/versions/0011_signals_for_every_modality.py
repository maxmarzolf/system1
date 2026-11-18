"""One signal system for every modality.

- ``signal_definition.modality`` allows every practice modality (it was MCQ only), and its key
  becomes ``(modality, key)`` so modalities can share signal keys (``completionTime``,
  ``nearMiss``) with the same meaning.
- Revision subjects for signals become ``<modality>:<key>`` (directives stay ``directive:<modality>``).
- ``signal_evaluation_directive.correctness_source``: ``jev`` asks Jev the correctness question;
  ``deterministic`` lets the modality's own check decide (ghost reps).
- ``submission.modality`` allows ``ladder`` (Sliding Window Ladder rungs were saved as microdrills).

Defaults for the new modalities are seeded at startup from ``app/core/signals/defaults.py``.

Revision ID: 0011
Revises: 0010
"""

from __future__ import annotations

from app.migrations.runner import execute_script

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

MODALITIES = "'mcq', 'total-recall', 'ghost-rep', 'microdrill', 'ladder'"


def upgrade() -> None:
    execute_script(
        f"""
        ALTER TABLE signal_definition DROP CONSTRAINT IF EXISTS signal_definition_modality_check;
        ALTER TABLE signal_definition
            ADD CONSTRAINT signal_definition_modality_check CHECK (modality IN ({MODALITIES}));

        DO $$
        BEGIN
            IF (
                SELECT array_agg(attribute.attname ORDER BY attribute.attname)
                FROM pg_index index
                JOIN pg_attribute attribute
                  ON attribute.attrelid = index.indrelid AND attribute.attnum = ANY(index.indkey)
                WHERE index.indrelid = 'signal_definition'::regclass AND index.indisprimary
            ) = ARRAY['key']::name[] THEN
                ALTER TABLE signal_definition DROP CONSTRAINT signal_definition_pkey;
                ALTER TABLE signal_definition ADD CONSTRAINT signal_definition_pkey PRIMARY KEY (modality, key);
            END IF;
        END $$;

        UPDATE signal_definition_revision
        SET subject = 'mcq:' || subject
        WHERE subject NOT LIKE 'directive:%' AND position(':' IN subject) = 0;

        ALTER TABLE signal_evaluation_directive
            ADD COLUMN IF NOT EXISTS correctness_source VARCHAR(20) NOT NULL DEFAULT 'jev'
                CONSTRAINT signal_evaluation_directive_correctness_source_check
                CHECK (correctness_source IN ('jev', 'deterministic'));

        ALTER TABLE submission DROP CONSTRAINT IF EXISTS submission_modality_check;
        ALTER TABLE submission
            ADD CONSTRAINT submission_modality_check CHECK (modality IN ({MODALITIES}));
        """
    )


def downgrade() -> None:  # pragma: no cover - forward-only
    raise NotImplementedError("0011 is forward-only")
