from __future__ import annotations

import json as _json
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any, TypedDict

from app.models import AttemptCreate, SkillMapNode
from app.readiness import READINESS_MODE_ORDER, summarize_readiness
from app.repositories.attempts_repository import (
    fetch_patterns_with_methods_rows,
    fetch_skill_map_overview_attempt_rows,
    fetch_skill_map_overview_generated_rows,
    fetch_skill_map_overview_pattern_rows,
    insert_answer_attempt_row,
)
from app.repositories.types import (
    PatternMethodRow,
    SkillMapOverviewAttemptRow,
    SkillMapOverviewGeneratedRow,
    SkillMapOverviewPatternRow,
)
from app.submission_rubric import compact_submission_rubric, summarize_submission_rubrics
from app.services.contracts import (
    AttemptSaveResult,
    SkillMapGhostRepActivity,
    SkillMapGhostRepActivityDay,
    SkillMapGhostRepPattern,
    SkillMapModeActivity,
    SkillMapModeActivityDay,
    SkillMapModeSummary,
    SkillMapOverviewPayload,
    SkillMapOverviewSummary,
    SkillMapPatternSummary,
    SkillMapReviewQueueItem,
    SkillMapSpacedRepetitionPayload,
)


class AttemptOverviewItem(TypedDict):
    accuracy: float
    created_at: datetime
    supportLayer: str
    liveCoachUsed: bool
    submissionRubric: dict[str, Any]


SPACED_REPETITION_REQUIRED_GHOST_REPS = 1
SPACED_REPETITION_INTERVALS = (0, 1, 3, 7, 14, 30, 60, 90)


def _pattern_slug(pattern: str) -> str:
    return re.sub(
        r"\s+",
        "-",
        re.sub(r"[^a-z0-9\s-]", " ", pattern.lower().replace("/", " ").replace("&", " ").replace("-", " ")).strip(),
    )


def _coerce_utc_datetime(value: Any) -> datetime | None:
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


def _aligned_activity_window(today: date) -> tuple[date, date]:
    days_since_sunday = (today.weekday() + 1) % 7
    window_start = today - timedelta(days=days_since_sunday + 35)
    window_end = window_start + timedelta(days=41)
    return window_start, window_end


def _build_mode_activity(attempts: list[AttemptOverviewItem]) -> SkillMapModeActivity:
    today = datetime.now(timezone.utc).date()
    window_start, window_end = _aligned_activity_window(today)
    counts_by_date: Counter[str] = Counter()

    for attempt in attempts:
        created_at = _coerce_utc_datetime(attempt.get("created_at") or attempt.get("createdAt"))
        if created_at is None:
            continue
        counts_by_date[created_at.date().isoformat()] += 1

    days: list[SkillMapModeActivityDay] = []
    active_days = 0
    recent_submit_count = 0
    last_seven_day_submit_count = 0
    peak_daily_count = 0

    cursor = window_start
    while cursor <= window_end:
        iso_date = cursor.isoformat()
        count = counts_by_date.get(iso_date, 0)
        if count > 0 and cursor <= today:
            active_days += 1
            recent_submit_count += count
            peak_daily_count = max(peak_daily_count, count)
        if count > 0 and today - timedelta(days=6) <= cursor <= today:
            last_seven_day_submit_count += count
        days.append({"date": iso_date, "count": count, "inFuture": cursor > today})
        cursor += timedelta(days=1)

    current_streak = 0
    streak_cursor = today
    while counts_by_date.get(streak_cursor.isoformat(), 0) > 0:
        current_streak += 1
        streak_cursor -= timedelta(days=1)

    longest_streak = 0
    streak = 0
    unique_dates = sorted(date.fromisoformat(iso_date) for iso_date in counts_by_date)
    previous_day: date | None = None
    for current_day in unique_dates:
        if previous_day and current_day == previous_day + timedelta(days=1):
            streak += 1
        else:
            streak = 1
        longest_streak = max(longest_streak, streak)
        previous_day = current_day

    return {
        "windowStart": window_start.isoformat(),
        "windowEnd": window_end.isoformat(),
        "recentSubmitCount": recent_submit_count,
        "lastSevenDaySubmitCount": last_seven_day_submit_count,
        "activeDays": active_days,
        "currentStreak": current_streak,
        "longestStreak": longest_streak,
        "peakDailyCount": peak_daily_count,
        "days": days,
    }


