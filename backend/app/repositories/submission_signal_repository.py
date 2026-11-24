"""Graded submissions, relationally: ``submission_evaluation`` and ``submission_signal``.

Writes split an evaluation with :func:`app.contracts.evaluation_rows.split_evaluation`; reads join
the rows back with :func:`~app.contracts.evaluation_rows.join_evaluation`, so every reader gets the
same evaluation JSON the grader produced. Functions take an open connection so a submission and
its evaluation are written in one transaction.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from typing import Any

from app.contracts.evaluation_rows import DefinitionRef, join_evaluation, split_evaluation

EVALUATION_COLUMNS = (
    "evaluation_version", "has_rubric", "verdict", "overall_score", "scores", "primary_failure", "recommended_action",
    "feedback", "spec_algorithm", "spec_version", "spec_modality", "spec_hash", "engine", "model", "flags",
    "feedback_provider", "provenance_extra", "correctness_source", "correctness_label", "correctness_confidence",
    "answer_key_agreement", "correctness_extra", "spec_snapshot", "jev_trace", "llm_trace", "extra",
)
_EVALUATION_JSON = frozenset({
    "scores", "primary_failure", "feedback", "provenance_extra", "correctness_extra", "spec_snapshot", "jev_trace",
    "llm_trace", "extra",
})
SIGNAL_COLUMNS = (
    "signal_definition_id", "definition_version", "role", "weight", "label", "status", "score", "grade", "value_kind",
    "value_text", "value_number", "value_boolean", "confidence", "note", "evidence", "source", "model", "position",
    "rubric_placement", "in_results", "extra",
)
_SIGNAL_JSON = frozenset({"extra"})

_INSERT_EVALUATION = (
    f"INSERT INTO submission_evaluation (submission_id, {', '.join(EVALUATION_COLUMNS)}) VALUES ($1, "
    + ", ".join(f"${i}{'::text::jsonb' if column in _EVALUATION_JSON else ''}" for i, column in enumerate(EVALUATION_COLUMNS, 2))
    + ")"
)
_INSERT_SIGNAL = (
    f"INSERT INTO submission_signal (submission_id, {', '.join(SIGNAL_COLUMNS)}) VALUES ($1, "
    + ", ".join(f"${i}{'::text::jsonb' if column in _SIGNAL_JSON else ''}" for i, column in enumerate(SIGNAL_COLUMNS, 2))
    + ")"
)


# JSON is passed as text and cast in SQL (::text::jsonb), so the same statements work on a
# connection with a JSON codec (the migration's) and without one (the app's pool).
def _encoded(row: Mapping[str, Any], columns: Iterable[str], json_columns: frozenset[str]) -> list[Any]:
    return [json.dumps(row[column]) if column in json_columns and row[column] is not None else row[column] for column in columns]


def _decoded(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


async def definition_refs(conn: Any, modality: str) -> dict[str, DefinitionRef]:
    """Every definition of a modality (active and archived, correctness included), by key."""
    rows = await conn.fetch("SELECT id, key, version, weight, source FROM signal_definition WHERE modality = $1", modality)
    return {
        str(row["key"]): DefinitionRef(id=int(row["id"]), version=int(row["version"]), weight=float(row["weight"]), source=str(row["source"]))
        for row in rows
    }


async def insert_evaluation(
    conn: Any, submission_id: int, evaluation: Mapping[str, Any], definitions: Mapping[str, DefinitionRef],
) -> int:
    """Store an evaluation's JSON as its evaluation row and signal rows; returns how many signals."""
    evaluation_row, signal_rows = split_evaluation(evaluation, definitions)
    await conn.execute(_INSERT_EVALUATION, submission_id, *_encoded(evaluation_row, EVALUATION_COLUMNS, _EVALUATION_JSON))
    for signal in signal_rows:
        await conn.execute(_INSERT_SIGNAL, submission_id, *_encoded(signal, SIGNAL_COLUMNS, _SIGNAL_JSON))
    return len(signal_rows)


async def fetch_evaluations(conn: Any, submission_ids: Iterable[int]) -> dict[int, dict[str, Any]]:
    """The evaluation JSON of each graded submission among ``submission_ids``."""
    ids = sorted({int(submission_id) for submission_id in submission_ids})
    if not ids:
        return {}
    evaluations = await conn.fetch(
        f"SELECT submission_id, {', '.join(EVALUATION_COLUMNS)} FROM submission_evaluation WHERE submission_id = ANY($1::bigint[])",
        ids,
    )
    signals = await conn.fetch(
        f"""
        SELECT s.submission_id, d.key, {', '.join(f's.{column}' for column in SIGNAL_COLUMNS)}
        FROM submission_signal s
        JOIN signal_definition d ON d.id = s.signal_definition_id
        WHERE s.submission_id = ANY($1::bigint[])
        ORDER BY s.submission_id, s.position
        """,
        ids,
    )
    by_submission: dict[int, list[dict[str, Any]]] = {}
    for row in signals:
        record = dict(row)
        record["extra"] = _decoded(record["extra"])
        record["evidence"] = list(record["evidence"] or [])
        by_submission.setdefault(int(row["submission_id"]), []).append(record)
    joined: dict[int, dict[str, Any]] = {}
    for row in evaluations:
        record = {column: _decoded(row[column]) if column in _EVALUATION_JSON else row[column] for column in EVALUATION_COLUMNS}
        record["flags"] = list(record["flags"]) if record["flags"] is not None else None
        submission_id = int(row["submission_id"])
        joined[submission_id] = join_evaluation(record, by_submission.get(submission_id, []))
    return joined


async def attach_signals(conn: Any, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Give each submission row its ``signals`` dict, shaped as ``submission.signals`` used to be.

    Rows need ``id``, ``elapsed_ms``, ``flow_context`` and ``modality_context``. Readers that took
    ``row["signals"]`` keep working unchanged: ``elapsed_ms``, ``evaluation`` (when graded),
    ``flow`` and ``modality``.
    """
    evaluations = await fetch_evaluations(conn, (row["id"] for row in rows))
    for row in rows:
        signals: dict[str, Any] = {"elapsed_ms": int(row.get("elapsed_ms") or 0)}
        evaluation = evaluations.get(int(row["id"]))
        if evaluation is not None:
            signals["evaluation"] = evaluation
        for column, key in (("flow_context", "flow"), ("modality_context", "modality")):
            value = _decoded(row.get(column))
            if isinstance(value, dict):
                signals[key] = value
        row["signals"] = signals
    return rows
