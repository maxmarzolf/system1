"""Roll stored evaluations up into weak-dimension and primary-failure summaries."""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.contracts.evaluation import Evaluation, RubricEntry

WEAK_DIMENSION_THRESHOLD = 80.0


def _bucket(key: str, entry: RubricEntry) -> dict[str, Any]:
    return {
        "key": key,
        "label": entry.label,
        "scores": [],
        "weakCount": 0,
        "failCount": 0,
        "partialCount": 0,
        "attemptCount": 0,
    }


def summarize_submission_rubrics(attempts: list[dict[str, Any]]) -> dict[str, Any]:
    """Summaries over attempts shaped ``{"signals": {"evaluation": ...}}``."""
    buckets: dict[str, dict[str, Any]] = {}
    primary_counts: Counter[str] = Counter()
    primary_labels: dict[str, str] = {}
    verdict_counts: Counter[str] = Counter()
    overall_scores: list[float] = []
    rubric_count = 0

    for attempt in attempts:
        signals = attempt.get("signals") if isinstance(attempt.get("signals"), dict) else {}
        evaluation = Evaluation.from_stored(signals.get("evaluation"))
        if evaluation is None:
            continue

        rubric_count += 1
        if evaluation.verdict:
            verdict_counts[evaluation.verdict] += 1
        overall_scores.append(evaluation.score.get("overall", 0.0))

        primary = evaluation.primaryFailure
        if primary.key and primary.key != "sound":
            primary_counts[primary.key] += 1
            primary_labels[primary.key] = primary.label or primary.key.replace("_", " ").title()

        for key, entry in evaluation.entries():
            if entry.status == "not_applicable":
                continue
            bucket = buckets.setdefault(key, _bucket(key, entry))
            bucket["label"] = bucket["label"] or entry.label or key
            bucket["scores"].append(entry.score)
            bucket["attemptCount"] += 1
            if entry.score < WEAK_DIMENSION_THRESHOLD:
                bucket["weakCount"] += 1
            if entry.status == "fail":
                bucket["failCount"] += 1
            if entry.status == "partial":
                bucket["partialCount"] += 1

    weak_dimensions: list[dict[str, Any]] = []
    for bucket in buckets.values():
        scores = [float(score) for score in bucket.pop("scores", [])]
        if scores:
            weak_dimensions.append({**bucket, "avgScore": round(sum(scores) / len(scores), 1)})

    weak_dimensions.sort(
        key=lambda item: (-int(item["failCount"]), -int(item["weakCount"]), float(item["avgScore"]), str(item["label"]))
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
