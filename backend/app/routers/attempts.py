from __future__ import annotations

import json as _json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.database import get_pool
from app.models import AttemptCreate, SkillMapNode, SkillMapOverviewResponse
from app.readiness import READINESS_MODE_ORDER, summarize_readiness

router = APIRouter(prefix="/api", tags=["attempts"])


@router.post("/attempts", status_code=201)
async def create_attempt(body: AttemptCreate):
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO score_attempts
                (card_id, card_title, question, question_type, category_tags, options,
                 correct_answer, user_answer, mode, correct, accuracy, exact, elapsed_ms,
                 interaction_id, generated_card_id, generated_card, template_mode, hint_used,
                 live_coach_used, coach_feedback, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
            RETURNING id
            """,
            body.cardId,
            body.cardTitle,
            body.question,
            body.questionType,
            body.categoryTags,
            _json.dumps(body.options) if body.options else None,
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
            body.hintUsed,
            body.liveCoachUsed,
            _json.dumps(body.coachFeedback) if body.coachFeedback else None,
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
            WHERE question_type = 'skill-map'
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
                sa.hint_used,
                sa.live_coach_used
            FROM score_attempts sa
            WHERE sa.mode = 'main-recall'
              AND sa.question_type = 'skill-map'
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

    for row in attempt_rows:
        card_id = str(row["tracked_card_id"] or "").strip()
        if not card_id:
            continue
        template_mode = str(row["template_mode"] or "full").strip() or "full"
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
            "hintUsed": bool(row["hint_used"]),
            "liveCoachUsed": bool(row["live_coach_used"]),
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

        for template_mode in READINESS_MODE_ORDER:
            readiness_summary = summarize_readiness(attempts_by_pattern_mode.get((slug, template_mode), []))
            practiced_card_ids = {
                card_id for card_id in pattern_card_ids if attempts_by_card_mode.get((card_id, template_mode))
            }
            stale_card_count = 0
            for card_id in practiced_card_ids:
                card_readiness = summarize_readiness(attempts_by_card_mode.get((card_id, template_mode), []))
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
                    "daysSinceLastSubmit": card_readiness["daysSinceLastSubmit"],
                    "stale": card_readiness["stale"],
                }

            practiced_cards_any_mode.update(practiced_card_ids)
            mode_summaries[template_mode] = {
                **readiness_summary,
                "totalCards": len(pattern_card_ids),
                "practicedCards": len(practiced_card_ids),
                "untouchedCards": max(len(pattern_card_ids) - len(practiced_card_ids), 0),
                "staleCards": stale_card_count,
            }
            overall_attempt_count += int(readiness_summary["attemptCount"])

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
            "totalCards": len(pattern_card_ids),
            "practicedCards": len(practiced_cards_any_mode),
            "untouchedCards": max(len(pattern_card_ids) - len(practiced_cards_any_mode), 0),
            "staleCards": len(stale_cards_any_mode),
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
