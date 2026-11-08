from __future__ import annotations

import json as _json
from collections import Counter
from datetime import date, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Any, TypedDict

from app.models import AttemptCreate, SkillMapNode
from app.readiness import READINESS_MODE_ORDER, summarize_readiness
from app.repositories.attempts_repository import (
    fetch_algorithms_with_skills_rows,
    fetch_history_day_rows,
    fetch_skill_map_overview_algorithm_rows,
    fetch_skill_map_overview_attempt_rows,
    fetch_skill_map_overview_generated_rows,
    insert_submission_attempt_row,
)
from app.core.static_playlists import static_playlist_activity_rows
from app.repositories.types import (
    AlgorithmSkillRow,
    SkillMapOverviewAlgorithmRow,
    SkillMapOverviewAttemptRow,
    SkillMapOverviewGeneratedRow,
)
from app.contracts.coerce import coerce_json_object
from app.contracts.evaluation import Evaluation, compact_evaluation
from app.domain.rubric_summary import summarize_submission_rubrics
from app.contracts.submission import SubmissionRecord
from app.services.contracts import (
    AttemptSaveResult,
    SkillMapGhostRepActivity,
    SkillMapGhostRepActivityDay,
    SkillMapGhostRepAlgorithm,
    SkillMapModeActivity,
    SkillMapModeActivityDay,
    SkillMapModeSummary,
    SkillMapAlgorithmSummary,
    SkillMapOverviewPayload,
)
from app.core import taxonomy


class AttemptOverviewItem(TypedDict):
    successful: bool
    created_at: datetime
    supportLayer: str
    liveCoachUsed: bool
    signals: dict[str, Any]


def _submission_modality(row: dict[str, Any]) -> str:
    """The stored modality (a NOT NULL column; rows built in tests may omit it)."""
    return str(row.get("modality") or "").strip() or "total-recall"


def _submission_signals(
    body: AttemptCreate,
    *,
    modality: str,
    evaluation: Evaluation,
) -> dict[str, Any]:
    raw_signals = body.signals if isinstance(body.signals, dict) else {}
    signals: dict[str, Any] = {
        "elapsed_ms": body.elapsedMs,
        "evaluation": evaluation.to_stored(),
    }
    flow_signals = raw_signals.get("flow")
    if isinstance(flow_signals, dict) and flow_signals:
        signals["flow"] = flow_signals

    modality_signals = raw_signals.get("modality")
    if isinstance(modality_signals, dict):
        signals["modality"] = {
            **modality_signals,
            "kind": modality,
        }
    else:
        signals["modality"] = {"kind": modality}
    return signals


