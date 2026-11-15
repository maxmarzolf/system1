"""One day's submissions, and competency per algorithm per day (Journey)."""

from __future__ import annotations

import json
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any

from app.contracts.coerce import coerce_json_object
from app.core import taxonomy
from app.core.static_playlists import static_playlist_activity_rows
from app.repositories.multiple_choice_repository import stored_choices
from app.repositories.attempts_repository import fetch_competency_terrain, fetch_history_day_rows, fetch_skill_map_overview_algorithm_rows
from app.services import app_settings_service
from app.services.read_models.common import coerce_utc_datetime, resolve_timezone, submission_modality


def _history_day_choices(row: dict[str, Any]) -> list[dict[str, Any]]:
    correct = str(row.get("multiple_choice_correct_choice_id") or "")
    return [
        {"id": choice["id"], "text": choice["text"], "correct": choice["id"] == correct}
        for choice in stored_choices(row.get("multiple_choice_choices"))
    ]


def _generation_trace(row: dict[str, Any]) -> list[dict[str, Any]]:
    """The LLM exchanges that generated the submission's MCQ; ``[]`` for other modalities and old rows."""
    value = row.get("multiple_choice_generation_trace")
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


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
            "generationTrace": _generation_trace(row),
        })
    return {"date": day.isoformat(), "submissions": submissions}


# Competency at or above this is "strong" (the learn/review/strong label comes from the query).
STRONG_COMPETENCY = 70.0


def _algorithm_tags(known: dict[str, str]) -> dict[str, str]:
    """Each tag that names a known algorithm (its own slug, or an alias of it) → that slug."""
    tags = {slug: slug for slug in known}
    for alias, slug in {**taxonomy.CATALOG_SLUG_ALIASES, **taxonomy.ALGORITHM_TAG_ALIASES}.items():
        if slug in known:
            tags[alias] = slug
    return tags


async def get_competency_terrain(timezone_name: str | None = None) -> dict[str, Any]:
    """Competency per algorithm per day for the Journey terrain.

    All of the maths is the aggregate query (``fetch_competency_terrain``): the average of every
    scored signal per algorithm per day, carried forward with a per-day decay. This only names the
    algorithms and shapes the rows.
    """
    tz = resolve_timezone(timezone_name)
    known = {str(row["algorithm_slug"]): str(row["algorithm_name"]) for row in await fetch_skill_map_overview_algorithm_rows()}
    playlists = {str(item["slug"]): str(item["algorithm"]) for item in static_playlist_activity_rows()}
    known.update(playlists)
    decay = (await app_settings_service.grading()).competencyDecayPerDay
    rows = await fetch_competency_terrain(
        timezone_name=str(tz),
        tag_slugs=_algorithm_tags(known),
        decay_per_day=decay,
        today=datetime.now(tz).date(),
        strong_at=STRONG_COMPETENCY,
    )
    order = {slug: index for index, slug in enumerate(known)}
    practised = sorted({row["algorithm"] for row in rows}, key=lambda slug: order.get(slug, len(order)))
    latest = {row["algorithm"]: row for row in rows}  # rows run oldest first per algorithm
    answers = Counter[str]()
    for row in rows:
        answers[row["algorithm"]] += row["answers"]
    return {
        "decayPerDay": decay,
        "algorithms": [
            {
                "slug": slug,
                "name": known.get(slug, slug),
                "kind": "playlist" if slug in playlists else "algorithm",
                "answers": answers[slug],
                "competency": latest[slug]["competency"],
                "lastPractised": latest[slug]["last_practised"].isoformat(),
                "lastAverage": latest[slug]["last_average"],
                "daysSince": latest[slug]["days_since"],
                "standing": latest[slug]["standing"],
            }
            for slug in practised
        ],
        "days": sorted({row["day"].isoformat() for row in rows}),
        "cells": [
            {
                "algorithm": row["algorithm"],
                "date": row["day"].isoformat(),
                "competency": row["competency"],
                "observed": row["observed"],
                "answers": row["answers"],
                "signals": row["signals"],
                "average": row["average"],
                "lastPractised": row["last_practised"].isoformat(),
                "standing": row["standing"],
            }
            for row in rows
        ],
    }
