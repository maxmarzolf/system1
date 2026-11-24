"""Drop ``submission.signals`` and ``signal_evaluation_directive`` once 0016's copy is complete.

Before dropping anything this revision checks, from the JSON itself, that every stored evaluation
has its ``submission_evaluation`` row, every signal it mentions has its ``submission_signal`` row,
and every modality has its correctness definition. If anything is missing it stops (the upgrade
fails and nothing is dropped).

Revision ID: 0017
Revises: 0016
"""

from __future__ import annotations

import json

from alembic import op
from sqlalchemy.util import await_only

from app.contracts.evaluation_rows import signal_keys
from app.migrations.runner import execute_script

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def _json(value):
    """The migration connection may already decode JSON."""
    return json.loads(value) if isinstance(value, str) else value


async def _verify(connection) -> None:
    has_signals = await connection.fetchval(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'submission' AND column_name = 'signals')"
    )
    if not has_signals:
        return
    stored = await connection.fetch(
        "SELECT id, signals->'evaluation' AS evaluation FROM submission WHERE jsonb_typeof(signals->'evaluation') = 'object'"
    )
    evaluation_rows = {row["submission_id"] for row in await connection.fetch("SELECT submission_id FROM submission_evaluation")}
    signal_counts = {
        row["submission_id"]: row["count"]
        for row in await connection.fetch("SELECT submission_id, COUNT(*) AS count FROM submission_signal GROUP BY 1")
    }
    problems = []
    for row in stored:
        expected = len(signal_keys(_json(row["evaluation"])))
        if row["id"] not in evaluation_rows:
            problems.append(f"submission {row['id']}: no submission_evaluation row")
        elif signal_counts.get(row["id"], 0) != expected:
            problems.append(f"submission {row['id']}: {signal_counts.get(row['id'], 0)} signal rows, expected {expected}")
    missing_correctness = await connection.fetch(
        "SELECT d.modality FROM signal_evaluation_directive d "
        "LEFT JOIN signal_definition s ON s.modality = d.modality AND s.key = 'correctness' WHERE s.key IS NULL"
    ) if await connection.fetchval("SELECT to_regclass('signal_evaluation_directive') IS NOT NULL") else []
    problems.extend(f"{row['modality']}: no correctness definition" for row in missing_correctness)
    if problems:
        raise RuntimeError("Not dropping submission.signals; 0016's copy is incomplete: " + "; ".join(problems[:20]))


def upgrade() -> None:
    await_only(_verify(op.get_bind().connection.driver_connection))
    execute_script(
        """
        DROP INDEX IF EXISTS idx_submission_flow_anchor_created_at;
        ALTER TABLE submission DROP CONSTRAINT IF EXISTS submission_signals_object_check;
        ALTER TABLE submission DROP COLUMN IF EXISTS signals;
        DROP TABLE IF EXISTS signal_evaluation_directive;
        """
    )


def downgrade() -> None:  # pragma: no cover - forward-only
    raise NotImplementedError("0017 is forward-only")
