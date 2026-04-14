from __future__ import annotations

import json
from collections import Counter
from typing import Any

CORE_DIMENSION_ORDER = (
    "contract",
    "pattern",
    "state",
    "control_flow",
    "invariant",
    "state_updates",
    "ordering",
    "answer_path",
    "edge_cases",
    "recall_fidelity",
)
MODIFIER_ORDER = ("executability", "fluency")
WEAK_DIMENSION_THRESHOLD = 80.0


def _score_value(value: Any) -> float:
    try:
        return round(float(value or 0), 1)
    except (TypeError, ValueError):
        return 0.0


def coerce_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _compact_dimension(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    return {
        "key": str(raw.get("key", "")).strip(),
        "label": str(raw.get("label", "")).strip(),
        "status": str(raw.get("status", "")).strip(),
        "score": _score_value(raw.get("score")),
        "evidence": [str(item) for item in raw.get("evidence", [])[:2] if str(item).strip()]
        if isinstance(raw.get("evidence", []), list)
        else [],
        "missing": [str(item) for item in raw.get("missing", [])[:2] if str(item).strip()]
        if isinstance(raw.get("missing", []), list)
        else [],
    }


def _compact_dimensions(raw_dimensions: Any, order: tuple[str, ...]) -> dict[str, dict[str, Any]]:
    if not isinstance(raw_dimensions, dict):
        return {}

    compact: dict[str, dict[str, Any]] = {}
    ordered_keys = [*order, *[key for key in raw_dimensions if key not in order]]
    for key in ordered_keys:
        dimension = _compact_dimension(raw_dimensions.get(key))
        if not dimension:
            continue
        dimension["key"] = dimension["key"] or str(key)
        dimension["label"] = dimension["label"] or str(key).replace("_", " ").title()
        compact[str(key)] = dimension
    return compact


def compact_submission_rubric(raw_rubric: Any) -> dict[str, Any]:
    rubric = coerce_json_object(raw_rubric)
    if not rubric:
        return {}

    score = coerce_json_object(rubric.get("score"))
    primary_failure = coerce_json_object(rubric.get("primaryFailure"))
    compact_primary_failure = {
        "key": str(primary_failure.get("key", "")).strip(),
        "label": str(primary_failure.get("label", "")).strip(),
        "severity": str(primary_failure.get("severity", "")).strip(),
        "evidence": [str(item) for item in primary_failure.get("evidence", [])[:2] if str(item).strip()]
        if isinstance(primary_failure.get("evidence", []), list)
        else [],
    }

    return {
        "verdict": str(rubric.get("verdict", "")).strip(),
        "score": {
            "overall": _score_value(score.get("overall")),
            "conceptual": _score_value(score.get("conceptual")),
            "fidelity": _score_value(score.get("fidelity")),
            "executable": _score_value(score.get("executable")),
            "fluency": _score_value(score.get("fluency")),
        },
        "primaryFailure": compact_primary_failure,
        "dimensions": _compact_dimensions(rubric.get("dimensions"), CORE_DIMENSION_ORDER),
        "modifiers": _compact_dimensions(rubric.get("modifiers"), MODIFIER_ORDER),
        "recommendedAction": str(rubric.get("recommendedAction", "")).strip(),
    }


def _dimension_bucket(dimension: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": str(dimension.get("key", "")).strip(),
        "label": str(dimension.get("label", "")).strip(),
        "scores": [],
        "weakCount": 0,
        "failCount": 0,
        "partialCount": 0,
        "attemptCount": 0,
    }


def summarize_submission_rubrics(attempts: list[dict[str, Any]]) -> dict[str, Any]:
    dimension_buckets: dict[str, dict[str, Any]] = {}
    primary_counts: Counter[str] = Counter()
    primary_labels: dict[str, str] = {}
    verdict_counts: Counter[str] = Counter()
    overall_scores: list[float] = []
    rubric_count = 0

    for attempt in attempts:
        feedback = attempt.get("submissionFeedback") if isinstance(attempt.get("submissionFeedback"), dict) else {}
        rubric = compact_submission_rubric(
            attempt.get("submissionRubric")
            or attempt.get("submission_rubric")
            or feedback.get("submissionRubric")
        )
        if not rubric:
            continue

        rubric_count += 1
        verdict = str(rubric.get("verdict", "")).strip()
        if verdict:
            verdict_counts[verdict] += 1
        score = coerce_json_object(rubric.get("score"))
        overall_scores.append(_score_value(score.get("overall")))

        primary = coerce_json_object(rubric.get("primaryFailure"))
        primary_key = str(primary.get("key", "")).strip()
        if primary_key and primary_key != "sound":
            primary_counts[primary_key] += 1
            primary_labels[primary_key] = str(primary.get("label", "") or primary_key.replace("_", " ").title())

        for source_key in ("dimensions", "modifiers"):
            dimensions = coerce_json_object(rubric.get(source_key))
            for key, dimension in dimensions.items():
                if not isinstance(dimension, dict):
                    continue
                status = str(dimension.get("status", "")).strip()
                if status == "not_applicable":
                    continue
                score_value = _score_value(dimension.get("score"))
                bucket = dimension_buckets.setdefault(str(key), _dimension_bucket({**dimension, "key": key}))
                bucket["label"] = bucket["label"] or str(dimension.get("label", "") or key)
                bucket["scores"].append(score_value)
                bucket["attemptCount"] += 1
                if score_value < WEAK_DIMENSION_THRESHOLD:
                    bucket["weakCount"] += 1
                if status == "fail":
                    bucket["failCount"] += 1
                if status == "partial":
                    bucket["partialCount"] += 1

    weak_dimensions: list[dict[str, Any]] = []
    for bucket in dimension_buckets.values():
        scores = [float(score) for score in bucket.pop("scores", [])]
        if not scores:
            continue
        weak_dimensions.append({
            **bucket,
            "avgScore": round(sum(scores) / len(scores), 1),
        })

    weak_dimensions.sort(
        key=lambda item: (
            -int(item["failCount"]),
            -int(item["weakCount"]),
            float(item["avgScore"]),
            str(item["label"]),
        )
    )
    primary_failures = [
        {"key": key, "label": primary_labels.get(key, key.replace("_", " ").title()), "count": count}
        for key, count in primary_counts.most_common(5)
    ]

    return {
        "attemptCount": len(attempts),
        "rubricAttemptCount": rubric_count,
        "avgRubricScore": round(sum(overall_scores) / len(overall_scores), 1) if overall_scores else 0.0,
        "verdictCounts": dict(verdict_counts),
        "primaryFailures": primary_failures,
        "topPrimaryFailure": primary_failures[0] if primary_failures else {},
        "weakDimensions": weak_dimensions[:6],
        "topWeakDimension": weak_dimensions[0] if weak_dimensions else {},
    }
