from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

READINESS_SUCCESS_THRESHOLD = 90.0
READINESS_STALE_DAYS = 7
READINESS_MODE_ORDER = ("pseudo", "invariant", "algorithm")


def _coerce_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        normalized = text.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)

    return None


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def support_cap(live_coach_used: bool, support_layer: str = "none") -> float:
    cap = 1.0
    if live_coach_used:
        cap -= 0.15
    if support_layer == "ghost-reps":
        cap = min(cap, 0.45)
    return _clamp(cap, 0.35, 1.0)


def attempt_mastery_score(attempt: dict[str, Any]) -> float:
    accuracy = _clamp(float(attempt.get("accuracy", 0) or 0) / 100.0, 0.0, 1.0)
    capped_accuracy = min(
        accuracy,
        support_cap(
            bool(attempt.get("liveCoachUsed")),
            str(attempt.get("supportLayer") or attempt.get("support_layer") or "none"),
        ),
    )
    if float(attempt.get("accuracy", 0) or 0) < READINESS_SUCCESS_THRESHOLD:
        capped_accuracy *= 0.55
    return _clamp(capped_accuracy, 0.0, 1.0)


def freshness_multiplier(days_since_last_submit: int | None) -> float:
    if days_since_last_submit is None:
        return 0.0
    if days_since_last_submit <= 2:
        return 1.0
    return _clamp(1.0 - (days_since_last_submit - 2) * 0.08, 0.25, 1.0)


def summarize_readiness(attempts: list[dict[str, Any]], now: datetime | None = None) -> dict[str, Any]:
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)

    normalized_attempts: list[dict[str, Any]] = []
    for attempt in attempts:
        created_at = _coerce_datetime(attempt.get("created_at") or attempt.get("createdAt"))
        normalized_attempts.append({
            **attempt,
            "_created_at": created_at,
        })

    sorted_attempts = sorted(
        normalized_attempts,
        key=lambda item: item.get("_created_at") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    if not sorted_attempts:
        return {
            "readiness": 0.0,
            "attemptCount": 0,
            "successfulAttempts": 0,
            "avgAccuracy": 0.0,
            "lastSubmittedAt": "",
            "daysSinceLastSubmit": None,
            "stale": False,
            "liveCoachUsedCount": 0,
        }

    weighted_sum = 0.0
    total_weight = 0.0
    successful_attempts = 0
    live_coach_used_count = 0
    accuracies: list[float] = []

    for index, attempt in enumerate(sorted_attempts):
        mastery_score = attempt_mastery_score(attempt)
        weight = 0.65 ** index
        weighted_sum += mastery_score * weight
        total_weight += weight
        accuracy = float(attempt.get("accuracy", 0) or 0)
        accuracies.append(accuracy)
        if accuracy >= READINESS_SUCCESS_THRESHOLD and str(attempt.get("supportLayer") or attempt.get("support_layer") or "none") == "none":
            successful_attempts += 1
        if bool(attempt.get("liveCoachUsed")):
            live_coach_used_count += 1

    weighted_mastery = weighted_sum / total_weight if total_weight else 0.0
    repetition_bonus = min(successful_attempts, 4) * 0.02
    last_submitted_at = sorted_attempts[0].get("_created_at")
    days_since_last_submit = None
    if last_submitted_at:
        days_since_last_submit = max((current_time.date() - last_submitted_at.date()).days, 0)
    readiness = min(weighted_mastery + repetition_bonus, 1.0) * freshness_multiplier(days_since_last_submit) * 100

    return {
        "readiness": round(readiness, 1),
        "attemptCount": len(sorted_attempts),
        "successfulAttempts": successful_attempts,
        "avgAccuracy": round(sum(accuracies) / len(accuracies), 1) if accuracies else 0.0,
        "lastSubmittedAt": last_submitted_at.isoformat() if last_submitted_at else "",
        "daysSinceLastSubmit": days_since_last_submit,
        "stale": days_since_last_submit is not None and days_since_last_submit >= READINESS_STALE_DAYS,
        "liveCoachUsedCount": live_coach_used_count,
    }
