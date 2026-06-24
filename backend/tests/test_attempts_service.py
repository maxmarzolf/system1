from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from app.models import AttemptCreate
from app.services import attempts_service
from app.services.attempts_service import build_skill_map_overview


def test_create_attempt_forwards_mcq_evidence_and_misconceptions(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def _insert(**kwargs):
        captured.update(kwargs)
        return {"id": 91}

    monkeypatch.setattr(attempts_service, "insert_answer_attempt_row", _insert)
    body = AttemptCreate.model_validate({
        "cardId": "mcq-1",
        "mode": "main-recall",
        "correct": False,
        "activityFormat": "multiple-choice",
        "targetSource": "skill-map",
        "targetControl": "user",
        "formatControl": "user",
        "mcqDetail": {
            "selectedChoiceLabel": "B",
            "correctChoiceLabel": "C",
            "reasoning": "The state only needs the current value.",
        },
        "skillEvidence": [{
            "patternSlug": "dynamic-programming",
            "skillSlug": "state-definition",
            "evidenceScore": 0,
            "confidence": 0.95,
            "evidenceSource": "mcq-with-reasoning",
        }],
        "misconceptionSignals": [{
            "patternSlug": "dynamic-programming",
            "skillSlug": "state-definition",
            "misconceptionTag": "insufficient-state",
            "evaluatorNote": "Tracks too little history.",
            "confidence": 0.9,
            "detectedBy": "reasoning-evaluator",
        }],
    })

    result = asyncio.run(attempts_service.create_attempt(body))

    assert result == {"saved": True, "attemptId": 91}
    assert captured["activity_format"] == "multiple-choice"
    assert captured["target_source"] == "skill-map"
    assert captured["mcq_detail"] == {
        "selectedChoiceLabel": "B",
        "correctChoiceLabel": "C",
        "reasoning": "The state only needs the current value.",
        "reasoningQuality": None,
        "reasoningEvaluation": None,
    }
    assert captured["skill_evidence"] == [{
        "patternSlug": "dynamic-programming",
        "skillSlug": "state-definition",
        "evidenceScore": 0.0,
        "confidence": 0.95,
        "evidenceSource": "mcq-with-reasoning",
    }]
    assert captured["misconception_signals"][0]["misconceptionTag"] == "insufficient-state"


def test_skill_map_overview_groups_ghost_reps_by_day_and_pattern() -> None:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=12, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    five_days_ago = today - timedelta(days=5)

    overview = build_skill_map_overview(
        pattern_rows=[
            {"pattern_id": 1, "pattern_name": "Sliding Window", "method_name": "valid window rule"},
            {"pattern_id": 2, "pattern_name": "Binary Search", "method_name": "left / right bounds"},
            {"pattern_id": 2, "pattern_name": "Binary Search", "method_name": "search on answer"},
        ],
        generated_rows=[
            {"id": "sw-1", "title": "Window", "tags": ["skill-map", "sliding-window"]},
            {"id": "bs-1", "title": "Search", "tags": ["skill-map", "binary-search"]},
        ],
        attempt_rows=[
            {
                "tracked_card_id": "sw-1",
                "card_title": "Window",
                "category_tags": ["skill-map", "sliding-window"],
                "accuracy": 95,
                "exact": False,
                "created_at": five_days_ago,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "submission_rubric": {},
            },
            {
                "tracked_card_id": "bs-1",
                "card_title": "Search",
                "category_tags": ["skill-map", "binary-search", "left-right-bounds"],
                "accuracy": 90,
                "exact": False,
                "created_at": yesterday,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "submission_rubric": {},
            },
            {
                "tracked_card_id": "bs-1",
                "card_title": "Search",
                "category_tags": ["skill-map", "binary-search"],
                "accuracy": 70,
                "exact": False,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "none",
                "live_coach_used": False,
                "submission_rubric": {},
            },
            {
                "tracked_card_id": "bs-mcq-1",
                "card_title": "Binary Search MCQ",
                "category_tags": ["skill-map", "skill-map-mcq", "binary-search"],
                "accuracy": 100,
                "exact": True,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "none",
                "live_coach_used": False,
                "submission_rubric": {},
            },
        ],
    )

    activity = overview["ghostRepActivity"]
    today_bucket = next(day for day in activity["days"] if day["date"] == today.date().isoformat())
    yesterday_bucket = next(day for day in activity["days"] if day["date"] == yesterday.date().isoformat())
    pattern_freshness = {item["slug"]: item for item in activity["patterns"]}

    assert activity["totalGhostReps"] == 2
    assert activity["totalMultipleChoice"] == 1
    assert activity["workCount"] == 3
    assert today_bucket["ghostRepCount"] == 0
    assert today_bucket["multipleChoiceCount"] == 1
    assert today_bucket["segments"] == [
        {
            "pattern": "Binary Search",
            "slug": "binary-search",
            "workType": "multiple-choice",
            "count": 1,
            "methods": [{"method": "Unclassified", "slug": "unclassified", "count": 1}],
        }
    ]
    assert yesterday_bucket["segments"] == [
        {
            "pattern": "Binary Search",
            "slug": "binary-search",
            "workType": "ghost-reps",
            "count": 1,
            "methods": [{"method": "left / right bounds", "slug": "left-right-bounds", "count": 1}],
        }
    ]
    assert pattern_freshness["sliding-window"]["daysSinceLastGhostRep"] == 5
    assert pattern_freshness["binary-search"]["daysSinceLastGhostRep"] == 1
    assert pattern_freshness["binary-search"]["daysSinceLastPractice"] == 0
    assert overview["summary"]["workCount"] == 3


def test_spaced_repetition_schedules_group_1a_after_clean_completion() -> None:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=12, minute=0, second=0, microsecond=0)
    tomorrow = (today + timedelta(days=1)).date().isoformat()

    overview = build_skill_map_overview(
        pattern_rows=[
            {"pattern_id": 1, "pattern_name": "Prefix Sums", "method_name": "running total setup"},
            {"pattern_id": 2, "pattern_name": "Two Pointers", "method_name": "opposing pointers"},
            {"pattern_id": 3, "pattern_name": "Sliding Window", "method_name": "valid window rule"},
        ],
        generated_rows=[
            {"id": "ps-1", "title": "Prefix", "tags": ["skill-map", "prefix-sums"]},
            {"id": "tp-1", "title": "Pointers", "tags": ["skill-map", "two-pointers"]},
            {"id": "sw-1", "title": "Window", "tags": ["skill-map", "sliding-window"]},
        ],
        attempt_rows=[
            {
                "tracked_card_id": "ps-1",
                "card_title": "Prefix",
                "category_tags": ["skill-map", "prefix-sums"],
                "accuracy": 100,
                "exact": True,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "submission_rubric": {},
            },
            {
                "tracked_card_id": "tp-1",
                "card_title": "Pointers",
                "category_tags": ["skill-map", "two-pointers"],
                "accuracy": 100,
                "exact": True,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "submission_rubric": {},
            },
            {
                "tracked_card_id": "sw-1",
                "card_title": "Window",
                "category_tags": ["skill-map", "sliding-window"],
                "accuracy": 100,
                "exact": True,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "submission_rubric": {},
            },
        ],
    )

    spaced_repetition = overview["spacedRepetition"]
    group_1a = next(packet for packet in spaced_repetition["packets"] if packet["id"] == "group-1a")

    assert group_1a["status"] == "scheduled"
    assert group_1a["completedSessions"] == 1
    assert group_1a["lastCompletedAt"] == today.date().isoformat()
    assert group_1a["nextDueAt"] == tomorrow
    assert group_1a["coreAlgorithmCount"] == 3
    assert {family["slug"] for family in group_1a["families"]} == {
        "prefix-sums",
        "two-pointers",
        "sliding-window",
    }
    assert not spaced_repetition["queue"]