def resolve_timezone(name: str | None) -> tzinfo:
    """The viewer's IANA timezone for calendar-day bucketing; UTC when missing or unknown."""
    try:
        return ZoneInfo(name) if name else timezone.utc
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


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
    core_card_counts: dict[str, int] | None = None,
    primary_activity_slugs: set[str] | None = None,
    window_days: int | None = 42,
    tz: tzinfo = timezone.utc,
) -> SkillMapGhostRepActivity:
    """Daily work per algorithm for the last ``window_days`` calendar days in ``tz``, or since the first attempt when None."""
    today = datetime.now(tz).date()
    if window_days is None:
        attempt_dates = [
            created_at.astimezone(tz).date()
            for row in attempt_rows
            if (created_at := _coerce_utc_datetime(row["created_at"])) is not None
        ]
        window_start = min([*attempt_dates, today])
    else:
        window_start = today - timedelta(days=max(window_days - 1, 0))
    slug_to_algorithm = slug_to_pattern
    skills_by_algorithm_slug = methods_by_pattern_slug
    known_algorithm_slugs = set(slug_to_algorithm)
    counts_by_day_type_algorithm: dict[str, Counter[tuple[str, str]]] = {}
    skill_counts_by_day_type_algorithm: dict[tuple[str, str, str], Counter[str]] = {}
    algorithm_ghost_totals: Counter[str] = Counter()
    algorithm_mcq_totals: Counter[str] = Counter()
    algorithm_perfect_recall_totals: Counter[str] = Counter()
    algorithm_work_totals: Counter[str] = Counter()
    perfect_recall_counts_in_window: Counter[str] = Counter()
    last_ghost_seen_by_algorithm: dict[str, date] = {}
    last_work_seen_by_algorithm: dict[str, date] = {}

    for row in attempt_rows:
        created_at = _coerce_utc_datetime(row["created_at"])
        if created_at is None:
            continue
        category_tags = [str(tag) for tag in (row["category_tags"] or [])]
        modality = _submission_modality(row)
        is_mcq = (
            modality == "mcq"
            or str(row.get("question_type") or "").startswith("skill-map-mcq")
            or "skill-map-mcq" in category_tags
        )
        is_ghost_rep = modality == "ghost-rep"
        is_total_recall = modality == "total-recall"
        is_microdrill = modality == "microdrill"
        if not is_ghost_rep and not is_mcq and not is_total_recall and not is_microdrill:
            continue
        matched_algorithm_slugs = taxonomy.matched_algorithm_slugs(category_tags, known_algorithm_slugs)
        primary_matches = [
            slug
            for slug in matched_algorithm_slugs
            if slug in (primary_activity_slugs or set())
        ]
        if "static-playlist" in category_tags and primary_matches:
            matched_algorithm_slugs = primary_matches
        if not matched_algorithm_slugs:
            continue
        work_type = (
            "multiple-choice"
            if is_mcq
            else "ghost-reps"
            if is_ghost_rep
            else "microdrill"
            if is_microdrill
            else "total-recall"
        )
        attempt_date = created_at.astimezone(tz).date()
        iso_date = attempt_date.isoformat()
        for slug in matched_algorithm_slugs:
            known_skills = skills_by_algorithm_slug.get(slug, [])
            matched_skill_slugs = [
                taxonomy.algorithm_slug(skill)
                for skill in known_skills
                if taxonomy.algorithm_slug(skill) in category_tags
            ]
            skill_slug = matched_skill_slugs[0] if matched_skill_slugs else "unclassified"
            if is_mcq:
                algorithm_mcq_totals[slug] += 1
            elif is_total_recall and bool(row.get("successful")):
                algorithm_perfect_recall_totals[slug] += 1
            elif is_ghost_rep:
                algorithm_ghost_totals[slug] += 1
            algorithm_work_totals[slug] += 1
            if attempt_date >= window_start:
                counts_by_day_type_algorithm.setdefault(iso_date, Counter())[(work_type, slug)] += 1
                skill_counts_by_day_type_algorithm.setdefault((iso_date, work_type, slug), Counter())[skill_slug] += 1
                if is_total_recall and bool(row.get("successful")):
                    perfect_recall_counts_in_window[iso_date] += 1
            if is_ghost_rep and (slug not in last_ghost_seen_by_algorithm or attempt_date > last_ghost_seen_by_algorithm[slug]):
                last_ghost_seen_by_algorithm[slug] = attempt_date
            if slug not in last_work_seen_by_algorithm or attempt_date > last_work_seen_by_algorithm[slug]:
                last_work_seen_by_algorithm[slug] = attempt_date

    days: list[SkillMapGhostRepActivityDay] = []
    active_days = 0
    peak_daily_count = 0
    cursor = window_start
    while cursor <= today:
        iso_date = cursor.isoformat()
        day_counts = counts_by_day_type_algorithm.get(iso_date, Counter())
        total = sum(day_counts.values())
        ghost_rep_count = sum(count for (work_type, _slug), count in day_counts.items() if work_type == "ghost-reps")
        multiple_choice_count = sum(count for (work_type, _slug), count in day_counts.items() if work_type == "multiple-choice")
        total_recall_count = sum(count for (work_type, _slug), count in day_counts.items() if work_type == "total-recall")
        if total > 0:
            active_days += 1
        peak_daily_count = max(peak_daily_count, total)
        days.append({
            "date": iso_date,
            "total": total,
            "ghostRepCount": ghost_rep_count,
            "multipleChoiceCount": multiple_choice_count,
            "totalRecallCount": total_recall_count,
            "segments": [
                {
                    "algorithm": slug_to_algorithm[slug],
                    "slug": slug,
                    "workType": work_type,
                    "count": count,
                    "skills": [
                        {
                            "skill": next(
                                (
                                    skill
                                    for skill in skills_by_algorithm_slug.get(slug, [])
                                    if taxonomy.algorithm_slug(skill) == skill_slug
                                ),
                                "Unclassified",
                            ),
                            "slug": skill_slug,
                            "count": skill_count,
                        }
                        for skill_slug, skill_count in sorted(
                            skill_counts_by_day_type_algorithm.get((iso_date, work_type, slug), Counter()).items(),
                            key=lambda item: item[0],
                        )
                    ],
                }
                for (work_type, slug), count in sorted(
                    day_counts.items(),
                    key=lambda item: (0 if item[0][0] == "ghost-reps" else 1, slug_to_algorithm[item[0][1]], item[0][1]),
                )
            ],
        })
        cursor += timedelta(days=1)

    algorithms: list[SkillMapGhostRepAlgorithm] = [
        {
            "algorithm": algorithm,
            "slug": slug,
            "totalGhostReps": int(algorithm_ghost_totals.get(slug, 0)),
            "totalMultipleChoice": int(algorithm_mcq_totals.get(slug, 0)),
            "totalPerfectRecalls": int(algorithm_perfect_recall_totals.get(slug, 0)),
            "totalWork": int(algorithm_work_totals.get(slug, 0)),
            "coreCardCount": int((core_card_counts or {}).get(slug, 0)),
            "daysSinceLastGhostRep": (today - last_ghost_seen_by_algorithm[slug]).days if slug in last_ghost_seen_by_algorithm else None,
            "daysSinceLastPractice": (today - last_work_seen_by_algorithm[slug]).days if slug in last_work_seen_by_algorithm else None,
        }
        for slug, algorithm in slug_to_algorithm.items()
    ]

    return {
        "windowStart": window_start.isoformat(),
        "windowEnd": today.isoformat(),
        "totalGhostReps": sum(day["ghostRepCount"] for day in days),
        "totalMultipleChoice": sum(day["multipleChoiceCount"] for day in days),
        "totalPerfectRecalls": sum(perfect_recall_counts_in_window.values()),
        "workCount": sum(day["total"] for day in days),
        "activeDays": active_days,
        "peakDailyCount": peak_daily_count,
        "days": days,
        "algorithms": algorithms,
    }


