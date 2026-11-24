"""Signals become relational: one row per signal per submission, pointing at its definition.

``submission.signals`` held everything about a graded answer as one JSON document. This revision
moves it into tables (and 0017 drops the JSON once every value is accounted for):

- ``signal_definition`` gets a surrogate ``id`` (``(modality, key)`` stays unique) so other tables
  can point at a definition, and the role ``correctness``. Each modality's correctness question
  moves here from ``signal_evaluation_directive`` as a ``correctness`` row; its revision history
  moves from ``directive:<modality>`` to ``<modality>:correctness``.
- Signal keys stored in old evaluations with no definition (the retired LLM grader's
  ``syntax``…) get an archived definition, so every stored signal has one.
- ``submission_evaluation``: one row per graded submission (verdict, scores, who decided
  correctness, provenance; feedback, traces and the spec snapshot as JSONB documents).
- ``submission_signal``: one row per signal (definition, version and weight as graded, status,
  score, the raw value in a typed column, confidence, source, model).
- ``submission`` gets ``elapsed_ms``, ``flow_context`` and ``modality_context``.

Existing evaluations are split with ``app.contracts.evaluation_rows.split_evaluation``, the same
function the app writes with, which round-trips every stored evaluation exactly.

Revision ID: 0016
Revises: 0015
"""

from __future__ import annotations

import json

from alembic import op
from sqlalchemy.util import await_only

from app.contracts.evaluation_rows import CORRECTNESS_KEY, signal_keys
from app.migrations.runner import execute_script
from app.repositories.submission_signal_repository import definition_refs, insert_evaluation

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

def _schema() -> None:
    execute_script(
        """
        ALTER TABLE signal_definition ADD COLUMN IF NOT EXISTS id BIGSERIAL;
        DO $$ BEGIN
            ALTER TABLE signal_definition ADD CONSTRAINT signal_definition_id_key UNIQUE (id);
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

        ALTER TABLE signal_definition DROP CONSTRAINT IF EXISTS signal_definition_role_check;
        ALTER TABLE signal_definition ADD CONSTRAINT signal_definition_role_check
            CHECK (role IN ('dimension', 'modifier', 'diagnostic', 'correctness'));
        ALTER TABLE signal_definition DROP CONSTRAINT IF EXISTS signal_definition_source_fields_check;
        ALTER TABLE signal_definition ADD CONSTRAINT signal_definition_source_fields_check CHECK (
            (role = 'correctness' AND implementation IS NULL
                AND ((source = 'jev' AND primitive = 'choice') OR (source = 'deterministic' AND primitive IS NULL)))
            OR (role <> 'correctness' AND (
                (source = 'jev' AND primitive IS NOT NULL AND implementation IS NULL)
                OR (source = 'deterministic' AND primitive IS NULL AND implementation IS NOT NULL)))
        );

        -- Each modality's correctness question becomes a definition row (same version and history).
        INSERT INTO signal_definition
            (key, modality, scope, label, description, source, primitive, implementation, instructions, criteria,
             score_map, role, axis, applies_when, needs_correctness, weight, display_order, status, version, updated_at)
        SELECT 'correctness', d.modality, 'general', 'Correctness',
               'Whether the answer was correct. Labels are fixed: "1" correct, "0" incorrect.',
               d.correctness_source, CASE WHEN d.correctness_source = 'jev' THEN 'choice' END, NULL,
               d.instructions, d.criteria::json, '{}'::jsonb, 'correctness', NULL, 'always', FALSE,
               d.correctness_weight, 0, 'active', d.version, d.updated_at
        FROM signal_evaluation_directive d
        ON CONFLICT (modality, key) DO NOTHING;

        UPDATE signal_definition_revision
        SET subject = substring(subject FROM length('directive:') + 1) || ':correctness'
        WHERE subject LIKE 'directive:%';

        CREATE TABLE IF NOT EXISTS submission_evaluation (
            submission_id BIGINT PRIMARY KEY REFERENCES submission(id) ON DELETE CASCADE,
            evaluation_version INTEGER,
            has_rubric BOOLEAN NOT NULL DEFAULT FALSE,
            verdict VARCHAR(20),
            overall_score DOUBLE PRECISION,
            scores JSONB,
            primary_failure JSONB,
            recommended_action TEXT,
            feedback JSONB,
            spec_algorithm VARCHAR(80),
            spec_version INTEGER,
            spec_modality VARCHAR(30),
            spec_hash VARCHAR(64),
            engine VARCHAR(30),
            model VARCHAR(120),
            flags TEXT[],
            feedback_provider VARCHAR(30),
            provenance_extra JSONB,
            correctness_source VARCHAR(40),
            correctness_label VARCHAR(20),
            correctness_confidence DOUBLE PRECISION,
            answer_key_agreement BOOLEAN,
            correctness_extra JSONB,
            spec_snapshot JSONB,
            jev_trace JSONB,
            llm_trace JSONB,
            extra JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS submission_signal (
            id BIGSERIAL PRIMARY KEY,
            submission_id BIGINT NOT NULL REFERENCES submission(id) ON DELETE CASCADE,
            signal_definition_id BIGINT NOT NULL REFERENCES signal_definition(id) ON DELETE RESTRICT,
            definition_version INTEGER NOT NULL,
            role VARCHAR(20) NOT NULL CHECK (role IN ('dimension', 'modifier', 'diagnostic', 'correctness')),
            weight DOUBLE PRECISION NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL CHECK (status IN ('scored', 'not_applicable', 'unavailable')),
            score DOUBLE PRECISION CHECK (score IS NULL OR status = 'scored'),
            grade VARCHAR(20),
            value_kind VARCHAR(10) NOT NULL DEFAULT 'null'
                CHECK (value_kind IN ('null', 'text', 'number', 'integer', 'boolean')),
            value_text TEXT,
            value_number DOUBLE PRECISION,
            value_boolean BOOLEAN,
            confidence DOUBLE PRECISION,
            note TEXT NOT NULL DEFAULT '',
            evidence TEXT[] NOT NULL DEFAULT '{}',
            source VARCHAR(20) NOT NULL CHECK (source IN ('jev', 'deterministic', 'llm-grader', 'answer-key')),
            model VARCHAR(120),
            position INTEGER NOT NULL DEFAULT 0,
            rubric_placement VARCHAR(20) CHECK (rubric_placement IN ('dimensions', 'modifiers')),
            in_results BOOLEAN NOT NULL DEFAULT FALSE,
            extra JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT submission_signal_one_value_check CHECK (
                (value_text IS NOT NULL)::int + (value_number IS NOT NULL)::int + (value_boolean IS NOT NULL)::int <= 1),
            CONSTRAINT submission_signal_definition_unique UNIQUE (submission_id, signal_definition_id)
        );
        CREATE INDEX IF NOT EXISTS idx_submission_signal_definition ON submission_signal (signal_definition_id);

        ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS flow_context JSONB,
            ADD COLUMN IF NOT EXISTS modality_context JSONB;
        UPDATE submission SET
            elapsed_ms = GREATEST(COALESCE(round((signals->>'elapsed_ms')::numeric), 0), 0)::int,
            flow_context = CASE WHEN jsonb_typeof(signals->'flow') = 'object' THEN signals->'flow' END,
            modality_context = CASE WHEN jsonb_typeof(signals->'modality') = 'object' THEN signals->'modality' END
        WHERE signals IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_submission_flow_context_anchor_created_at
            ON submission ((flow_context->>'anchorCardId'), created_at DESC) WHERE flow_context IS NOT NULL;
        """
    )


