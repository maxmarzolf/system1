"""One day's submissions and every scored signal over time (Journey)."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.contracts.coerce import coerce_json_object
from app.contracts.evaluation import Evaluation
from app.core import taxonomy
from app.core.static_playlists import static_playlist_activity_rows
from app.repositories.multiple_choice_repository import stored_choices
from app.repositories.attempts_repository import fetch_history_day_rows, fetch_skill_map_overview_algorithm_rows, fetch_skill_map_overview_attempt_rows
from app.services.read_models.common import coerce_utc_datetime, resolve_timezone, submission_modality


def _history_day_choices(row: dict[str, Any]) -> list[dict[str, Any]]:
    correct = str(row.get("multiple_choice_correct_choice_id") or "")
    return [
        {"id": choice["id"], "text": choice["text"], "correct": choice["id"] == correct}
        for choice in stored_choices(row.get("multiple_choice_choices"))
    ]


async def get_history_day(day: date, timezone_name: str | None = None) -> dict[str, Any]:
    """Every submission the daily work grid counted on calendar ``day`` in ``timezone_name``, oldest first."""
    tz = resolve_timezone(timezone_name)
    next_day = day + timedelta(days=1)
    rows = await fetch_history_day_rows(
        datetime(day.year, day.month, day.day, tzinfo=tz),
        datetime(next_day.year, next_day.month, next_day.day, tzinfo=tz),
    )
    algorithm_names = {
        str(row["algorithm_slug"]): str(row["algorithm_name"]) for row in await fetch_skill_map_overview_algorithm_rows()
    }
    algorithm_names.update({str(item["slug"]): str(item["algorithm"]) for item in static_playlist_activity_rows()})
    submissions: list[dict[str, Any]] = []
    for row in rows:
        tags = [str(tag) for tag in (row["category_tags"] or [])]
        slugs = taxonomy.matched_algorithm_slugs(tags, set(algorithm_names))
        if not slugs:
            continue  # The grid does not count it either.
        signals = coerce_json_object(row["signals"])
        created_at = coerce_utc_datetime(row["created_at"])
        submissions.append({
            "id": int(row["id"]),
            "createdAt": created_at.isoformat() if created_at else "",
            "modality": submission_modality(row),
            "title": str(row.get("title") or ""),
            "question": str(row.get("question") or ""),
            "choices": _history_day_choices(row),
            "userAnswer": str(row.get("answer") or ""),
            "correctAnswer": str(row.get("correct_answer") or ""),
            "successful": bool(row.get("successful")),
            "elapsedMs": int(signals.get("elapsed_ms") or 0),
            "algorithms": [{"slug": slug, "algorithm": algorithm_names[slug]} for slug in slugs],
            "evaluation": coerce_json_object(signals.get("evaluation")),
            "flow": coerce_json_object(signals.get("flow")),
        })
    return {"date": day.isoformat(), "submissions": submissions}


async def get_signal_history(timezone_name: str | None = None) -> dict[str, Any]:
    """Every scored signal from every submission the daily work grid counts, all time, oldest first.

    Signals are the evaluation's rubric dimensions and modifiers (recall and Jev MCQ alike);
    entries that were not applicable or unavailable are left out.
    """
    tz = resolve_timezone(timezone_name)
    algorithm_names = {
        str(row["algorithm_slug"]): str(row["algorithm_name"]) for row in await fetch_skill_map_overview_algorithm_rows()
    }
    algorithm_names.update({str(item["slug"]): str(item["algorithm"]) for item in static_playlist_activity_rows()})
    rows = sorted(
        await fetch_skill_map_overview_attempt_rows(),
        key=lambda row: coerce_utc_datetime(row["created_at"]) or datetime.min.replace(tzinfo=timezone.utc),
    )
    labels: dict[str, str] = {}
    counts: Counter[str] = Counter()
    points: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        created_at = coerce_utc_datetime(row["created_at"])
        slugs = taxonomy.matched_algorithm_slugs([str(tag) for tag in (row["category_tags"] or [])], set(algorithm_names))
        if created_at is None or not slugs:
            continue  # The grid does not count it either.
        evaluation = Evaluation.from_stored(coerce_json_object(row["signals"]).get("evaluation"))
        if evaluation is None:
            continue
        for key, entry in evaluation.scored_entries():
            score = entry.score
            labels.setdefault(key, entry.label or key)
            counts[key] += 1
            points.append({
                "submission": index,
                "createdAt": created_at.isoformat(),
                "date": created_at.astimezone(tz).date().isoformat(),
                "signal": str(key),
                "score": round(min(max(score, 0.0), 100.0), 1),
                "title": str(row.get("card_title") or ""),
                "modality": submission_modality(row),
                "algorithm": algorithm_names[slugs[0]],
            })
    return {
        # Most-used signals first, so the busiest columns sit together.
        "signals": [
            {"key": key, "label": labels[key], "count": counts[key]}
            for key in sorted(counts, key=lambda key: (-counts[key], labels[key].lower()))
        ],
        "points": points,
    }
