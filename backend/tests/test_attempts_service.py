from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.attempts_service import build_skill_map_overview


def test_skill_map_overview_groups_ghost_reps_by_day_and_pattern() -> None:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=12, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    five_days_ago = today - timedelta(days=5)

    overview = build_skill_map_overview(
        pattern_rows=[
            {"pattern_id": 1, "pattern_name": "Sliding Window", "method_name": "valid window rule"},
            {"pattern_id": 2, "pattern_name": "Binary Search", "method_name": "left / right bounds"},
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
                "created_at": five_days_ago,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "submission_rubric": {},
            },
            {
                "tracked_card_id": "bs-1",
                "card_title": "Search",
                "category_tags": ["skill-map", "binary-search"],
                "accuracy": 90,
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
        {"pattern": "Binary Search", "slug": "binary-search", "workType": "multiple-choice", "count": 1}
    ]
    assert yesterday_bucket["segments"] == [
        {"pattern": "Binary Search", "slug": "binary-search", "workType": "ghost-reps", "count": 1}
    ]
    assert pattern_freshness["sliding-window"]["daysSinceLastGhostRep"] == 5
    assert pattern_freshness["binary-search"]["daysSinceLastGhostRep"] == 1
    assert pattern_freshness["binary-search"]["daysSinceLastPractice"] == 0
    assert overview["summary"]["workCount"] == 3
