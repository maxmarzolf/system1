"""Submissions by day and/or algorithm, and competency per algorithm per day (Journey)."""

from __future__ import annotations

import json
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any

from app.contracts.coerce import coerce_json_object
from app.core import taxonomy
from app.core.static_playlists import static_playlist_activity_rows
from app.repositories.multiple_choice_repository import stored_choices
from app.repositories.attempts_repository import fetch_competency_overall, fetch_competency_signals, fetch_competency_terrain, fetch_history_day_rows, fetch_skill_map_overview_algorithm_rows
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


# Without a day, algorithm filters search this many calendar days back (the activity grid's year).
SUBMISSION_WINDOW_DAYS = 365


def _midnight(day: date, tz) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=tz)


async def get_history_submissions(
    day: date | None = None,
    algorithms: list[str] | None = None,
    timezone_name: str | None = None,
    window_days: int = SUBMISSION_WINDOW_DAYS,
) -> dict[str, Any]:
    """The daily work grid's submissions for a calendar ``day`` in ``timezone_name``, for a set of
    ``algorithms`` over the last ``window_days`` days, or both (that day, those algorithms).

    A day lists oldest first; algorithms across days list newest first. With neither, nothing.
    """
    tz = resolve_timezone(timezone_name)
    selected = [slug for slug in dict.fromkeys(algorithms or []) if slug]
    if day is None and not selected:
        return {"date": None, "algorithms": [], "submissions": []}
    if day is not None:
        start, end = _midnight(day, tz), _midnight(day + timedelta(days=1), tz)
    else:
        today = datetime.now(tz).date()
        start, end = _midnight(today - timedelta(days=max(window_days - 1, 0)), tz), _midnight(today + timedelta(days=1), tz)
    rows = await fetch_history_day_rows(start, end)
    algorithm_names = {
        str(row["algorithm_slug"]): str(row["algorithm_name"]) for row in await fetch_skill_map_overview_algorithm_rows()
    }
    algorithm_names.update({str(item["slug"]): str(item["algorithm"]) for item in static_playlist_activity_rows()})
    submissions: list[dict[str, Any]] = []
    for row in rows:
        tags = [str(tag) for tag in (row["category_tags"] or [])]
        # Each answer counts toward one algorithm, its first tagged one (as in the grid and Competency).
        primary = taxonomy.primary_algorithm_slug(tags, set(algorithm_names))
        if primary is None:
            continue  # The grid does not count it either.
        if selected and primary not in selected:
            continue
        slugs = [primary]
        signals = coerce_json_object(row["signals"])
        created_at = coerce_utc_datetime(row["created_at"])
        submissions.append({
            "id": int(row["id"]),
            "createdAt": created_at.isoformat() if created_at else "",
            "date": created_at.astimezone(tz).date().isoformat() if created_at else "",
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
    if day is None:
        submissions.reverse()  # rows come oldest first
    return {"date": day.isoformat() if day else None, "algorithms": selected, "submissions": submissions}


# Competency at or above this is "strong" (the learn/review/strong label comes from the query).
STRONG_COMPETENCY = 70.0
# Overall within this many points of a week ago is "maintaining".
STEADY_WITHIN_POINTS = 2.0
# How many strongest and weakest signals each algorithm lists.
SIGNALS_PER_SIDE = 3


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
    grading = await app_settings_service.grading()
    tag_slugs = _algorithm_tags(known)
    rows = await fetch_competency_terrain(
        timezone_name=str(tz),
        tag_slugs=tag_slugs,
        decay_per_day=grading.competencyDecayPerDay,
        today=datetime.now(tz).date(),
        strong_at=STRONG_COMPETENCY,
        free_fall_days=grading.competencyFreeFallDays,
    )
    overall = await fetch_competency_overall(
        timezone_name=str(tz),
        tag_slugs=tag_slugs,
        decay_per_day=grading.competencyDecayPerDay,
        today=datetime.now(tz).date(),
        steady_within=STEADY_WITHIN_POINTS,
    )
    signals: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for signal in await fetch_competency_signals(timezone_name=str(tz), tag_slugs=tag_slugs, per_side=SIGNALS_PER_SIDE):
        signals.setdefault((signal["algorithm"], signal["side"]), []).append(
            {"key": signal["key"], "label": signal["label"], "average": signal["average"], "answers": signal["answers"]}
        )
    order = {slug: index for index, slug in enumerate(known)}
    practised = sorted({row["algorithm"] for row in rows}, key=lambda slug: order.get(slug, len(order)))
    latest = {row["algorithm"]: row for row in rows}  # rows run oldest first per algorithm
    answers = Counter[str]()
    for row in rows:
        answers[row["algorithm"]] += row["answers"]

    def kind(slug: str) -> str:
        return "playlist" if slug in playlists else "algorithm"

    return {
        "decayPerDay": grading.competencyDecayPerDay,
        "freeFallDays": grading.competencyFreeFallDays,
        "overall": {
            "competency": overall[-1]["competency"] if overall else None,
            "weekChange": overall[-1]["week_change"] if overall else None,
            "trend": overall[-1]["trend"] if overall else None,
            "days": [{"date": row["day"].isoformat(), "competency": row["competency"]} for row in overall],
        },
        "algorithms": [
            {
                "slug": slug,
                "name": known.get(slug, slug),
                "kind": kind(slug),
                "answers": answers[slug],
                "competency": latest[slug]["competency"],
                "lastPractised": latest[slug]["last_practised"].isoformat(),
                "lastAverage": latest[slug]["last_average"],
                "daysSince": latest[slug]["days_since"],
                "standing": latest[slug]["standing"],
                "freeFall": latest[slug]["free_fall"],
                "strongestSignals": signals.get((slug, "strongest"), []),
                "weakestSignals": signals.get((slug, "weakest"), []),
            }
            for slug in practised
        ],
        "unpractised": [{"slug": slug, "name": name, "kind": kind(slug)} for slug, name in known.items() if slug not in latest],
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
