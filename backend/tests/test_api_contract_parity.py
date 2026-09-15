from __future__ import annotations

from fastapi.testclient import TestClient

from app import main as app_main
from app.main import create_app
from app.services import attempts_service, catalog_service, coach_service, problem_practice_service, submission_service


def test_attempts_endpoint_contract(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def _mock_create_attempt(body):
        captured["body"] = body
        return {
            "saved": True,
            "attemptId": 123,
            "successful": True,
            "evaluation": {"version": 1, "verdict": "sound"},
            "feedbackUnavailable": None,
        }

    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(submission_service, "create_submission", _mock_create_attempt)
    monkeypatch.setattr(app_main, "connect", _noop_connect)
    monkeypatch.setattr(app_main, "disconnect", _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.post(
            "/api/attempts",
            json={
                "cardId": "card-1",
                "mode": "main-recall",
                "correctAnswer": "A",
                "userAnswer": "A",
                "elapsedMs": 2500,
            },
        )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["saved"] is True
    assert payload["attemptId"] == 123
    assert payload["evaluation"] == {"version": 1, "verdict": "sound"}
    body = captured["body"]
    assert body.elapsedMs == 2500
    assert "exact" not in body.model_dump()
    assert "correct" not in body.model_dump()


def test_coach_history_endpoint_contract(monkeypatch) -> None:
    async def _mock_history(_body):
        return {
            "summary": {
                "attemptCount": 1,
                "successRate": 100.0,
            },
            "entries": [
                {
                    "attemptId": 42,
                    "interactionId": "interaction-42",
                    "cardId": "card-42",
                    "cardTitle": "Card Title",
                    "question": "What is X?",
                    "questionType": "skill-map",
                    "correctAnswer": "A",
                    "userAnswer": "A",
                    "successful": True,
                    "signals": {
                        "elapsedMs": 2500,
                        "evaluation": {},
                    },
                    "templateMode": "algorithm",
                    "supportLayer": "none",
                    "liveCoachUsed": False,
                    "categoryTags": ["skill-map"],
                    "generatedCard": {},
                    "createdAt": "2026-05-24T00:00:00Z",
                }
            ],
        }

    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(coach_service, "coach_practice_history", _mock_history)
    monkeypatch.setattr(app_main, "connect", _noop_connect)
    monkeypatch.setattr(app_main, "disconnect", _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.post(
            "/api/coach/history",
            json={
                "cardId": "",
                "questionType": "skill-map",
                "skillTags": [],
                "limit": 6,
            },
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert "summary" in payload
    assert "entries" in payload
    assert payload["entries"][0]["attemptId"] == 42
    assert payload["entries"][0]["questionType"] == "skill-map"


def test_skill_map_overview_endpoint_contract(monkeypatch) -> None:
    async def _mock_overview():
        return {
            "summary": {"workCount": 1},
            "algorithms": [
                {
                    "algorithm": "Sliding Window",
                    "slug": "sliding-window",
                    "skills": ["expand / shrink rhythm"],
                    "overallReadiness": 90,
                    "overallAttemptCount": 1,
                    "ghostRepCount": 0,
                    "unsupportedAttemptCount": 1,
                    "workCount": 1,
                    "totalCards": 1,
                    "practicedCards": 1,
                    "untouchedCards": 0,
                    "staleCards": 0,
                    "dimensionSummary": {},
                    "modes": {},
                }
            ],
            "reviewQueue": [],
            "ghostRepActivity": {
                "windowStart": "2026-05-01",
                "windowEnd": "2026-05-24",
                "totalGhostReps": 0,
                "totalMultipleChoice": 0,
                "totalPerfectRecalls": 3,
                "workCount": 1,
                "activeDays": 1,
                "peakDailyCount": 1,
                "days": [],
                "algorithms": [],
            },
        }

    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(attempts_service, "get_skill_map_overview", _mock_overview)
    monkeypatch.setattr(app_main, "connect", _noop_connect)
    monkeypatch.setattr(app_main, "disconnect", _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/skill-map-overview")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert "summary" in payload
    assert "algorithms" in payload
    assert "reviewQueue" in payload
    assert "ghostRepActivity" in payload
    assert payload["algorithms"][0]["slug"] == "sliding-window"
    assert payload["ghostRepActivity"]["totalPerfectRecalls"] == 3


def test_playlist_drills_endpoint_preserves_unified_static_payload(monkeypatch) -> None:
    async def _mock_playlist(_playlist_slug, order):
        assert order == "google-15"
        return {
            "drills": [
                {
                    "id": "playlist-google-1-two-sum",
                    "title": "1. Two Sum",
                    "difficulty": "Easy",
                    "prompt": "Google: recall the static solution for 1. Two Sum.",
                    "solution": "def solution(nums, target): pass",
                    "missing": "# static playlist outline complete",
                    "hint": "Tier 1. Focus on pair lookup.",
                    "tags": ["skill-map", "static-playlist", "google"],
                    "templateTargets": {"algorithm": "def solution(nums, target): pass"},
                    "plainEnglishPromptDetail": {"leetcodeExamples": ["1. Two Sum"]},
                }
            ],
            "llmUsed": False,
        }

    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(problem_practice_service, "static_playlist_drills", _mock_playlist)
    monkeypatch.setattr(app_main, "connect", _noop_connect)
    monkeypatch.setattr(app_main, "disconnect", _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/coach/playlist-drills/google?order=google-15")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["llmUsed"] is False
    assert payload["drills"][0]["id"] == "playlist-google-1-two-sum"
    assert payload["drills"][0]["templateTargets"]["algorithm"]
    assert payload["drills"][0]["plainEnglishPromptDetail"]["leetcodeExamples"] == ["1. Two Sum"]


def test_playlist_drills_endpoint_supports_skeleton_metadata(monkeypatch) -> None:
    async def _mock_playlist(_playlist_slug, _order):
        return {
            "drills": [
                {
                    "id": "playlist-skeletons-bfs-skeleton",
                    "title": "BFS Skeleton",
                    "difficulty": "Easy",
                    "prompt": "Skeletons: recall the static solution for BFS Skeleton.",
                    "solution": "def bfs(start, graph): pass",
                    "missing": "# static playlist outline complete",
                    "hint": "Focus on the queue invariant.",
                    "tags": ["skill-map", "static-playlist", "skeletons"],
                    "skeletonApplicability": {
                        "templateStrength": 10,
                        "applicationAbstraction": 2,
                        "summary": "Queue -> visited -> neighbors",
                        "explanation": "Explore one layer at a time.",
                        "invariant": "Every queued node is discovered.",
                        "timeComplexity": "O(V + E)",
                    },
                }
            ],
            "llmUsed": False,
        }

    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(problem_practice_service, "static_playlist_drills", _mock_playlist)
    monkeypatch.setattr(app_main, "connect", _noop_connect)
    monkeypatch.setattr(app_main, "disconnect", _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/coach/playlist-drills/skeletons")

    assert response.status_code == 200, response.text
    applicability = response.json()["drills"][0]["skeletonApplicability"]
    assert applicability["templateStrength"] == 10
    assert applicability["timeComplexity"] == "O(V + E)"


def test_playlist_catalog_endpoint_contract(monkeypatch) -> None:
    async def _mock_catalog():
        return {
            "playlists": [
                {
                    "slug": "google",
                    "title": "Google",
                    "description": "Google-focused playlist.",
                    "showOnSkillMap": True,
                    "staticDeck": True,
                    "questions": [
                        {
                            "title": "1. Two Sum",
                            "coreShape": "Arrays / Hash Maps",
                            "methods": ["pair lookup", "complement map"],
                        }
                    ],
                }
            ]
        }

    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(catalog_service, "get_playlist_catalog", _mock_catalog)
    monkeypatch.setattr(app_main, "connect", _noop_connect)
    monkeypatch.setattr(app_main, "disconnect", _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/catalog/playlists")

    assert response.status_code == 200, response.text
    playlist = response.json()["playlists"][0]
    assert playlist["slug"] == "google"
    assert playlist["staticDeck"] is True
    assert playlist["questions"][0]["coreShape"] == "Arrays / Hash Maps"