def _build_support_counts(attempts: list[AttemptOverviewItem]) -> dict[str, int]:
    ghost_rep_count = sum(1 for a in attempts if str(a.get("supportLayer", "none")) == "ghost-reps")
    unsupported_attempt_count = len(attempts) - ghost_rep_count
    return {
        "ghostRepCount": ghost_rep_count,
        "unsupportedAttemptCount": unsupported_attempt_count,
        "workCount": len(attempts),
    }


def _build_ghost_rep_activity(
    attempt_rows: list[SkillMapOverviewAttemptRow],
    slug_to_pattern: dict[str, str],
    methods_by_pattern_slug: dict[str, list[str]],
    window_days: int = 42,
) -> SkillMapGhostRepActivity:
    today = datetime.now(timezone.utc).date()
    window_start = today - timedelta(days=max(window_days - 1, 0))
    known_pattern_slugs = set(slug_to_pattern)
    counts_by_day_type_pattern: dict[str, Counter[tuple[str, str]]] = {}
    method_counts_by_day_type_pattern: dict[tuple[str, str, str], Counter[str]] = {}
    pattern_ghost_totals: Counter[str] = Counter()
    pattern_mcq_totals: Counter[str] = Counter()
    last_ghost_seen_by_pattern: dict[str, date] = {}
    last_work_seen_by_pattern: dict[str, date] = {}

    for row in attempt_rows:
        created_at = _coerce_utc_datetime(row["created_at"])
        if created_at is None:
            continue
        category_tags = [str(tag) for tag in (row["category_tags"] or [])]
        is_mcq = "skill-map-mcq" in category_tags
        is_ghost_rep = str(row["support_layer"] or "none") == "ghost-reps"
        if not is_ghost_rep and not is_mcq:
            continue
        matched_pattern_slugs = [tag for tag in category_tags if tag in known_pattern_slugs]
        if not matched_pattern_slugs:
            continue
        work_type = "multiple-choice" if is_mcq else "ghost-reps"
        attempt_date = created_at.date()
        iso_date = attempt_date.isoformat()
        for slug in matched_pattern_slugs:
            known_methods = methods_by_pattern_slug.get(slug, [])
            matched_method_slugs = [
                _pattern_slug(method)
                for method in known_methods
                if _pattern_slug(method) in category_tags
            ]
            method_slug = matched_method_slugs[0] if matched_method_slugs else "unclassified"
            if is_mcq:
                pattern_mcq_totals[slug] += 1
            else:
                pattern_ghost_totals[slug] += 1
            if attempt_date >= window_start:
                counts_by_day_type_pattern.setdefault(iso_date, Counter())[(work_type, slug)] += 1
                method_counts_by_day_type_pattern.setdefault((iso_date, work_type, slug), Counter())[method_slug] += 1
            if is_ghost_rep and (slug not in last_ghost_seen_by_pattern or attempt_date > last_ghost_seen_by_pattern[slug]):
                last_ghost_seen_by_pattern[slug] = attempt_date
            if slug not in last_work_seen_by_pattern or attempt_date > last_work_seen_by_pattern[slug]:
                last_work_seen_by_pattern[slug] = attempt_date

    days: list[SkillMapGhostRepActivityDay] = []
    active_days = 0
    peak_daily_count = 0
    cursor = window_start
    while cursor <= today:
        iso_date = cursor.isoformat()
        day_counts = counts_by_day_type_pattern.get(iso_date, Counter())
        total = sum(day_counts.values())
        ghost_rep_count = sum(count for (work_type, _slug), count in day_counts.items() if work_type == "ghost-reps")
        multiple_choice_count = sum(count for (work_type, _slug), count in day_counts.items() if work_type == "multiple-choice")
        if total > 0:
            active_days += 1
        peak_daily_count = max(peak_daily_count, total)
        days.append({
            "date": iso_date,
            "total": total,
            "ghostRepCount": ghost_rep_count,
            "multipleChoiceCount": multiple_choice_count,
            "segments": [
                {
                    "pattern": slug_to_pattern[slug],
                    "slug": slug,
                    "workType": work_type,
                    "count": count,
                    "methods": [
                        {
                            "method": next(
                                (
                                    method
                                    for method in methods_by_pattern_slug.get(slug, [])
                                    if _pattern_slug(method) == method_slug
                                ),
                                "Unclassified",
                            ),
                            "slug": method_slug,
                            "count": method_count,
                        }
                        for method_slug, method_count in sorted(
                            method_counts_by_day_type_pattern.get((iso_date, work_type, slug), Counter()).items(),
                            key=lambda item: item[0],
                        )
                    ],
                }
                for (work_type, slug), count in sorted(
                    day_counts.items(),
                    key=lambda item: (0 if item[0][0] == "ghost-reps" else 1, slug_to_pattern[item[0][1]], item[0][1]),
                )
            ],
        })
        cursor += timedelta(days=1)

    patterns: list[SkillMapGhostRepPattern] = [
        {
            "pattern": pattern,
            "slug": slug,
            "totalGhostReps": int(pattern_ghost_totals.get(slug, 0)),
            "totalMultipleChoice": int(pattern_mcq_totals.get(slug, 0)),
            "totalWork": int(pattern_ghost_totals.get(slug, 0) + pattern_mcq_totals.get(slug, 0)),
            "daysSinceLastGhostRep": (today - last_ghost_seen_by_pattern[slug]).days if slug in last_ghost_seen_by_pattern else None,
            "daysSinceLastPractice": (today - last_work_seen_by_pattern[slug]).days if slug in last_work_seen_by_pattern else None,
        }
        for slug, pattern in slug_to_pattern.items()
    ]

    return {
        "windowStart": window_start.isoformat(),
        "windowEnd": today.isoformat(),
        "totalGhostReps": sum(day["ghostRepCount"] for day in days),
        "totalMultipleChoice": sum(day["multipleChoiceCount"] for day in days),
        "workCount": sum(day["total"] for day in days),
        "activeDays": active_days,
        "peakDailyCount": peak_daily_count,
        "days": days,
        "patterns": patterns,
    }


