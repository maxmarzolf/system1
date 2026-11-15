"""The rubric for a graded submission: correctness plus every weighted, scored signal.

The same for every modality. Diagnostic signals carry categories, not grades, so they stay in
``signalResults`` and out of the rubric; their answers (and any hard-override reasons) become
the primary failure's evidence.
"""

from __future__ import annotations

from typing import Any

from app.core.signals import ModalitySignalSpec, SignalResult

CORRECTNESS_LABEL = "Correct answer"


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


def _diagnoses(spec: ModalitySignalSpec, results: dict[str, SignalResult]) -> list[str]:
    evidence = []
    for plugin, _weight in spec.plugins():
        result = results.get(plugin.key)
        if plugin.role == "diagnostic" and result is not None and result.status == "scored" and result.raw:
            evidence.append(f"{plugin.label}: {result.raw}")
    return evidence


def rubric_from_signal_results(
    spec: ModalitySignalSpec,
    successful: bool,
    results: dict[str, SignalResult],
    *,
    verdict: str | None = None,
    failure_evidence: list[str] | None = None,
) -> dict[str, Any]:
    """``verdict`` defaults to sound / needs-work; the pipeline passes its banded verdict."""
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
    if successful:
        primary_failure = {"key": "sound", "label": CORRECTNESS_LABEL, "severity": "minor", "evidence": []}
    else:
        primary_failure = {
            "key": "correctness",
            "label": CORRECTNESS_LABEL,
            "severity": "blocking",
            "evidence": [*(failure_evidence or []), *_diagnoses(spec, results)],
        }

    return {
        "verdict": verdict or ("sound" if successful else "needs-work"),
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
