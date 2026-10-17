from __future__ import annotations

from typing import Any

from app.core.signal_catalog import DEFAULT_SIGNAL_SPEC, SignalDefinition, SignalSpec, get_signal_spec
from app.models import CoachAttemptFeedbackRequest
from app.submission_rubric import coerce_json_object


def evaluation_signal_spec(evaluation: dict[str, Any]) -> SignalSpec:
    """The spec that produced a stored evaluation, from its ``signalSpec`` reference."""
    reference = coerce_json_object(evaluation.get("signalSpec"))
    return get_signal_spec(str(reference.get("algorithm", "")))


def _label_for(spec: SignalSpec, key: str) -> str:
    signal = spec.signal(key) or DEFAULT_SIGNAL_SPEC.signal(key)
    return signal.label if signal else key.replace("_", " ").title()


def adaptive_primary_failure(rubric: dict[str, Any]) -> dict[str, Any]:
    spec = evaluation_signal_spec(rubric)
    primary = coerce_json_object(rubric.get("primaryFailure"))
    primary_key = str(primary.get("key", "")).strip()
    if primary_key and primary_key != "sound":
        return {
            "key": primary_key,
            "label": str(primary.get("label", "") or _label_for(spec, primary_key)),
        }

    weakest: dict[str, Any] = {}
    dimensions = coerce_json_object(rubric.get("dimensions"))
    modifiers = coerce_json_object(rubric.get("modifiers"))
    for key, dimension in {**dimensions, **modifiers}.items():
        if not isinstance(dimension, dict) or dimension.get("status") == "not_applicable":
            continue
        try:
            score = float(dimension.get("score", 100) or 100)
        except (TypeError, ValueError):
            score = 100.0
        if not weakest or score < float(weakest.get("score", 100)):
            weakest = {
                "key": str(dimension.get("key") or key),
                "label": str(dimension.get("label") or _label_for(spec, str(key))),
                "score": score,
            }

    if weakest:
        return weakest
    first = next(signal for signal in spec.signals if signal.role == "dimension")
    return {"key": first.key, "label": first.label}


def _score_from_signal(signal: SignalDefinition, raw: dict[str, Any]) -> float:
    if signal.kind == "boolean":
        return 100.0 if bool(raw.get("valid")) else 0.0
    try:
        return round(min(max(float(raw.get("score", 0) or 0), 0.0), 100.0), 1)
    except (TypeError, ValueError):
        return 0.0


def _status_from_score(score: float) -> str:
    if score >= 80:
        return "pass"
    if score >= 45:
        return "partial"
    return "fail"


def _weighted_mean(items: list[tuple[float, float]]) -> float | None:
    total_weight = sum(weight for _, weight in items)
    if total_weight <= 0:
        return None
    return round(sum(score * weight for score, weight in items) / total_weight, 1)


def _signal_entry(signal: SignalDefinition, raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {
            "key": signal.key,
            "label": signal.label,
            "status": "not_applicable",
            "score": 0.0,
            "evidence": [],
            "missing": [],
        }
    score = _score_from_signal(signal, raw)
    note = str(raw.get("note") or raw.get("error") or "").strip()
    return {
        "key": signal.key,
        "label": signal.label,
        "status": _status_from_score(score),
        "score": score,
        "evidence": [note] if note else [],
        "missing": [],
    }


def submission_rubric_from_assessment(
    body: CoachAttemptFeedbackRequest,
    assessment: dict[str, Any],
    spec: SignalSpec,
) -> dict[str, Any]:
    raw_signals = coerce_json_object(assessment.get("signals"))
    dimensions: dict[str, dict[str, Any]] = {}
    modifiers: dict[str, dict[str, Any]] = {}
    weighted: list[tuple[float, float]] = []
    weighted_dimensions: list[tuple[float, float]] = []
    axis_scores: dict[str, float] = {}

    for signal in spec.signals:
        entry = _signal_entry(signal, raw_signals.get(signal.key))
        (modifiers if signal.role == "modifier" else dimensions)[signal.key] = entry
        if entry["status"] == "not_applicable":
            continue
        weighted.append((entry["score"], signal.weight))
        if signal.role == "dimension":
            weighted_dimensions.append((entry["score"], signal.weight))
        if signal.axis:
            axis_scores[signal.axis] = entry["score"]

    verdict = str(assessment.get("verdict", "")).strip() or ("sound" if body.exact else "needs-work")
    blocker_key = str(assessment.get("blockerKey", "")).strip()
    if verdict == "sound" or not blocker_key:
        primary_failure = {
            "key": "sound",
            "label": "Sound recall",
            "severity": "minor",
            "evidence": [str(item) for item in assessment.get("strengths", [])[:2] if str(item).strip()]
            if isinstance(assessment.get("strengths"), list)
            else [],
        }
    else:
        primary_failure = {
            "key": blocker_key,
            "label": _label_for(spec, blocker_key),
            "severity": "blocking" if verdict == "needs-work" else "major",
            "evidence": [str(assessment.get("primaryBlocker", "")).strip()]
            if str(assessment.get("primaryBlocker", "")).strip()
            else [],
        }

    fallback_overall = 100.0 if body.exact else 0.0
    overall = _weighted_mean(weighted)
    overall = fallback_overall if overall is None else overall
    conceptual = _weighted_mean(weighted_dimensions)

    return {
        "verdict": verdict,
        "signalSpec": spec.reference(),
        "score": {
            "overall": overall,
            "conceptual": overall if conceptual is None else conceptual,
            "fidelity": axis_scores.get("fidelity", overall),
            "executable": axis_scores.get("executable", 100.0),
            "fluency": axis_scores.get("fluency", 0.0),
        },
        "primaryFailure": primary_failure,
        "dimensions": dimensions,
        "modifiers": modifiers,
        "recommendedAction": str(assessment.get("primaryBlocker", "")).strip(),
    }
