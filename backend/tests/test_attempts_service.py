from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from app.models import AttemptCreate
from app.services import attempts_service
from app.services.attempts_service import build_skill_map_overview


def test_create_attempt_forwards_multiple_choice_metadata(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def _insert(**kwargs):
        captured.update(kwargs)
        return {"id": 91}

    monkeypatch.setattr(attempts_service, "insert_submission_attempt_row", _insert)
    body = AttemptCreate.model_validate({
        "cardId": "mcq-1",
        "mode": "main-recall",
        "elapsedMs": 875,
        "activityFormat": "multiple-choice",
        "targetSource": "skill-map",
        "targetControl": "user",
        "formatControl": "user",
    })

    evaluation = {"version": 1, "verdict": "needs-work"}
    result = asyncio.run(attempts_service.create_attempt(body, successful=False, evaluation=evaluation))

    assert result == {"saved": True, "attemptId": 91}
    assert captured["activity_format"] == "multiple-choice"
    assert captured["target_source"] == "skill-map"
    assert captured["signals_json"] == '{"elapsed_ms": 875, "evaluation": {"version": 1, "verdict": "needs-work"}}'


def test_skill_map_overview_groups_ghost_reps_by_day_and_pattern() -> None:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=12, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    five_days_ago = today - timedelta(days=5)

    overview = build_skill_map_overview(
        algorithm_rows=[
            {"algorithm_id": 1, "algorithm_name": "Sliding Window", "skill_name": "valid window rule"},
            {"algorithm_id": 2, "algorithm_name": "Binary Search", "skill_name": "left / right bounds"},
            {"algorithm_id": 2, "algorithm_name": "Binary Search", "skill_name": "search on answer"},
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
                "successful": True,
                "created_at": five_days_ago,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "signals": {},
            },
            {
                "tracked_card_id": "bs-1",
                "card_title": "Search",
                "category_tags": ["skill-map", "binary-search", "left-right-bounds"],
                "successful": True,
                "created_at": yesterday,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "signals": {},
            },
            {
                "tracked_card_id": "bs-1",
                "card_title": "Search",
                "category_tags": ["skill-map", "binary-search"],
                "successful": False,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "none",
                "live_coach_used": False,
                "signals": {},
            },
            {
                "tracked_card_id": "bs-mcq-1",
                "card_title": "Binary Search MCQ",
                "category_tags": ["skill-map", "binary-search"],
                "successful": True,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "none",
                "activity_format": "multiple-choice",
                "live_coach_used": False,
                "signals": {},
            },
            {
                "tracked_card_id": "sw-1",
                "card_title": "Window",
                "category_tags": ["skill-map", "sliding-window", "fixed-vs-variable-window"],
                "successful": True,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "none",
                "activity_format": "recall",
                "live_coach_used": False,
                "signals": {},
            },
        ],
    )

    activity = overview["ghostRepActivity"]
    today_bucket = next(day for day in activity["days"] if day["date"] == today.date().isoformat())
    yesterday_bucket = next(day for day in activity["days"] if day["date"] == yesterday.date().isoformat())
    pattern_freshness = {item["slug"]: item for item in activity["algorithms"]}

    assert activity["totalGhostReps"] == 2
    assert activity["totalMultipleChoice"] == 1
    assert activity["totalPerfectRecalls"] == 1
    assert activity["workCount"] == 4
    assert today_bucket["ghostRepCount"] == 0
    assert today_bucket["multipleChoiceCount"] == 1
    assert today_bucket["totalRecallCount"] == 1
    assert today_bucket["segments"] == [
        {
            "algorithm": "Binary Search",
            "slug": "binary-search",
            "workType": "multiple-choice",
            "count": 1,
            "skills": [{"skill": "Unclassified", "slug": "unclassified", "count": 1}],
        },
        {
            "algorithm": "Sliding Window",
            "slug": "sliding-window",
            "workType": "total-recall",
            "count": 1,
            "skills": [{"skill": "Unclassified", "slug": "unclassified", "count": 1}],
        },
    ]
    assert yesterday_bucket["segments"] == [
        {
            "algorithm": "Binary Search",
            "slug": "binary-search",
            "workType": "ghost-reps",
            "count": 1,
            "skills": [{"skill": "left / right bounds", "slug": "left-right-bounds", "count": 1}],
        }
    ]
    assert pattern_freshness["sliding-window"]["daysSinceLastGhostRep"] == 5
    assert pattern_freshness["binary-search"]["daysSinceLastGhostRep"] == 1
    assert pattern_freshness["binary-search"]["daysSinceLastPractice"] == 0
    assert overview["summary"]["workCount"] == 4


