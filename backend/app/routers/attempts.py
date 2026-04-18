from __future__ import annotations

import json as _json
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter

from app.database import get_pool
from app.models import AttemptCreate, SkillMapNode, SkillMapOverviewResponse
from app.readiness import READINESS_MODE_ORDER, summarize_readiness
from app.submission_rubric import compact_submission_rubric, summarize_submission_rubrics

router = APIRouter(prefix="/api", tags=["attempts"])


@router.post("/attempts", status_code=201)
async def create_attempt(body: AttemptCreate):
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)
    submission_rubric = compact_submission_rubric(
        body.submissionRubric
        or (body.coachFeedback or {}).get("submissionRubric")
    )

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO score_attempts
                (card_id, card_title, question, question_type, category_tags,
                 correct_answer, user_answer, mode, correct, accuracy, exact, elapsed_ms,
                 interaction_id, generated_card_id, generated_card, template_mode,
                 support_layer, live_coach_used, coach_feedback, submission_rubric, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
            RETURNING id
            """,
            body.cardId,
            body.cardTitle,
            body.question,
            body.questionType,
            body.categoryTags,
            body.correctAnswer,
            body.userAnswer,
            body.mode.value,
            body.correct,
            body.accuracy,
            body.exact,
            body.elapsedMs,
            body.interactionId,
            body.generatedCardId,
            _json.dumps(body.generatedCard) if body.generatedCard else None,
            body.templateMode.value,
            body.supportLayer.value,
            body.liveCoachUsed,
            _json.dumps(body.coachFeedback) if body.coachFeedback else None,
            _json.dumps(submission_rubric) if submission_rubric else None,
            now,
            now,
        )

    return {"saved": True, "attemptId": row["id"] if row else None}


@router.get("/skill-map", response_model=list[SkillMapNode])
async def get_skill_map():
    pool = get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                p.id AS pattern_id,
                p.name AS pattern_name,
                m.id AS method_id,
                m.name AS method_name
            FROM patterns p
            LEFT JOIN methods m ON m.pattern_id = p.id
            ORDER BY p.id ASC, m.id ASC
            """
        )

    grouped: dict[int, SkillMapNode] = {}
    for row in rows:
        pattern_id = int(row["pattern_id"])
        pattern_name = str(row["pattern_name"])
        method_name = row["method_name"]

        if pattern_id not in grouped:
            grouped[pattern_id] = SkillMapNode(pattern=pattern_name, methods=[])

        if method_name:
            grouped[pattern_id].methods.append(str(method_name))

    return list(grouped.values())


def _pattern_slug(pattern: str) -> str:
    return (
        pattern.lower()
        .replace("/", " ")
        .replace("&", " ")
        .replace("-", " ")
        .strip()
        .replace("  ", " ")
        .replace(" ", "-")
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


def _build_mode_activity(attempts: list[dict[str, Any]]) -> dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    window_start, window_end = _aligned_activity_window(today)
    counts_by_date: Counter[str] = Counter()

    for attempt in attempts:
        created_at = _coerce_utc_datetime(attempt.get("created_at") or attempt.get("createdAt"))
        if created_at is None:
            continue
        counts_by_date[created_at.date().isoformat()] += 1

    days: list[dict[str, Any]] = []
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
        days.append({
            "date": iso_date,
            "count": count,
            "inFuture": cursor > today,
        })
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


def _build_support_counts(attempts: list[dict[str, Any]]) -> dict[str, int]:
    ghost_rep_count = sum(1 for attempt in attempts if str(attempt.get("supportLayer", "none")) == "ghost-reps")
    unsupported_attempt_count = len(attempts) - ghost_rep_count
    return {
        "ghostRepCount": ghost_rep_count,
        "unsupportedAttemptCount": unsupported_attempt_count,
        "workCount": len(attempts),
    }


@router.get("/skill-map-overview", response_model=SkillMapOverviewResponse)
async def get_skill_map_overview():
    pool = get_pool()

    async with pool.acquire() as conn:
        pattern_rows = await conn.fetch(
            """
            SELECT
                p.id AS pattern_id,
                p.name AS pattern_name,
                m.name AS method_name
            FROM patterns p
            LEFT JOIN methods m ON m.pattern_id = p.id
            ORDER BY p.id ASC, m.id ASC
            """
        )
        generated_rows = await conn.fetch(
            """
            SELECT id, title, tags
            FROM generated_skill_map_cards
            WHERE question_type LIKE 'skill-map%'
            ORDER BY created_at DESC
            """
        )
        attempt_rows = await conn.fetch(
            """
            SELECT
                COALESCE(sa.generated_card_id, sa.card_id) AS tracked_card_id,
                COALESCE(sa.card_title, '') AS card_title,
                sa.category_tags AS category_tags,
                sa.accuracy,
                sa.created_at,
                sa.template_mode,
                sa.support_layer,
                sa.live_coach_used,
                sa.submission_rubric
            FROM score_attempts sa
            WHERE sa.mode = 'main-recall'
              AND sa.question_type LIKE 'skill-map%'
            ORDER BY sa.created_at DESC
            """
        )

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
    known_pattern_slugs = set(slug_to_pattern)

    generated_cards: dict[str, dict[str, Any]] = {}
    card_ids_by_pattern: dict[str, set[str]] = {slug: set() for slug in known_pattern_slugs}
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

    attempts_by_card_mode: dict[tuple[str, str], list[dict[str, Any]]] = {}
    attempts_by_pattern_mode: dict[tuple[str, str], list[dict[str, Any]]] = {}
    attempted_card_ids: set[str] = set()
    total_ghost_rep_count = 0
    total_unsupported_attempt_count = 0

    for row in attempt_rows:
        card_id = str(row["tracked_card_id"] or "").strip()
        if not card_id:
            continue
        template_mode = str(row["template_mode"] or "algorithm").strip() or "algorithm"
        support_layer = str(row["support_layer"] or "none")
        if support_layer == "ghost-reps":
            total_ghost_rep_count += 1
        else:
            total_unsupported_attempt_count += 1
        category_tags = [str(tag) for tag in (row["category_tags"] or [])]
        matched_pattern_slugs = [tag for tag in category_tags if tag in known_pattern_slugs]

        if card_id not in generated_cards:
            generated_cards[card_id] = {
                "cardId": card_id,
                "title": str(row["card_title"] or card_id),
                "patternSlugs": matched_pattern_slugs,
            }
        for slug in matched_pattern_slugs:
            card_ids_by_pattern.setdefault(slug, set()).add(card_id)

        attempt = {
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

    pattern_summaries: list[dict[str, Any]] = []
    card_mode_summaries: dict[tuple[str, str], dict[str, Any]] = {}

    for pattern in patterns:
        slug = str(pattern["slug"])
        pattern_card_ids = card_ids_by_pattern.get(slug, set())
        mode_summaries: dict[str, Any] = {}
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
                    "dimensionSummary": summarize_submission_rubrics(
                        card_attempts
                    ),
                }

            practiced_cards_any_mode.update(practiced_card_ids)
            mode_summaries[template_mode] = {
                **readiness_summary,
                **mode_support_counts,
                "totalCards": len(pattern_card_ids),
                "practicedCards": len(practiced_card_ids),
                "untouchedCards": max(len(pattern_card_ids) - len(practiced_card_ids), 0),
                "staleCards": stale_card_count,
                "dimensionSummary": summarize_submission_rubrics(
                    pattern_mode_attempts
                ),
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

    review_queue = [
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

    return {
        "summary": {
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
        },
        "patterns": pattern_summaries,
        "reviewQueue": review_queue,
    }
