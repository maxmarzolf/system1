"""A stored evaluation as relational rows, and back.

An evaluation is stored as one ``submission_evaluation`` row (its verdict, scores, who decided
correctness, provenance, and the documents nobody filters on: feedback, traces, the spec snapshot)
plus one ``submission_signal`` row per signal, each pointing at its ``signal_definition``.

:func:`split_evaluation` turns the evaluation JSON into those rows and :func:`join_evaluation`
turns them back into exactly the same JSON. Values live in real columns; anything the columns
can't express (a legacy field, a key in an unexpected place) is kept verbatim in the row's
``extra``, so the round trip is lossless for every evaluation ever stored. The migration that
moved ``submission.signals`` into these tables and the app's write and read paths all use these
two functions, so they can't drift apart.

Pure: no database access. Callers resolve definitions and write the rows.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

CORRECTNESS_KEY = "correctness"
GRADED = frozenset({"pass", "partial", "fail"})
STATUSES = frozenset({"scored", "not_applicable", "unavailable"})
ROLES = frozenset({"dimension", "modifier", "diagnostic", CORRECTNESS_KEY})
_PLACEMENTS = ("dimensions", "modifiers")
_ROLE_FOR_PLACEMENT = {"dimensions": "dimension", "modifiers": "modifier"}
_PROVENANCE_COLUMNS = {"engine": "engine", "model": "model", "flags": "flags", "feedbackProvider": "feedback_provider"}
_CORRECTNESS_COLUMNS = {
    "source": "correctness_source",
    "label": "correctness_label",
    "confidence": "correctness_confidence",
    "answerKeyAgreement": "answer_key_agreement",
}


@dataclass(frozen=True)
class DefinitionRef:
    """The ``signal_definition`` row a stored signal points at."""

    id: int
    version: int
    weight: float
    source: str  # jev | deterministic


class UnknownSignal(LookupError):
    """A stored signal has no definition to point at."""


def same(a: Any, b: Any) -> bool:
    """Deep equality that tells ``1`` from ``1.0`` and ``True`` from ``1``, so JSON round-trips exactly."""
    if type(a) is not type(b):
        return False
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(same(a[key], b[key]) for key in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    return a == b


def _text(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _object(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _list(value: Any) -> list[Any] | None:
    return value if isinstance(value, list) else None


def _strings(value: Any) -> list[str] | None:
    return value if isinstance(value, list) and all(isinstance(item, str) for item in value) else None


# ─── The raw value of one signal ───


def _value_columns(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {"value_kind": "null", "value_text": None, "value_number": None, "value_boolean": None}
    if isinstance(raw, bool):
        return {"value_kind": "boolean", "value_text": None, "value_number": None, "value_boolean": raw}
    if isinstance(raw, int):
        return {"value_kind": "integer", "value_text": None, "value_number": float(raw), "value_boolean": None}
    if isinstance(raw, float):
        return {"value_kind": "number", "value_text": None, "value_number": raw, "value_boolean": None}
    if isinstance(raw, str):
        return {"value_kind": "text", "value_text": raw, "value_number": None, "value_boolean": None}
    # Anything else (a list or object) isn't a signal value; the row's extra keeps it.
    return {"value_kind": "null", "value_text": None, "value_number": None, "value_boolean": None}


def signal_value(row: Mapping[str, Any]) -> Any:
    """The raw value a signal row stores, typed as it was stored."""
    kind = row.get("value_kind")
    if kind == "boolean":
        return row.get("value_boolean")
    if kind == "integer":
        return None if row.get("value_number") is None else int(row["value_number"])
    if kind == "number":
        return row.get("value_number")
    if kind == "text":
        return row.get("value_text")
    return None


# ─── Rebuilding the JSON from rows ───


def _rubric_entry(key: str, row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "key": key,
        "label": row.get("label") or "",
        "status": row.get("grade") or "",
        "score": row["score"] if row.get("score") is not None else 0.0,
        "evidence": list(row.get("evidence") or []),
        "missing": [],
    }


def _result_entry(key: str, row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "key": key,
        "label": row.get("label") or "",
        "role": row.get("role"),
        "status": row.get("status"),
        "raw": signal_value(row),
        "score": row.get("score"),
        "confidence": row.get("confidence"),
        "note": row.get("note") or "",
    }


def _rebuilt(evaluation: Mapping[str, Any], signals: list[Mapping[str, Any]]) -> dict[str, Any]:
    """The JSON the columns describe, before the stored overrides are applied."""
    data: dict[str, Any] = {}
    if evaluation.get("evaluation_version") is not None:
        data["version"] = evaluation["evaluation_version"]
    if evaluation.get("spec_algorithm") is not None or evaluation.get("spec_version") is not None:
        spec: dict[str, Any] = {"algorithm": evaluation.get("spec_algorithm"), "version": evaluation.get("spec_version")}
        for column, key in (("spec_modality", "modality"), ("spec_hash", "hash")):
            if evaluation.get(column) is not None:
                spec[key] = evaluation[column]
        data["signalSpec"] = spec
    if evaluation.get("verdict") is not None:
        data["verdict"] = evaluation["verdict"]
    if evaluation.get("overall_score") is not None or evaluation.get("scores") is not None:
        score = {"overall": evaluation["overall_score"]} if evaluation.get("overall_score") is not None else {}
        data["score"] = score | dict(evaluation.get("scores") or {})
    if evaluation.get("primary_failure") is not None:
        data["primaryFailure"] = evaluation["primary_failure"]

    ordered = sorted(signals, key=lambda row: row.get("position") or 0)
    for placement in _PLACEMENTS:
        entries = {
            row["key"]: (row.get("extra") or {}).get("rubric") or _rubric_entry(row["key"], row)
            for row in ordered if row.get("rubric_placement") == placement
        }
        if entries or evaluation.get("has_rubric"):
            data[placement] = entries
    if evaluation.get("recommended_action") is not None:
        data["recommendedAction"] = evaluation["recommended_action"]
    if evaluation.get("feedback") is not None:
        data["feedback"] = evaluation["feedback"]

    provenance = dict(evaluation.get("provenance_extra") or {})
    for key, column in _PROVENANCE_COLUMNS.items():
        if evaluation.get(column) is not None:
            provenance[key] = list(evaluation[column]) if column == "flags" else evaluation[column]
    if provenance or evaluation.get("provenance_extra") is not None:
        data["provenance"] = provenance

    correctness = dict(evaluation.get("correctness_extra") or {})
    for key, column in _CORRECTNESS_COLUMNS.items():
        if evaluation.get(column) is not None:
            correctness[key] = evaluation[column]
    if correctness or evaluation.get("correctness_extra") is not None:
        data["correctness"] = correctness

    results = {
        row["key"]: (row.get("extra") or {}).get("result") or _result_entry(row["key"], row)
        for row in ordered if row.get("in_results")
    }
    if results:
        data["signalResults"] = results
    for column, key in (("spec_snapshot", "signalSpecSnapshot"), ("jev_trace", "jevTrace"), ("llm_trace", "llmTrace")):
        if evaluation.get(column) is not None:
            data[key] = evaluation[column]
    return data


def join_evaluation(evaluation: Mapping[str, Any], signals: list[Mapping[str, Any]]) -> dict[str, Any]:
    """The evaluation JSON from its ``submission_evaluation`` row and ``submission_signal`` rows.

    Each signal row must carry its definition's ``key`` (join ``signal_definition`` to read it).
    """
    data = _rebuilt(evaluation, signals)
    extra = evaluation.get("extra") or {}
    for key in extra.get("absent", []):
        data.pop(key, None)
    data.update(extra.get("overrides", {}))
    return data


# ─── Splitting the JSON into rows ───


def _signal_source(
    definition: DefinitionRef,
    key: str,
    *,
    engine: str | None,
    llm_grader: bool,
    correctness_source: str | None,
) -> str:
    """Who produced a signal's value: jev, deterministic, llm-grader or answer-key."""
    if key == CORRECTNESS_KEY:
        if correctness_source == "jev":
            return "jev"
        if correctness_source and correctness_source.startswith("deterministic"):
            return "deterministic"
        if engine == "answer-key":
            return "answer-key"
        return "llm-grader" if llm_grader else "deterministic"
    if llm_grader:
        return "llm-grader"
    return definition.source