def build_skill_map_overview(
    algorithm_rows: list[SkillMapOverviewAlgorithmRow],
    generated_rows: list[SkillMapOverviewGeneratedRow],
    attempt_rows: list[SkillMapOverviewAttemptRow],
    history_days: int | None = 42,
    history_tz: tzinfo = timezone.utc,
) -> SkillMapOverviewPayload:
    grouped: dict[int, dict[str, Any]] = {}
    for row in algorithm_rows:
        algorithm_id = int(row["algorithm_id"])
        algorithm_name = str(row["algorithm_name"])
        algorithm_slug = str(row.get("algorithm_slug") or taxonomy.algorithm_slug(algorithm_name))
        if algorithm_id not in grouped:
            grouped[algorithm_id] = {
                "algorithm": algorithm_name,
                "slug": algorithm_slug,
                "skills": [],
            }
        if row["skill_name"]:
            grouped[algorithm_id]["skills"].append(str(row["skill_name"]))

    static_playlist_algorithms = static_playlist_activity_rows()
    static_playlist_slugs = {str(item["slug"]) for item in static_playlist_algorithms}
    algorithms = [*list(grouped.values()), *static_playlist_algorithms]
    slug_to_algorithm = {str(item["slug"]): str(item["algorithm"]) for item in algorithms}
    skills_by_algorithm_slug = {
        str(item["slug"]): [str(skill) for skill in item["skills"]]
        for item in algorithms
    }
    known_algorithm_slugs = set(slug_to_algorithm)
    known_pattern_slugs = known_algorithm_slugs
    slug_to_pattern = slug_to_algorithm
    methods_by_pattern_slug = skills_by_algorithm_slug
    card_ids_by_algorithm: dict[str, set[str]] = {slug: set() for slug in known_algorithm_slugs}
    review_card_ids_by_algorithm: dict[str, set[str]] = {slug: set() for slug in known_algorithm_slugs}

    card_ids_by_pattern: dict[str, set[str]] = {slug: set() for slug in known_pattern_slugs}
    for row in generated_rows:
        tags = [str(tag) for tag in (row["tags"] or [])]
        matched_algorithm_slugs = taxonomy.matched_algorithm_slugs(tags, known_algorithm_slugs)
        source_type = str(
            row.get("source_type")
            or ("static-playlist" if "static-playlist" in tags else "core-catalog")
        )
        row_algorithm_slug = str(row.get("algorithm_slug") or "")
        if source_type in {"core-catalog", "core-meta"}:
            inventory_algorithm_slugs = (
                [row_algorithm_slug]
                if row_algorithm_slug in known_algorithm_slugs
                else [slug for slug in matched_algorithm_slugs if slug not in static_playlist_slugs]
            )
        elif source_type == "static-playlist":
            inventory_algorithm_slugs = [slug for slug in matched_algorithm_slugs if slug in static_playlist_slugs]
        else:
            inventory_algorithm_slugs = []
        for slug in matched_algorithm_slugs:
            review_card_ids_by_algorithm.setdefault(slug, set()).add(str(row["id"]))
        for slug in inventory_algorithm_slugs:
            card_ids_by_algorithm.setdefault(slug, set()).add(str(row["id"]))
            card_ids_by_pattern.setdefault(slug, set()).add(str(row["id"]))

    attempts_by_card_mode: dict[tuple[str, str], list[AttemptOverviewItem]] = {}
    attempts_by_algorithm_mode: dict[tuple[str, str], list[AttemptOverviewItem]] = {}

    for row in attempt_rows:
        card_id = str(row["tracked_card_id"] or "").strip()
        if not card_id:
            continue
        category_tags = [str(tag) for tag in (row["category_tags"] or [])]
        if (
            _submission_modality(row) == "mcq"
            or str(row.get("question_type") or "").startswith("skill-map-mcq")
            or "skill-map-mcq" in category_tags
        ):
            continue
        template_mode = str(row["template_mode"] or "algorithm").strip() or "algorithm"
        support_layer = str(row["support_layer"] or "none")
        matched_algorithm_slugs = taxonomy.matched_algorithm_slugs(category_tags, known_algorithm_slugs)
        for slug in matched_algorithm_slugs:
            review_card_ids_by_algorithm.setdefault(slug, set()).add(card_id)

        stored_signals = coerce_json_object(row.get("signals"))
        attempt: AttemptOverviewItem = {
            "successful": bool(row["successful"]),
            "created_at": row["created_at"],
            "supportLayer": support_layer,
            "modality": _submission_modality(row),
            "liveCoachUsed": bool(row["live_coach_used"]),
            "signals": {
                "evaluation": compact_evaluation(stored_signals.get("evaluation")),
            },
        }
        attempts_by_card_mode.setdefault((card_id, template_mode), []).append(attempt)
        for slug in matched_algorithm_slugs:
            attempts_by_algorithm_mode.setdefault((slug, template_mode), []).append(attempt)

    algorithm_summaries: list[SkillMapAlgorithmSummary] = []

    for algorithm in algorithms:
        slug = str(algorithm["slug"])
        algorithm_card_ids = card_ids_by_algorithm.get(slug, set())
        algorithm_review_card_ids = review_card_ids_by_algorithm.get(slug, set())
        mode_summaries: dict[str, SkillMapModeSummary] = {}
        practiced_cards_any_mode: set[str] = set()
        stale_cards_any_mode: set[str] = set()
        overall_attempt_count = 0
        overall_ghost_rep_count = 0
        overall_unsupported_attempt_count = 0

        for template_mode in READINESS_MODE_ORDER:
            algorithm_mode_attempts = attempts_by_algorithm_mode.get((slug, template_mode), [])
            readiness_summary = summarize_readiness(algorithm_mode_attempts)
            mode_support_counts = _build_support_counts(algorithm_mode_attempts)
            practiced_card_ids = {
                card_id for card_id in algorithm_card_ids if attempts_by_card_mode.get((card_id, template_mode))
            }
            reviewed_card_ids = {
                card_id for card_id in algorithm_review_card_ids if attempts_by_card_mode.get((card_id, template_mode))
            }
            stale_card_count = 0
            for card_id in reviewed_card_ids:
                card_attempts = attempts_by_card_mode.get((card_id, template_mode), [])
                card_readiness = summarize_readiness(card_attempts)
                if card_id in practiced_card_ids and card_readiness["stale"]:
                    stale_card_count += 1
                    stale_cards_any_mode.add(card_id)
            practiced_cards_any_mode.update(practiced_card_ids)
            mode_summaries[template_mode] = {
                **readiness_summary,
                **mode_support_counts,
                "totalCards": len(algorithm_card_ids),
                "practicedCards": len(practiced_card_ids),
                "untouchedCards": max(len(algorithm_card_ids) - len(practiced_card_ids), 0),
                "staleCards": stale_card_count,
                "dimensionSummary": summarize_submission_rubrics(algorithm_mode_attempts),
                "activity": _build_mode_activity(algorithm_mode_attempts),
            }
            overall_attempt_count += int(readiness_summary["attemptCount"])
            overall_ghost_rep_count += int(mode_support_counts["ghostRepCount"])
            overall_unsupported_attempt_count += int(mode_support_counts["unsupportedAttemptCount"])

        overall_readiness = round(
            sum(float(mode_summaries[mode]["readiness"]) for mode in READINESS_MODE_ORDER) / len(READINESS_MODE_ORDER),
            1,
        )
        algorithm_summaries.append({
            "algorithm": algorithm["algorithm"],
            "slug": slug,
            "skills": algorithm["skills"],
            "overallReadiness": overall_readiness,
            "overallAttemptCount": overall_attempt_count,
            "ghostRepCount": overall_ghost_rep_count,
            "unsupportedAttemptCount": overall_unsupported_attempt_count,
            "workCount": overall_attempt_count,
            "totalCards": len(algorithm_card_ids),
            "practicedCards": len(practiced_cards_any_mode),
            "untouchedCards": max(len(algorithm_card_ids) - len(practiced_cards_any_mode), 0),
            "staleCards": len(stale_cards_any_mode),
            "dimensionSummary": summarize_submission_rubrics([
                item
                for template_mode in READINESS_MODE_ORDER
                for item in attempts_by_algorithm_mode.get((slug, template_mode), [])
            ]),
            "modes": mode_summaries,
        })

    return {
        "algorithms": algorithm_summaries,
        "ghostRepActivity": _build_ghost_rep_activity(
            attempt_rows,
            slug_to_pattern,
            methods_by_pattern_slug,
            {slug: len(card_ids_by_pattern.get(slug, set())) for slug in known_pattern_slugs},
            {str(item["slug"]) for item in static_playlist_algorithms},
            window_days=history_days,
            tz=history_tz,
        ),
    }