def _status_label(status: str) -> str:
    return {
        "not_started": "Not started",
        "acquisition": "Acquisition incomplete",
        "failed": "Failed validation",
        "overdue": "Overdue",
        "due": "Due today",
        "scheduled": "Scheduled",
        "maintenance": "Maintenance",
    }.get(status, status.replace("_", " ").title())


def _next_interval_gap(completed_sessions: int) -> int:
    if completed_sessions <= 0:
        return 0
    if completed_sessions < len(SPACED_REPETITION_INTERVALS):
        return SPACED_REPETITION_INTERVALS[completed_sessions] - SPACED_REPETITION_INTERVALS[completed_sessions - 1]
    return 90


def _build_spaced_repetition(
    attempt_rows: list[SkillMapOverviewAttemptRow],
    card_ids_by_pattern: dict[str, set[str]],
    slug_to_pattern: dict[str, str],
    methods_by_pattern_slug: dict[str, list[str]],
    card_ids_by_method: dict[tuple[str, str], set[str]],
) -> SkillMapSpacedRepetitionPayload:
    today = datetime.now(timezone.utc).date()
    window_start = today - timedelta(days=6)
    window_end = today + timedelta(days=14)

    track_definitions: list[dict[str, Any]] = []
    card_to_track_ids: dict[str, set[str]] = {}
    method_slug_lookup: dict[tuple[str, str], str] = {}

    for pattern_slug, pattern_label in slug_to_pattern.items():
        pattern_cards = card_ids_by_pattern.get(pattern_slug, set())
        track_definitions.append({
            "id": pattern_slug,
            "label": pattern_label,
            "slug": pattern_slug,
            "level": "pattern",
            "parentSlug": None,
            "parentLabel": None,
            "cards": pattern_cards,
        })
        for card_id in pattern_cards:
            card_to_track_ids.setdefault(card_id, set()).add(pattern_slug)

        for method in methods_by_pattern_slug.get(pattern_slug, []):
            method_slug = _pattern_slug(method)
            track_id = f"{pattern_slug}:{method_slug}"
            method_cards = card_ids_by_method.get((pattern_slug, method_slug), set())
            method_slug_lookup[(pattern_slug, method_slug)] = track_id
            track_definitions.append({
                "id": track_id,
                "label": method,
                "slug": method_slug,
                "level": "method",
                "parentSlug": pattern_slug,
                "parentLabel": pattern_label,
                "cards": method_cards,
            })
            for card_id in method_cards:
                card_to_track_ids.setdefault(card_id, set()).add(track_id)

    attempted_cards_by_track_day: dict[str, dict[date, set[str]]] = {
        str(track["id"]): {} for track in track_definitions
    }
    attempt_counts_by_track_day: dict[str, Counter[date]] = {
        str(track["id"]): Counter() for track in track_definitions
    }

    for row in attempt_rows:
        if str(row["support_layer"] or "none") != "ghost-reps":
            continue
        card_id = str(row["tracked_card_id"] or "").strip()
        created_at = _coerce_utc_datetime(row["created_at"])
        if created_at is None:
            continue
        attempt_date = created_at.date()
        category_tags = [str(tag) for tag in (row["category_tags"] or [])]
        pattern_slugs = [tag for tag in category_tags if tag in slug_to_pattern]
        track_ids: set[str] = set()
        if card_id:
            track_ids.update(card_to_track_ids.get(card_id, set()))
        track_ids.update(pattern_slugs)

        for pattern_slug in pattern_slugs:
            known_methods = methods_by_pattern_slug.get(pattern_slug, [])
            for method in known_methods:
                method_slug = _pattern_slug(method)
                if method_slug in category_tags:
                    track_ids.add(method_slug_lookup[(pattern_slug, method_slug)])

        for track_id in track_ids:
            attempt_counts_by_track_day.setdefault(track_id, Counter())[attempt_date] += 1
            if card_id:
                attempted_cards_by_track_day.setdefault(track_id, {}).setdefault(attempt_date, set()).add(card_id)

    tracks: list[dict[str, Any]] = []
    for track in track_definitions:
        track_id = str(track["id"])
        cards = set(track["cards"])
        if track["level"] == "pattern" and not cards:
            continue

        attempted_days = attempted_cards_by_track_day.get(track_id, {})
        attempt_counts = attempt_counts_by_track_day.get(track_id, Counter())
        all_activity_dates = sorted(set(attempted_days) | set(attempt_counts))
        completion_dates = sorted(
            attempt_date
            for attempt_date in all_activity_dates
            if (
                cards.issubset(attempted_days.get(attempt_date, set()))
                if cards
                else attempt_counts.get(attempt_date, 0) >= SPACED_REPETITION_REQUIRED_GHOST_REPS
            )
        )
        attempted_dates = all_activity_dates
        started_at = attempted_dates[0] if attempted_dates else None
        last_attempted_at = attempted_dates[-1] if attempted_dates else None
        last_completed_at = completion_dates[-1] if completion_dates else None

        completed_sessions = len(completion_dates)
        next_due_at: date | None = None
        status = "not_started"
        stage_label = "Acquire"

        incomplete_after_last_completion = [
            attempt_date
            for attempt_date in attempted_dates
            if attempt_date not in completion_dates and (last_completed_at is None or attempt_date > last_completed_at)
        ]
        last_incomplete_at = incomplete_after_last_completion[-1] if incomplete_after_last_completion else None

        if not completion_dates:
            if attempted_dates:
                status = "acquisition"
                next_due_at = today
            stage_label = "Acquire"
        elif last_incomplete_at:
            next_due_at = last_incomplete_at + timedelta(days=1)
            if next_due_at < today:
                status = "overdue"
            elif next_due_at == today:
                status = "failed"
            else:
                status = "failed"
            stage_label = "Validate"
        else:
            next_due_at = last_completed_at + timedelta(days=_next_interval_gap(completed_sessions))
            if completed_sessions >= len(SPACED_REPETITION_INTERVALS):
                stage_label = "Maintenance"
            else:
                stage_label = f"Day {SPACED_REPETITION_INTERVALS[completed_sessions]}"

            if next_due_at < today:
                status = "overdue"
            elif next_due_at == today:
                status = "due"
            elif completed_sessions >= len(SPACED_REPETITION_INTERVALS):
                status = "maintenance"
            else:
                status = "scheduled"

        days = []
        cursor = window_start
        while cursor <= window_end:
            if cursor in completion_dates:
                day_status = "completed"
                label = "Completed"
            elif cursor in attempted_dates:
                day_status = "failed"
                label = "Incomplete"
            elif next_due_at and cursor == next_due_at:
                day_status = "due" if cursor <= today else "scheduled"
                label = "Due" if cursor <= today else "Scheduled"
            elif next_due_at and next_due_at < cursor <= today:
                day_status = "overdue"
                label = "Overdue"
            else:
                day_status = "empty"
                label = ""
            days.append({
                "date": cursor.isoformat(),
                "status": day_status,
                "label": label,
            })
            cursor += timedelta(days=1)

        days_until_due = (next_due_at - today).days if next_due_at else None
        tracks.append({
            "id": track_id,
            "label": str(track["label"]),
            "slug": str(track["slug"]),
            "level": str(track["level"]),
            "parentSlug": track["parentSlug"],
            "parentLabel": track["parentLabel"],
            "coreAlgorithmCount": len(cards) if cards else SPACED_REPETITION_REQUIRED_GHOST_REPS,
            "requiredGhostReps": SPACED_REPETITION_REQUIRED_GHOST_REPS,
            "status": status,
            "statusLabel": _status_label(status),
            "stageLabel": stage_label,
            "completedSessions": completed_sessions,
            "startedAt": started_at.isoformat() if started_at else None,
            "lastAttemptedAt": last_attempted_at.isoformat() if last_attempted_at else None,
            "lastCompletedAt": last_completed_at.isoformat() if last_completed_at else None,
            "nextDueAt": next_due_at.isoformat() if next_due_at else None,
            "daysUntilDue": days_until_due,
            "days": days,
        })

    priority = {
        "overdue": 0,
        "failed": 1,
        "acquisition": 2,
        "due": 3,
        "not_started": 4,
        "scheduled": 5,
        "maintenance": 6,
    }
    queue = [
        track for track in sorted(
            tracks,
            key=lambda item: (
                priority.get(str(item["status"]), 9),
                item["daysUntilDue"] if item["daysUntilDue"] is not None else 999,
                0 if str(item["level"]) == "pattern" else 1,
                str(item["id"]),
            ),
        )
        if str(track["status"]) in {"overdue", "failed", "acquisition", "due"}
    ]

    return {
        "today": today.isoformat(),
        "windowStart": window_start.isoformat(),
        "windowEnd": window_end.isoformat(),
        "intervals": list(SPACED_REPETITION_INTERVALS),
        "requiredGhostReps": SPACED_REPETITION_REQUIRED_GHOST_REPS,
        "tracks": tracks,
        "queue": queue,
    }