def test_skill_map_overview_counts_static_catalog_cards() -> None:
    now = datetime.now(timezone.utc)

    overview = build_skill_map_overview(
        algorithm_rows=[
            {"algorithm_id": 1, "algorithm_name": "Arrays / Hash Maps", "skill_name": None},
            {"algorithm_id": 2, "algorithm_name": "Sliding Window", "skill_name": "valid window rule"},
        ],
        generated_rows=[
            {"id": "playlist-google-1-two-sum", "title": "1. Two Sum", "tags": ["skill-map", "static-playlist", "google", "arrays-hash-maps"]},
            {"id": "playlist-google-3-longest-substring-without-repeating-characters", "title": "3. Longest Substring Without Repeating Characters", "tags": ["skill-map", "static-playlist", "google", "sliding-window", "valid-window-rule"]},
            {"id": "playlist-google-skeletons-bfs-skeleton", "title": "BFS Skeleton", "tags": ["skill-map", "static-playlist", "google-skeletons", "graphs", "bfs-skeleton"]},
        ],
        attempt_rows=[
            {
                "tracked_card_id": "playlist-google-1-two-sum",
                "card_title": "1. Two Sum",
                "category_tags": ["skill-map", "static-playlist", "google", "arrays-hash-maps"],
                "question_type": "playlist:google:algorithm",
                "successful": True,
                "created_at": now,
                "template_mode": "algorithm",
                "support_layer": "none",
                "activity_format": "recall",
                "live_coach_used": False,
                "signals": {},
            },
            {
                "tracked_card_id": "playlist-google-skeletons-bfs-skeleton",
                "card_title": "BFS Skeleton",
                "category_tags": ["skill-map", "static-playlist", "google-skeletons", "graphs", "bfs-skeleton"],
                "question_type": "playlist:google-skeletons:algorithm",
                "successful": True,
                "created_at": now,
                "template_mode": "algorithm",
                "support_layer": "none",
                "activity_format": "recall",
                "live_coach_used": False,
                "signals": {},
            }
        ],
    )

    arrays = next(item for item in overview["algorithms"] if item["slug"] == "arrays-hash-maps")
    sliding = next(item for item in overview["algorithms"] if item["slug"] == "sliding-window")
    google = next(item for item in overview["algorithms"] if item["slug"] == "google")
    google_skeletons = next(item for item in overview["algorithms"] if item["slug"] == "google-skeletons")

    assert arrays["totalCards"] == 1
    assert arrays["untouchedCards"] == 0
    assert arrays["overallAttemptCount"] == 1
    assert sliding["totalCards"] == 1
    assert sliding["untouchedCards"] == 1
    assert google["totalCards"] == 2
    assert google["overallAttemptCount"] == 1
    assert google_skeletons["totalCards"] == 1
    assert google_skeletons["overallAttemptCount"] == 1
    assert overview["summary"]["totalGeneratedCards"] == 3

    today_bucket = next(
        day for day in overview["ghostRepActivity"]["days"]
        if day["date"] == now.date().isoformat()
    )
    assert overview["ghostRepActivity"]["totalPerfectRecalls"] == 2
    assert today_bucket["totalRecallCount"] == 2
    assert today_bucket["total"] == 2
    assert [segment["slug"] for segment in today_bucket["segments"]] == [
        "google",
        "google-skeletons",
    ]
    google_activity = next(
        item for item in overview["ghostRepActivity"]["algorithms"]
        if item["slug"] == "google"
    )
    skeleton_activity = next(
        item for item in overview["ghostRepActivity"]["algorithms"]
        if item["slug"] == "google-skeletons"
    )
    assert google_activity["totalPerfectRecalls"] == 1
    assert google_activity["coreCardCount"] == 2
    assert skeleton_activity["totalPerfectRecalls"] == 1
    assert skeleton_activity["coreCardCount"] == 1


def test_spaced_repetition_schedules_algorithm_and_method_tracks_after_ghost_reps() -> None:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=12, minute=0, second=0, microsecond=0)
    tomorrow = (today + timedelta(days=1)).date().isoformat()

    overview = build_skill_map_overview(
        algorithm_rows=[
            {"algorithm_id": 1, "algorithm_name": "Sliding Window", "skill_name": "fixed vs variable window"},
            {"algorithm_id": 1, "algorithm_name": "Sliding Window", "skill_name": "valid window rule"},
        ],
        generated_rows=[
            {
                "id": "sw-fixed",
                "title": "Fixed Window",
                "tags": ["skill-map", "sliding-window", "fixed-vs-variable-window"],
            },
            {
                "id": "sw-valid",
                "title": "Valid Window",
                "tags": ["skill-map", "sliding-window", "valid-window-rule"],
            },
        ],
        attempt_rows=[
            {
                "tracked_card_id": "sw-fixed",
                "card_title": "Fixed Window",
                "category_tags": ["skill-map", "sliding-window", "fixed-vs-variable-window"],
                "successful": False,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "signals": {},
            },
            {
                "tracked_card_id": "sw-valid",
                "card_title": "Valid Window",
                "category_tags": ["skill-map", "sliding-window", "valid-window-rule"],
                "successful": False,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "ghost-reps",
                "live_coach_used": False,
                "signals": {},
            },
        ],
    )

    spaced_repetition = overview["spacedRepetition"]
    sliding_window = next(track for track in spaced_repetition["tracks"] if track["id"] == "sliding-window")
    fixed_window = next(track for track in spaced_repetition["tracks"] if track["id"] == "sliding-window:fixed-vs-variable-window")

    assert sliding_window["level"] == "pattern"
    assert sliding_window["status"] == "scheduled"
    assert sliding_window["completedSessions"] == 1
    assert sliding_window["lastCompletedAt"] == today.date().isoformat()
    assert sliding_window["nextDueAt"] == tomorrow
    assert sliding_window["coreAlgorithmCount"] == 2
    assert fixed_window["level"] == "method"
    assert fixed_window["parentSlug"] == "sliding-window"
    assert fixed_window["status"] == "scheduled"
    assert fixed_window["completedSessions"] == 1
    assert not spaced_repetition["queue"]