def build_skill_map_nodes(algorithm_rows: list[AlgorithmSkillRow]) -> list[SkillMapNode]:
    grouped: dict[int, SkillMapNode] = {}
    for row in algorithm_rows:
        algorithm_id = int(row["algorithm_id"])
        algorithm_name = str(row["algorithm_name"])
        skill_name = row.get("skill_name")

        if algorithm_id not in grouped:
            grouped[algorithm_id] = SkillMapNode(algorithm=algorithm_name, skills=[])

        if skill_name:
            grouped[algorithm_id].skills.append(str(skill_name))

    return list(grouped.values())


async def create_attempt(
    body: AttemptCreate,
    *,
    successful: bool,
    evaluation: Evaluation,
    record: SubmissionRecord | None = None,
) -> AttemptSaveResult:
    now = datetime.now(tz=timezone.utc)
    modality = body.resolved_modality().value
    signals = _submission_signals(body, modality=modality, evaluation=evaluation)
    row = await insert_submission_attempt_row(
        session_id=body.resolved_session_id(),
        card_id=body.cardId,
        card_title=body.cardTitle,
        question=body.question,
        question_type=body.questionType,
        category_tags=body.categoryTags,
        correct_answer=record.correct_answer if record else body.correctAnswer,
        user_answer=record.user_answer if record else body.userAnswer,
        multiple_choice_problem_id=record.multiple_choice_problem_id if record else None,
        mode=body.mode.value,
        successful=successful,
        signals_json=_json.dumps({key: value for key, value in signals.items() if value is not None}),
        interaction_id=body.interactionId,
        generated_card_id=body.generatedCardId,
        generated_card_json=_json.dumps(body.generatedCard) if body.generatedCard else None,
        template_mode=body.templateMode.value,
        support_layer=body.supportLayer.value,
        live_coach_used=body.liveCoachUsed,
        modality=modality,
        target_source=body.targetSource,
        target_control=body.targetControl,
        format_control=body.formatControl,
        created_at=now,
        updated_at=now,
    )

    return {"saved": True, "attemptId": row["id"] if row else None}