def split_evaluation(
    data: Mapping[str, Any],
    definitions: Mapping[str, DefinitionRef],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """The ``submission_evaluation`` row and the ``submission_signal`` rows for an evaluation's JSON.

    ``definitions`` maps each signal key of the submission's modality (``correctness`` included)
    to its definition. Raises :class:`UnknownSignal` for a key with no definition.
    """
    score = _object(data.get("score"))
    spec = _object(data.get("signalSpec")) or {}
    provenance = _object(data.get("provenance"))
    correctness = _object(data.get("correctness"))
    evaluation: dict[str, Any] = {
        "evaluation_version": _int(data.get("version")),
        # Graded evaluations carry a rubric (dimensions and modifiers), even an empty one.
        "has_rubric": isinstance(data.get("dimensions"), dict) and isinstance(data.get("modifiers"), dict),
        "verdict": _text(data.get("verdict")),
        "overall_score": _number(score.get("overall")) if score else None,
        "scores": {key: value for key, value in score.items() if key != "overall"} if score is not None else None,
        "primary_failure": _object(data.get("primaryFailure")),
        "recommended_action": _text(data.get("recommendedAction")),
        "feedback": _object(data.get("feedback")),
        "spec_algorithm": _text(spec.get("algorithm")),
        "spec_version": _int(spec.get("version")),
        "spec_modality": _text(spec.get("modality")),
        "spec_hash": _text(spec.get("hash")),
        "engine": _text(provenance.get("engine")) if provenance else None,
        "model": _text(provenance.get("model")) if provenance else None,
        "flags": _strings(provenance.get("flags")) if provenance else None,
        "feedback_provider": _text(provenance.get("feedbackProvider")) if provenance else None,
        "provenance_extra": (
            {key: value for key, value in provenance.items() if key not in _PROVENANCE_COLUMNS} if provenance is not None else None
        ),
        "correctness_source": _text(correctness.get("source")) if correctness else None,
        "correctness_label": _text(correctness.get("label")) if correctness else None,
        "correctness_confidence": _number(correctness.get("confidence")) if correctness else None,
        "answer_key_agreement": correctness.get("answerKeyAgreement") if correctness and isinstance(
            correctness.get("answerKeyAgreement"), bool) else None,
        "correctness_extra": (
            {key: value for key, value in correctness.items() if key not in _CORRECTNESS_COLUMNS}
            if correctness is not None else None
        ),
        "spec_snapshot": _object(data.get("signalSpecSnapshot")),
        "jev_trace": _list(data.get("jevTrace")),
        "llm_trace": _list(data.get("llmTrace")),
        "extra": None,
    }
    # A score or overall the columns can't hold is kept whole by the overrides below.
    if evaluation["overall_score"] is None and score and "overall" in score:
        evaluation["scores"] = None

    engine = evaluation["engine"]
    llm_grader = not data.get("signalResults") and engine is None and bool(provenance and provenance.get("llmUsed"))
    snapshot = evaluation["spec_snapshot"] or {}
    snapshot_weights = {
        str(item.get("key")): item["weight"] for item in snapshot.get("signals", [])
        if isinstance(item, dict) and isinstance(item.get("weight"), (int, float))
    }
    if isinstance(snapshot.get("correctnessWeight"), (int, float)):
        snapshot_weights[CORRECTNESS_KEY] = snapshot["correctnessWeight"]

    # Gather each key's rubric entry (with its placement) and its result, in first-seen order.
    gathered: dict[str, dict[str, Any]] = {}
    for placement in _PLACEMENTS:
        for key, entry in (_object(data.get(placement)) or {}).items():
            if isinstance(entry, dict) and key not in gathered:
                gathered[key] = {"rubric": entry, "placement": placement}
    for key, entry in (_object(data.get("signalResults")) or {}).items():
        if isinstance(entry, dict):
            gathered.setdefault(key, {})["result"] = entry
    if correctness is not None and CORRECTNESS_KEY not in gathered:
        gathered[CORRECTNESS_KEY] = {}

    signals: list[dict[str, Any]] = []
    for position, (key, parts) in enumerate(gathered.items(), start=1):
        definition = definitions.get(key)
        if definition is None:
            raise UnknownSignal(key)
        rubric, result, placement = parts.get("rubric"), parts.get("result"), parts.get("placement")
        if result is not None:
            status, score_value, raw = result.get("status"), _number(result.get("score")), result.get("raw")
            confidence, note = _number(result.get("confidence")), _text(result.get("note")) or ""
            role = _text(result.get("role"))
        else:
            graded = rubric is not None and rubric.get("status") in GRADED
            status = "scored" if graded else "not_applicable"
            score_value = _number(rubric.get("score")) if graded and rubric is not None else None
            raw = correctness.get("label") if key == CORRECTNESS_KEY and correctness else None
            confidence = _number(correctness.get("confidence")) if key == CORRECTNESS_KEY and correctness else None
            note, role = "", None
        if role not in ROLES:
            # An unknown role is kept verbatim in the row's extra (the result entry differs).
            role = CORRECTNESS_KEY if key == CORRECTNESS_KEY else _ROLE_FOR_PLACEMENT.get(placement or "", "dimension")
        source = _signal_source(
            definition, key, engine=engine, llm_grader=llm_grader, correctness_source=evaluation["correctness_source"],
        )
        row: dict[str, Any] = {
            "key": key,
            "signal_definition_id": definition.id,
            "definition_version": definition.version,
            "role": role,
            "weight": float(snapshot_weights.get(key, definition.weight)),
            "label": _text((result or {}).get("label")) or _text((rubric or {}).get("label")) or key,
            "status": status if status in STATUSES else "not_applicable",
            "score": score_value,
            "grade": _text(rubric.get("status")) if rubric is not None else None,
            **_value_columns(raw),
            "confidence": confidence,
            "note": note,
            "evidence": _strings((rubric or {}).get("evidence")) or [],
            "source": source,
            "model": (
                evaluation["model"] if source == "jev"
                else _text(provenance.get("provider")) if source == "llm-grader" and provenance
                else None
            ),
            "position": position,
            "rubric_placement": placement,
            "in_results": result is not None,
            "extra": None,
        }
        extra: dict[str, Any] = {}
        if rubric is not None and not same(rubric, _rubric_entry(key, row)):
            extra["rubric"] = rubric
        if result is not None and not same(result, _result_entry(key, row)):
            extra["result"] = result
        row["extra"] = extra or None
        signals.append(row)

    rebuilt = _rebuilt(evaluation, signals)
    overrides = {key: value for key, value in data.items() if key not in rebuilt or not same(rebuilt[key], value)}
    absent = [key for key in rebuilt if key not in data]
    if overrides or absent:
        evaluation["extra"] = {**({"overrides": overrides} if overrides else {}), **({"absent": absent} if absent else {})}
    return evaluation, signals


def signal_keys(data: Mapping[str, Any]) -> list[str]:
    """Every signal key an evaluation's JSON mentions (the definitions it needs)."""
    keys: dict[str, None] = {}
    for section in (*_PLACEMENTS, "signalResults"):
        for key, entry in (_object(data.get(section)) or {}).items():
            if isinstance(entry, dict):
                keys[str(key)] = None
    if _object(data.get("correctness")) is not None:
        keys[CORRECTNESS_KEY] = None
    return list(keys)