def build_skill_map_overview(
    pattern_rows: list[SkillMapOverviewPatternRow],
    generated_rows: list[SkillMapOverviewGeneratedRow],
    attempt_rows: list[SkillMapOverviewAttemptRow],
) -> SkillMapOverviewPayload:
    grouped: dict[int, dict[str, Any]] = {}
    for row in pattern_rows:
        pattern_id = int(row["pattern_id"])
        pattern_name = str(row["pattern_name"])
        if pattern_id not in grouped:
            grouped[pattern_id] = {
                "pattern": pattern_name,
                "slug": _pattern_slug(pattern_name),
                "methods": [],
            }
        if row["method_name"]:
            grouped[pattern_id]["methods"].append(str(row["method_name"]))

    patterns = list(grouped.values())
    slug_to_pattern = {str(item["slug"]): str(item["pattern"]) for item in patterns}
    methods_by_pattern_slug = {
        str(item["slug"]): [str(method) for method in item["methods"]]
        for item in patterns
    }
    known_pattern_slugs = set(slug_to_pattern)

    generated_cards: dict[str, dict[str, Any]] = {}
    card_ids_by_pattern: dict[str, set[str]] = {slug: set() for slug in known_pattern_slugs}
    card_ids_by_method: dict[tuple[str, str], set[str]] = {
        (pattern_slug, _pattern_slug(method)): set()
        for pattern_slug, methods in methods_by_pattern_slug.items()
        for method in methods
    }
    for row in generated_rows:
        tags = [str(tag) for tag in (row["tags"] or [])]
        matched_pattern_slugs = [tag for tag in tags if tag in known_pattern_slugs]
        generated_cards[str(row["id"])] = {
            "cardId": str(row["id"]),
            "title": str(row["title"] or ""),
            "patternSlugs": matched_pattern_slugs,
        }
        for slug in matched_pattern_slugs:
            card_ids_by_pattern.setdefault(slug, set()).add(str(row["id"]))
            for method in methods_by_pattern_slug.get(slug, []):
                method_slug = _pattern_slug(method)
                if method_slug in tags:
                    card_ids_by_method.setdefault((slug, method_slug), set()).add(str(row["id"]))

    attempts_by_card_mode: dict[tuple[str, str], list[AttemptOverviewItem]] = {}
    attempts_by_pattern_mode: dict[tuple[str, str], list[AttemptOverviewItem]] = {}
    attempted_card_ids: set[str] = set()
    total_ghost_rep_count = 0
    total_unsupported_attempt_count = 0

    for row in attempt_rows:
        card_id = str(row["tracked_card_id"] or "").strip()
        if not card_id:
            continue
        category_tags = [str(tag) for tag in (row["category_tags"] or [])]
        if "skill-map-mcq" in category_tags:
            continue
        template_mode = str(row["template_mode"] or "algorithm").strip() or "algorithm"
        support_layer = str(row["support_layer"] or "none")
        if support_layer == "ghost-reps":
            total_ghost_rep_count += 1
        else:
            total_unsupported_attempt_count += 1
        matched_pattern_slugs = [tag for tag in category_tags if tag in known_pattern_slugs]

        if card_id not in generated_cards:
            generated_cards[card_id] = {
                "cardId": card_id,
                "title": str(row["card_title"] or card_id),
                "patternSlugs": matched_pattern_slugs,
            }

        attempt: AttemptOverviewItem = {
            "accuracy": float(row["accuracy"] or 0),
            "created_at": row["created_at"],
            "supportLayer": support_layer,
            "liveCoachUsed": bool(row["live_coach_used"]),
            "submissionRubric": compact_submission_rubric(row["submission_rubric"]),
        }
        attempts_by_card_mode.setdefault((card_id, template_mode), []).append(attempt)
        for slug in matched_pattern_slugs:
            attempts_by_pattern_mode.setdefault((slug, template_mode), []).append(attempt)
        attempted_card_ids.add(card_id)

    pattern_summaries: list[SkillMapPatternSummary] = []
    card_mode_summaries: dict[tuple[str, str], SkillMapReviewQueueItem] = {}

    for pattern in patterns:
        slug = str(pattern["slug"])
        pattern_card_ids = card_ids_by_pattern.get(slug, set())
        mode_summaries: dict[str, SkillMapModeSummary] = {}
        practiced_cards_any_mode: set[str] = set()
        stale_cards_any_mode: set[str] = set()
        overall_attempt_count = 0
        overall_ghost_rep_count = 0
        overall_unsupported_attempt_count = 0

        for template_mode in READINESS_MODE_ORDER:
            pattern_mode_attempts = attempts_by_pattern_mode.get((slug, template_mode), [])
            readiness_summary = summarize_readiness(pattern_mode_attempts)
            mode_support_counts = _build_support_counts(pattern_mode_attempts)
            practiced_card_ids = {
                card_id for card_id in pattern_card_ids if attempts_by_card_mode.get((card_id, template_mode))
            }
            stale_card_count = 0
            for card_id in practiced_card_ids:
                card_attempts = attempts_by_card_mode.get((card_id, template_mode), [])
                card_readiness = summarize_readiness(card_attempts)
                card_support_counts = _build_support_counts(card_attempts)
                if card_readiness["stale"]:
                    stale_card_count += 1
                    stale_cards_any_mode.add(card_id)
                card_mode_summaries[(card_id, template_mode)] = {
                    "cardId": card_id,
                    "title": generated_cards.get(card_id, {}).get("title", card_id),
                    "pattern": str(pattern["pattern"]),
                    "templateMode": template_mode,
                    "readiness": card_readiness["readiness"],
                    "attemptCount": card_readiness["attemptCount"],
                    **card_support_counts,
                    "daysSinceLastSubmit": card_readiness["daysSinceLastSubmit"],
                    "stale": card_readiness["stale"],
                    "dimensionSummary": summarize_submission_rubrics(card_attempts),
                }

            practiced_cards_any_mode.update(practiced_card_ids)
            mode_summaries[template_mode] = {
                **readiness_summary,
                **mode_support_counts,
                "totalCards": len(pattern_card_ids),
                "practicedCards": len(practiced_card_ids),
                "untouchedCards": max(len(pattern_card_ids) - len(practiced_card_ids), 0),
                "staleCards": stale_card_count,
                "dimensionSummary": summarize_submission_rubrics(pattern_mode_attempts),
                "activity": _build_mode_activity(pattern_mode_attempts),
            }
            overall_attempt_count += int(readiness_summary["attemptCount"])
            overall_ghost_rep_count += int(mode_support_counts["ghostRepCount"])
            overall_unsupported_attempt_count += int(mode_support_counts["unsupportedAttemptCount"])

        overall_readiness = round(
            sum(float(mode_summaries[mode]["readiness"]) for mode in READINESS_MODE_ORDER) / len(READINESS_MODE_ORDER),
            1,
        )
        pattern_summaries.append({
            "pattern": pattern["pattern"],
            "slug": slug,
            "methods": pattern["methods"],
            "overallReadiness": overall_readiness,
            "overallAttemptCount": overall_attempt_count,
            "ghostRepCount": overall_ghost_rep_count,
            "unsupportedAttemptCount": overall_unsupported_attempt_count,
            "workCount": overall_attempt_count,
            "totalCards": len(pattern_card_ids),
            "practicedCards": len(practiced_cards_any_mode),
            "untouchedCards": max(len(pattern_card_ids) - len(practiced_cards_any_mode), 0),
            "staleCards": len(stale_cards_any_mode),
            "dimensionSummary": summarize_submission_rubrics([
                item
                for template_mode in READINESS_MODE_ORDER
                for item in attempts_by_pattern_mode.get((slug, template_mode), [])
            ]),
            "modes": mode_summaries,
        })

    review_queue: list[SkillMapReviewQueueItem] = [
        item
        for item in sorted(
            card_mode_summaries.values(),
            key=lambda item: (
                0 if item["stale"] else 1,
                float(item["readiness"]),
                item["daysSinceLastSubmit"] if item["daysSinceLastSubmit"] is not None else -1,
                str(item["title"]),
            ),
        )
        if item["attemptCount"] > 0
    ][:8]

    stale_card_ids: set[str] = {item["cardId"] for item in card_mode_summaries.values() if item["stale"]}
    avg_pattern_readiness = round(
        sum(float(item["overallReadiness"]) for item in pattern_summaries) / len(pattern_summaries),
        1,
    ) if pattern_summaries else 0.0

    summary: SkillMapOverviewSummary = {
        "totalGeneratedCards": len(generated_cards),
        "attemptedCards": len(attempted_card_ids),
        "untouchedCards": max(len(generated_cards) - len(attempted_card_ids), 0),
        "staleCards": len(stale_card_ids),
        "ghostRepCount": total_ghost_rep_count,
        "unsupportedAttemptCount": total_unsupported_attempt_count,
        "workCount": total_ghost_rep_count + total_unsupported_attempt_count,
        "patternsStarted": sum(1 for item in pattern_summaries if item["overallAttemptCount"] > 0),
        "patternsUntouched": sum(1 for item in pattern_summaries if item["overallAttemptCount"] == 0),
        "avgPatternReadiness": avg_pattern_readiness,
        "modeOrder": list(READINESS_MODE_ORDER),
        "successThreshold": 90,
        "staleAfterDays": 7,
    }

    return {
        "summary": summary,
        "patterns": pattern_summaries,
        "reviewQueue": review_queue,
        "ghostRepActivity": _build_ghost_rep_activity(attempt_rows, slug_to_pattern, methods_by_pattern_slug),
        "spacedRepetition": _build_spaced_repetition(
            attempt_rows,
            card_ids_by_pattern,
            slug_to_pattern,
            methods_by_pattern_slug,
            card_ids_by_method,
        ),
    }