async def get_skill_map() -> list[SkillMapNode]:
    rows = await fetch_algorithms_with_skills_rows()

    return build_skill_map_nodes(rows)


async def get_skill_map_overview(history_days: int | None = 42, timezone_name: str | None = None) -> SkillMapOverviewPayload:
    """``history_days`` sizes the daily activity window (None = all time); days follow ``timezone_name``."""
    algorithm_rows = await fetch_skill_map_overview_algorithm_rows()
    generated_rows = await fetch_skill_map_overview_generated_rows()
    attempt_rows = await fetch_skill_map_overview_attempt_rows()
    return build_skill_map_overview(
        algorithm_rows,
        generated_rows,
        attempt_rows,
        history_days=history_days,
        history_tz=resolve_timezone(timezone_name),
    )


def _history_day_choices(row: dict[str, Any]) -> list[dict[str, Any]]:
    correct = str(row.get("multiple_choice_correct_answer_label") or "")
    return [
        {"id": label, "text": text, "correct": label == correct}
        for index in range(1, 5)
        if (label := str(row.get(f"multiple_choice_answer_label_{index}") or ""))
        and (text := str(row.get(f"multiple_choice_answer_text_{index}") or ""))
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
        created_at = _coerce_utc_datetime(row["created_at"])
        submissions.append({
            "id": int(row["id"]),
            "createdAt": created_at.isoformat() if created_at else "",
            "modality": _submission_modality(row),
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
        key=lambda row: _coerce_utc_datetime(row["created_at"]) or datetime.min.replace(tzinfo=timezone.utc),
    )
    labels: dict[str, str] = {}
    counts: Counter[str] = Counter()
    points: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        created_at = _coerce_utc_datetime(row["created_at"])
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
                "modality": _submission_modality(row),
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
