from __future__ import annotations

from typing import Any

from app.core.signal_catalog import DEFAULT_SIGNAL_SPEC, RecallSignal, SignalSpec
from app.core.signals import ModalitySignalSpec, SignalResult
from app.models import CoachAttemptFeedbackRequest
from app.contracts.coerce import coerce_json_object


def _label_for(spec: SignalSpec, key: str) -> str:
    signal = spec.signal(key) or DEFAULT_SIGNAL_SPEC.signal(key)
    return signal.label if signal else key.replace("_", " ").title()


def _score_from_signal(signal: RecallSignal, raw: dict[str, Any]) -> float:
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


def _signal_entry(signal: RecallSignal, raw: Any) -> dict[str, Any]:
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


CORRECTNESS_LABEL = "Correct choice"


def rubric_from_signal_results(
    spec: ModalitySignalSpec,
    successful: bool,
    results: dict[str, SignalResult],
) -> dict[str, Any]:
    """Rubric for a plug-in signal spec: correctness plus every weighted, scored signal.

    Diagnostic signals carry categories, not grades, so they stay in
    ``signalResults`` and out of the rubric.
    """
    correctness_score = 100.0 if successful else 0.0
    dimensions: dict[str, dict[str, Any]] = {
        "correctness": {
            "key": "correctness",
            "label": CORRECTNESS_LABEL,
            "status": _status_from_score(correctness_score),
            "score": correctness_score,
            "evidence": [],
            "missing": [],
        }
    }
    modifiers: dict[str, dict[str, Any]] = {}
    weighted: list[tuple[float, float]] = [(correctness_score, spec.correctness_weight)]
    weighted_dimensions: list[tuple[float, float]] = list(weighted)
    axis_scores: dict[str, float] = {}

    for plugin, weight in spec.plugins():
        if plugin.role == "diagnostic":
            continue
        result = results.get(plugin.key)
        scored = result is not None and result.status == "scored" and result.score is not None
        entry = {
            "key": plugin.key,
            "label": plugin.label,
            "status": _status_from_score(result.score) if scored else "not_applicable",
            "score": result.score if scored else 0.0,
            "evidence": [result.note] if result is not None and result.note else [],
            "missing": [],
        }
        (modifiers if plugin.role == "modifier" else dimensions)[plugin.key] = entry
        if not scored:
            continue
        weighted.append((entry["score"], weight))
        if plugin.role == "dimension":
            weighted_dimensions.append((entry["score"], weight))
        if plugin.axis:
            axis_scores[plugin.axis] = entry["score"]

    overall = _weighted_mean(weighted)
    overall = correctness_score if overall is None else overall
    conceptual = _weighted_mean(weighted_dimensions)
    misconception = results.get("distractorMisconception")
    if successful:
        primary_failure = {"key": "sound", "label": "Correct choice", "severity": "minor", "evidence": []}
    else:
        primary_failure = {
            "key": "correctness",
            "label": CORRECTNESS_LABEL,
            "severity": "blocking",
            "evidence": [f"Likely misconception: {misconception.raw}"]
            if misconception is not None and misconception.status == "scored" and misconception.raw
            else [],
        }

    return {
        "verdict": "sound" if successful else "needs-work",
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
        "recommendedAction": "",
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
