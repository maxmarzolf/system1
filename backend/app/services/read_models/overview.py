"""The daily work grid (Journey): work per algorithm per day, and the skill map."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone, tzinfo

from app.core import taxonomy
from app.core.static_playlists import static_playlist_activity_rows
from app.models import SkillMapNode
from app.repositories.attempts_repository import (
    fetch_algorithms_with_skills_rows,
    fetch_skill_map_overview_algorithm_rows,
    fetch_skill_map_overview_attempt_rows,
)
from app.repositories.types import (
    AlgorithmSkillRow,
    SkillMapOverviewAlgorithmRow,
    SkillMapOverviewAttemptRow,
)
from app.services.contracts import (
    SkillMapGhostRepActivity,
    SkillMapGhostRepActivityDay,
    SkillMapOverviewPayload,
)
from app.services.read_models.common import coerce_utc_datetime, resolve_timezone, submission_modality


def _build_ghost_rep_activity(
    attempt_rows: list[SkillMapOverviewAttemptRow],
    slug_to_pattern: dict[str, str],
    methods_by_pattern_slug: dict[str, list[str]],
    window_days: int | None = 42,
    tz: tzinfo = timezone.utc,
) -> SkillMapGhostRepActivity:
    """Daily work per algorithm for the last ``window_days`` calendar days in ``tz``, or since the first
    attempt when None. Each answer counts once, toward its first tagged algorithm (as in Competency)."""
    today = datetime.now(tz).date()
    if window_days is None:
        attempt_dates = [
            created_at.astimezone(tz).date()
            for row in attempt_rows
            if (created_at := coerce_utc_datetime(row["created_at"])) is not None
        ]
        window_start = min([*attempt_dates, today])
    else:
        window_start = today - timedelta(days=max(window_days - 1, 0))
    slug_to_algorithm = slug_to_pattern
    skills_by_algorithm_slug = methods_by_pattern_slug
    known_algorithm_slugs = set(slug_to_algorithm)
    counts_by_day_type_algorithm: dict[str, Counter[tuple[str, str]]] = {}
    skill_counts_by_day_type_algorithm: dict[tuple[str, str, str], Counter[str]] = {}
    perfect_recall_counts_in_window: Counter[str] = Counter()

    for row in attempt_rows:
        created_at = coerce_utc_datetime(row["created_at"])
        if created_at is None:
            continue
        category_tags = [str(tag) for tag in (row["category_tags"] or [])]
        modality = submission_modality(row)
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
        primary = taxonomy.primary_algorithm_slug(category_tags, known_algorithm_slugs)
        if primary is None:
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
        if attempt_date < window_start:
            continue
        matched_skill_slugs = [
            taxonomy.algorithm_slug(skill)
            for skill in skills_by_algorithm_slug.get(primary, [])
            if taxonomy.algorithm_slug(skill) in category_tags
        ]
        skill_slug = matched_skill_slugs[0] if matched_skill_slugs else "unclassified"
        counts_by_day_type_algorithm.setdefault(iso_date, Counter())[(work_type, primary)] += 1
        skill_counts_by_day_type_algorithm.setdefault((iso_date, work_type, primary), Counter())[skill_slug] += 1
        if is_total_recall and bool(row.get("successful")):
            perfect_recall_counts_in_window[iso_date] += 1

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
    }


def build_skill_map_overview(
    algorithm_rows: list[SkillMapOverviewAlgorithmRow],
    attempt_rows: list[SkillMapOverviewAttemptRow],
    history_days: int | None = 42,
    history_tz: tzinfo = timezone.utc,
) -> SkillMapOverviewPayload:
    """The grid's algorithms (catalog order, then static playlists) and its daily work."""
    names: dict[str, str] = {}
    skills: dict[str, list[str]] = {}
    for row in algorithm_rows:
        name = str(row["algorithm_name"])
        slug = str(row.get("algorithm_slug") or taxonomy.algorithm_slug(name))
        names.setdefault(slug, name)
        if row["skill_name"]:
            skills.setdefault(slug, []).append(str(row["skill_name"]))
    static_playlists = static_playlist_activity_rows()
    for item in static_playlists:
        names[str(item["slug"])] = str(item["algorithm"])
        skills[str(item["slug"])] = [str(skill) for skill in item["skills"]]
    return {
        "algorithms": [{"algorithm": name, "slug": slug} for slug, name in names.items()],
        "ghostRepActivity": _build_ghost_rep_activity(
            attempt_rows,
            names,
            skills,
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


async def get_skill_map() -> list[SkillMapNode]:
    rows = await fetch_algorithms_with_skills_rows()

    return build_skill_map_nodes(rows)


async def get_skill_map_overview(history_days: int | None = 42, timezone_name: str | None = None) -> SkillMapOverviewPayload:
    """``history_days`` sizes the daily activity window (None = all time); days follow ``timezone_name``."""
    algorithm_rows = await fetch_skill_map_overview_algorithm_rows()
    attempt_rows = await fetch_skill_map_overview_attempt_rows()
    return build_skill_map_overview(
        algorithm_rows,
        attempt_rows,
        history_days=history_days,
        history_tz=resolve_timezone(timezone_name),
    )
