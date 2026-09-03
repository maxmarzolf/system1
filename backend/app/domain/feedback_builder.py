from __future__ import annotations

from typing import Any

from app.domain.coach_profiles import SUBMISSION_DIMENSION_LABELS
from app.models import CoachAttemptFeedbackRequest


def adaptive_primary_failure(rubric: dict[str, Any]) -> dict[str, Any]:
    primary = rubric.get("primaryFailure") if isinstance(rubric.get("primaryFailure"), dict) else {}
    primary_key = str(primary.get("key", "")).strip()
    if primary_key and primary_key != "sound":
        return {
            "key": primary_key,
            "label": str(primary.get("label", "") or SUBMISSION_DIMENSION_LABELS.get(primary_key, primary_key.replace("_", " ").title())),
        }

    weakest: dict[str, Any] = {}
    dimensions = rubric.get("dimensions") if isinstance(rubric.get("dimensions"), dict) else {}
    modifiers = rubric.get("modifiers") if isinstance(rubric.get("modifiers"), dict) else {}
    for key, dimension in {**dimensions, **modifiers}.items():
        if not isinstance(dimension, dict):
            continue
        try:
            score = float(dimension.get("score", 100) or 100)
        except (TypeError, ValueError):
            score = 100.0
        if not weakest or score < float(weakest.get("score", 100)):
            weakest = {
                "key": str(dimension.get("key") or key),
                "label": str(dimension.get("label") or SUBMISSION_DIMENSION_LABELS.get(str(key), str(key).replace("_", " ").title())),
                "score": score,
            }

    if weakest:
        return weakest
    return {"key": "pattern", "label": SUBMISSION_DIMENSION_LABELS["pattern"]}


def _score_from_signal(signal: dict[str, Any]) -> float:
    if "score" in signal:
        try:
            return round(float(signal.get("score", 0) or 0), 1)
        except (TypeError, ValueError):
            return 0.0
    if "valid" in signal:
        return 100.0 if bool(signal.get("valid")) else 0.0
    return 0.0


def _status_from_score(score: float) -> str:
    if score >= 80:
        return "pass"
    if score >= 45:
        return "partial"
    return "fail"


def submission_rubric_from_assessment(
    body: CoachAttemptFeedbackRequest,
    assessment: dict[str, Any],
) -> dict[str, Any]:
    raw_signals = assessment.get("signals") if isinstance(assessment.get("signals"), dict) else {}
    dimensions: dict[str, dict[str, Any]] = {}
    modifiers: dict[str, dict[str, Any]] = {}

    for key, raw_signal in raw_signals.items():
        if not isinstance(raw_signal, dict):
            continue
        score = _score_from_signal(raw_signal)
        label = SUBMISSION_DIMENSION_LABELS.get(str(key), str(key).replace("_", " ").title())
        dimension = {
            "key": str(key),
            "label": label,
            "status": _status_from_score(score),
            "score": score,
            "evidence": [str(raw_signal.get("note", "")).strip()] if str(raw_signal.get("note", "")).strip() else [],
            "missing": [],
        }
        if str(key) in {"syntax", "completionTime"}:
            modifiers[str(key)] = dimension
        else:
            dimensions[str(key)] = dimension

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
            "label": SUBMISSION_DIMENSION_LABELS.get(blocker_key, blocker_key.replace("_", " ").title()),
            "severity": "blocking" if verdict == "needs-work" else "major",
            "evidence": [str(assessment.get("primaryBlocker", "")).strip()]
            if str(assessment.get("primaryBlocker", "")).strip()
            else [],
        }

    dimension_scores = [
        float(item.get("score", 0) or 0)
        for item in [*dimensions.values(), *modifiers.values()]
        if item.get("status") != "not_applicable"
    ]
    overall = round(sum(dimension_scores) / len(dimension_scores), 1) if dimension_scores else (100.0 if body.exact else 0.0)

    return {
        "verdict": verdict,
        "score": {
            "overall": overall,
            "conceptual": overall,
            "fidelity": dimensions.get("patternFidelity", {}).get("score", overall),
            "executable": modifiers.get("syntax", {}).get("score", 100.0),
            "fluency": modifiers.get("completionTime", {}).get("score", 0.0),
        },
        "primaryFailure": primary_failure,
        "dimensions": dimensions,
        "modifiers": modifiers,
        "recommendedAction": str(assessment.get("primaryBlocker", "")).strip(),
    }
