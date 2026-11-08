from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

from app.contracts.evaluation import Evaluation
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
        "modality": "mcq",
        "targetSource": "skill-map",
        "targetControl": "user",
        "formatControl": "user",
    })

    evaluation = Evaluation.model_validate({"version": 1, "verdict": "needs-work"})
    result = asyncio.run(attempts_service.create_attempt(body, successful=False, evaluation=evaluation))

    assert result == {"saved": True, "attemptId": 91}
    assert captured["modality"] == "mcq"
    assert captured["target_source"] == "skill-map"
    assert json.loads(str(captured["signals_json"])) == {
        "elapsed_ms": 875,
        "evaluation": evaluation.to_stored(),
        "modality": {"kind": "mcq"},
    }


def test_create_attempt_normalizes_legacy_activity_format(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def _insert(**kwargs):
        captured.update(kwargs)
        return {"id": 92}

    monkeypatch.setattr(attempts_service, "insert_submission_attempt_row", _insert)
    body = AttemptCreate.model_validate({
        "cardId": "mcq-legacy",
        "mode": "main-recall",
        "activityFormat": "multiple-choice",
    })

    result = asyncio.run(attempts_service.create_attempt(body, successful=True, evaluation=Evaluation(verdict="sound")))

    assert result == {"saved": True, "attemptId": 92}
    assert captured["session_id"] == "0000"
    assert captured["modality"] == "mcq"


def test_create_attempt_persists_flow_and_modality_signals(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def _insert(**kwargs):
        captured.update(kwargs)
        return {"id": 93}

    monkeypatch.setattr(attempts_service, "insert_submission_attempt_row", _insert)
    body = AttemptCreate.model_validate({
        "cardId": "flow-card",
        "mode": "main-recall",
        "elapsedMs": 1500,
        "supportLayer": "ghost-reps",
        "modality": "ghost-rep",
        "signals": {
            "flow": {
                "runId": "flow-1",
                "anchorCardId": "flow-card",
                "stage": "ghost",
                "step": 1,
                "cycle": 1,
            },
            "modality": {
                "missedLineCount": 2,
                "kind": "client-value-ignored",
            },
        },
    })

    result = asyncio.run(attempts_service.create_attempt(body, successful=True, evaluation=Evaluation(verdict="sound")))

    assert result == {"saved": True, "attemptId": 93}
    assert captured["session_id"] == "flow-1"
    assert captured["modality"] == "ghost-rep"
    assert json.loads(str(captured["signals_json"])) == {
        "elapsed_ms": 1500,
        "evaluation": Evaluation(verdict="sound").to_stored(),
        "flow": {
            "runId": "flow-1",
            "anchorCardId": "flow-card",
            "stage": "ghost",
            "step": 1,
            "cycle": 1,
        },
        "modality": {
            "kind": "ghost-rep",
            "missedLineCount": 2,
        },
    }


def test_create_attempt_prefers_explicit_session_id_over_flow_signal(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def _insert(**kwargs):
        captured.update(kwargs)
        return {"id": 94}

    monkeypatch.setattr(attempts_service, "insert_submission_attempt_row", _insert)
    body = AttemptCreate.model_validate({
        "cardId": "flow-card",
        "mode": "main-recall",
        "sessionId": "flow-session-explicit",
        "flowRunId": "flow-run-fallback",
        "signals": {"flow": {"runId": "flow-signal-fallback"}},
    })

    result = asyncio.run(attempts_service.create_attempt(body, successful=True, evaluation=Evaluation(verdict="sound")))

    assert result == {"saved": True, "attemptId": 94}
    assert captured["session_id"] == "flow-session-explicit"


def test_skill_map_overview_groups_all_modalities_as_daily_work() -> None:
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
                "modality": "mcq",
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
                "modality": "total-recall",
                "live_coach_used": False,
                "signals": {},
            },
            {
                "tracked_card_id": "bs-1",
                "card_title": "Search Microdrill",
                "category_tags": ["skill-map", "binary-search", "search-on-answer"],
                "successful": False,
                "created_at": today,
                "template_mode": "algorithm",
                "support_layer": "none",
                "modality": "microdrill",
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
    assert activity["workCount"] == 6
    assert today_bucket["ghostRepCount"] == 0
    assert today_bucket["multipleChoiceCount"] == 1
    assert today_bucket["totalRecallCount"] == 2
    assert today_bucket["segments"] == [
        {
            "algorithm": "Binary Search",
            "slug": "binary-search",
            "workType": "total-recall",
            "count": 1,
            "skills": [{"skill": "Unclassified", "slug": "unclassified", "count": 1}],
        },
        {
            "algorithm": "Binary Search",
            "slug": "binary-search",
            "workType": "multiple-choice",
            "count": 1,
            "skills": [{"skill": "Unclassified", "slug": "unclassified", "count": 1}],
        },
        {
            "algorithm": "Binary Search",
            "slug": "binary-search",
            "workType": "microdrill",
            "count": 1,
            "skills": [{"skill": "search on answer", "slug": "search-on-answer", "count": 1}],
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
    assert pattern_freshness["binary-search"]["totalWork"] == 4
    assert overview["summary"]["workCount"] == 5


def test_skill_map_overview_counts_static_catalog_cards() -> None:
    now = datetime.now(timezone.utc)

    overview = build_skill_map_overview(
        algorithm_rows=[
            {"algorithm_id": 1, "algorithm_name": "Sliding Window", "skill_name": "valid window rule"},
        ],
        generated_rows=[
            {"id": "playlist-google-1-two-sum", "title": "1. Two Sum", "tags": ["skill-map", "static-playlist", "google", "arrays-hash-maps"]},
            {"id": "playlist-google-3-longest-substring-without-repeating-characters", "title": "3. Longest Substring Without Repeating Characters", "tags": ["skill-map", "static-playlist", "google", "sliding-window", "valid-window-rule"]},
            {"id": "playlist-skeletons-bfs-skeleton", "title": "BFS Skeleton", "tags": ["skill-map", "static-playlist", "skeletons", "graphs", "bfs-skeleton"]},
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
                "modality": "total-recall",
                "live_coach_used": False,
                "signals": {},
            },
            {
                "tracked_card_id": "playlist-skeletons-bfs-skeleton",
                "card_title": "BFS Skeleton",
                "category_tags": ["skill-map", "static-playlist", "google-skeletons", "graphs", "bfs-skeleton"],
                "question_type": "playlist:google-skeletons:algorithm",
                "successful": True,
                "created_at": now,
                "template_mode": "algorithm",
                "support_layer": "none",
                "modality": "total-recall",
                "live_coach_used": False,
                "signals": {},
            }
        ],
    )

    sliding = next(item for item in overview["algorithms"] if item["slug"] == "sliding-window")
    google = next(item for item in overview["algorithms"] if item["slug"] == "google")
    skeletons = next(item for item in overview["algorithms"] if item["slug"] == "skeletons")

    assert all(item["slug"] != "arrays-hash-maps" for item in overview["algorithms"])
    assert sliding["totalCards"] == 0
    assert sliding["untouchedCards"] == 0
    assert google["totalCards"] == 2
    assert google["overallAttemptCount"] == 1
    assert skeletons["totalCards"] == 1
    assert skeletons["overallAttemptCount"] == 1
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
        "skeletons",
    ]
    google_activity = next(
        item for item in overview["ghostRepActivity"]["algorithms"]
        if item["slug"] == "google"
    )
    skeleton_activity = next(
        item for item in overview["ghostRepActivity"]["algorithms"]
        if item["slug"] == "skeletons"
    )
    assert google_activity["totalPerfectRecalls"] == 1
    assert google_activity["coreCardCount"] == 2
    assert skeleton_activity["totalPerfectRecalls"] == 1
    assert skeleton_activity["coreCardCount"] == 1


def test_skill_map_overview_keeps_generated_cards_out_of_core_catalog_counts() -> None:
    now = datetime.now(timezone.utc)
    overview = build_skill_map_overview(
        algorithm_rows=[
            {
                "algorithm_id": 1,
                "algorithm_slug": "heap",
                "algorithm_name": "Heap / Priority Queue",
                "skill_name": "top-k maintenance",
            },
        ],
        generated_rows=[
            {
                "id": "core-algorithm-kth-largest",
                "title": "Kth Largest Heap Top",
                "tags": ["skill-map", "core-algorithm", "heap"],
                "algorithm_slug": "heap",
                "source_type": "core-catalog",
            },
            {
                "id": "skill-map-20260921000000000000-1",
                "title": "Generated Heap Drill",
                "tags": ["skill-map", "heap-priority-queue"],
                "algorithm_slug": "heap",
                "source_type": "generated-llm",
            },
            {
                "id": "playlist-google-973-k-closest-points",
                "title": "973. K Closest Points",
                "tags": ["skill-map", "static-playlist", "google", "heap"],
                "algorithm_slug": "heap",
                "source_type": "static-playlist",
            },
        ],
        attempt_rows=[
            {
                "tracked_card_id": "skill-map-20260921000000000000-1",
                "card_title": "Generated Heap Drill",
                "category_tags": ["skill-map", "heap-priority-queue"],
                "question_type": "skill-map",
                "successful": True,
                "created_at": now,
                "template_mode": "algorithm",
                "support_layer": "none",
                "modality": "total-recall",
                "live_coach_used": False,
                "signals": {},
            },
        ],
    )

    heap = next(item for item in overview["algorithms"] if item["slug"] == "heap")
    google = next(item for item in overview["algorithms"] if item["slug"] == "google")

    assert heap["totalCards"] == 1
    assert heap["overallAttemptCount"] == 1
    assert heap["practicedCards"] == 0
    assert google["totalCards"] == 1
    assert overview["reviewQueue"][0]["cardId"] == "skill-map-20260921000000000000-1"


def _activity_row(created_at: datetime) -> dict[str, object]:
    return {
        "created_at": created_at,
        "category_tags": ["skill-map", "sliding-window"],
        "question_type": "skill-map-mcq:card:random",
        "modality": "mcq",
        "successful": True,
    }


def test_daily_activity_groups_by_the_viewers_calendar_day() -> None:
    now = datetime.now(timezone.utc)
    # 01:00 UTC today is the previous evening in New York (UTC-4 or UTC-5).
    late_evening = now.replace(hour=1, minute=0, second=0, microsecond=0)
    rows = [_activity_row(late_evening)]
    slugs = {"sliding-window": "Sliding Window"}

    utc = attempts_service._build_ghost_rep_activity(rows, slugs, {}, window_days=7)
    new_york = attempts_service._build_ghost_rep_activity(
        rows, slugs, {}, window_days=7, tz=attempts_service.resolve_timezone("America/New_York"),
    )

    def active(activity):
        return [day["date"] for day in activity["days"] if day["total"]]

    assert active(utc) == [late_evening.date().isoformat()]
    assert active(new_york) == [(late_evening.date() - timedelta(days=1)).isoformat()]


def test_all_time_activity_starts_at_the_first_attempt() -> None:
    now = datetime.now(timezone.utc)
    first = now - timedelta(days=90)
    rows = [_activity_row(first), _activity_row(now)]

    activity = attempts_service._build_ghost_rep_activity(rows, {"sliding-window": "Sliding Window"}, {}, window_days=None)

    assert activity["windowStart"] == first.date().isoformat()
    assert len(activity["days"]) == 91
    assert sum(day["total"] for day in activity["days"]) == 2


def test_unknown_timezones_fall_back_to_utc() -> None:
    assert attempts_service.resolve_timezone("Not/AZone") is timezone.utc
    assert attempts_service.resolve_timezone(None) is timezone.utc
    assert str(attempts_service.resolve_timezone("Europe/Paris")) == "Europe/Paris"


def test_signal_history_lists_scored_signals_from_counted_submissions(monkeypatch) -> None:
    def _row(created_at: datetime, tags: list[str], dimensions: dict, modifiers: dict | None = None) -> dict[str, object]:
        return {
            "created_at": created_at,
            "category_tags": tags,
            "question_type": "skill-map-mcq:card:random",
            "modality": "mcq",
            "card_title": "Window question",
            "signals": {"evaluation": {"dimensions": dimensions, "modifiers": modifiers or {}}},
        }

    late_evening = datetime(2026, 1, 15, 3, 30, tzinfo=timezone.utc)  # Jan 14 in New York
    rows = [
        _row(late_evening, ["skill-map", "sliding-window"], {
            "correctness": {"label": "Correct choice", "status": "pass", "score": 100.0},
            "nearMiss": {"label": "Near miss", "status": "not_applicable", "score": 0.0},
        }, {"completionTime": {"label": "Speed and fluency", "status": "partial", "score": 140}}),
        _row(late_evening - timedelta(days=1), ["skill-map", "sliding-window"], {
            "correctness": {"label": "Correct choice", "status": "fail", "score": 0.0},
        }),
        _row(late_evening, ["skill-map", "no-such-algorithm"], {
            "correctness": {"label": "Correct choice", "status": "pass", "score": 100.0},
        }),
    ]

    async def _attempt_rows():
        return rows

    async def _algorithm_rows():
        return [{"algorithm_slug": "sliding-window", "algorithm_name": "Sliding Window"}]

    monkeypatch.setattr(attempts_service, "fetch_skill_map_overview_attempt_rows", _attempt_rows)
    monkeypatch.setattr(attempts_service, "fetch_skill_map_overview_algorithm_rows", _algorithm_rows)

    history = asyncio.run(attempts_service.get_signal_history("America/New_York"))

    assert history["signals"] == [
        {"key": "correctness", "label": "Correct choice", "count": 2},
        {"key": "completionTime", "label": "Speed and fluency", "count": 1},
    ]
    assert [(point["signal"], point["score"], point["date"]) for point in history["points"]] == [
        ("correctness", 0.0, "2026-01-13"),
        ("correctness", 100.0, "2026-01-14"),
        ("completionTime", 100.0, "2026-01-14"),
    ]
    assert history["points"][0]["algorithm"] == "Sliding Window"
    assert history["points"][0]["title"] == "Window question"