def _label(evaluation: dict, key: str) -> str:
    for section in ("signalResults", "dimensions", "modifiers"):
        entry = (evaluation.get(section) or {}).get(key)
        if isinstance(entry, dict) and isinstance(entry.get("label"), str) and entry["label"].strip():
            return entry["label"].strip()
    return key


def _json(value):
    """The migration connection may already decode JSON."""
    return json.loads(value) if isinstance(value, str) else value


async def _backfill(connection) -> None:
    submissions = await connection.fetch(
        "SELECT id, modality, signals->'evaluation' AS evaluation FROM submission "
        "WHERE jsonb_typeof(signals->'evaluation') = 'object' ORDER BY id"
    )
    parsed = [(row["id"], row["modality"], _json(row["evaluation"])) for row in submissions]
    modalities = sorted({modality for _, modality, _ in parsed})
    definitions = {modality: await definition_refs(connection, modality) for modality in modalities}

    # Old evaluations name keys no definition has (the retired LLM grader's): archive them.
    missing: dict[tuple[str, str], str] = {}
    for _, modality, evaluation in parsed:
        for key in signal_keys(evaluation):
            if key != CORRECTNESS_KEY and key not in definitions.get(modality, {}):
                missing.setdefault((modality, key), _label(evaluation, key))
    for (modality, key), label in sorted(missing.items()):
        await connection.execute(
            """
            INSERT INTO signal_definition
                (key, modality, scope, label, description, source, primitive, instructions, criteria, role,
                 weight, display_order, status, archived_at)
            VALUES ($1, $2, 'general', $3, $4, 'jev', 'score', '', $5::text::json, 'dimension', 0, 900, 'archived', NOW())
            ON CONFLICT (modality, key) DO NOTHING
            """,
            key, modality, label,
            "Graded by the retired LLM grader; kept so its stored scores keep their definition.",
            json.dumps(["Low", "Medium", "High"]),
        )
        await connection.execute(
            "INSERT INTO signal_definition_revision (subject, action, before, after) VALUES ($1, 'seed', NULL, $2::text::jsonb)",
            f"{modality}:{key}", json.dumps({"key": key, "modality": modality, "label": label, "status": "archived"}),
        )
    if missing:
        definitions = {modality: await definition_refs(connection, modality) for modality in modalities}

    for submission_id, modality, evaluation in parsed:
        await insert_evaluation(connection, submission_id, evaluation, definitions.get(modality, {}))


def upgrade() -> None:
    _schema()
    connection = op.get_bind().connection.driver_connection
    await_only(_backfill(connection))


def downgrade() -> None:  # pragma: no cover - forward-only
    raise NotImplementedError("0016 is forward-only")