def build_skill_map_nodes(pattern_rows: list[PatternMethodRow]) -> list[SkillMapNode]:
    grouped: dict[int, SkillMapNode] = {}
    for row in pattern_rows:
        pattern_id = int(row["pattern_id"])
        pattern_name = str(row["pattern_name"])
        method_name = row.get("method_name")

        if pattern_id not in grouped:
            grouped[pattern_id] = SkillMapNode(pattern=pattern_name, methods=[])

        if method_name:
            grouped[pattern_id].methods.append(str(method_name))

    return list(grouped.values())


async def create_attempt(body: AttemptCreate) -> AttemptSaveResult:
    now = datetime.now(tz=timezone.utc)
    submission_rubric = compact_submission_rubric(
        body.submissionRubric
        or (body.coachFeedback or {}).get("submissionRubric")
    )
    mcq_detail = body.mcqDetail.model_dump() if body.mcqDetail else None
    skill_evidence = [item.model_dump() for item in body.skillEvidence]
    misconception_signals = [item.model_dump() for item in body.misconceptionSignals]

    row = await insert_answer_attempt_row(
        card_id=body.cardId,
        card_title=body.cardTitle,
        question=body.question,
        question_type=body.questionType,
        category_tags=body.categoryTags,
        correct_answer=body.correctAnswer,
        user_answer=body.userAnswer,
        mode=body.mode.value,
        correct=body.correct,
        accuracy=body.accuracy,
        exact=body.exact,
        elapsed_ms=body.elapsedMs,
        interaction_id=body.interactionId,
        generated_card_id=body.generatedCardId,
        generated_card_json=_json.dumps(body.generatedCard) if body.generatedCard else None,
        template_mode=body.templateMode.value,
        support_layer=body.supportLayer.value,
        live_coach_used=body.liveCoachUsed,
        coach_feedback_json=_json.dumps(body.coachFeedback) if body.coachFeedback else None,
        submission_rubric_json=_json.dumps(submission_rubric) if submission_rubric else None,
        activity_format=body.activityFormat,
        target_source=body.targetSource,
        target_control=body.targetControl,
        format_control=body.formatControl,
        mcq_detail=mcq_detail,
        skill_evidence=skill_evidence,
        misconception_signals=misconception_signals,
        created_at=now,
        updated_at=now,
    )

    return {"saved": True, "attemptId": row["id"] if row else None}


async def get_skill_map() -> list[SkillMapNode]:
    rows = await fetch_patterns_with_methods_rows()

    return build_skill_map_nodes(rows)


async def get_skill_map_overview() -> SkillMapOverviewPayload:
    pattern_rows = await fetch_skill_map_overview_pattern_rows()
    generated_rows = await fetch_skill_map_overview_generated_rows()
    attempt_rows = await fetch_skill_map_overview_attempt_rows()
    return build_skill_map_overview(pattern_rows, generated_rows, attempt_rows)
