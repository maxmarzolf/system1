from __future__ import annotations

from fastapi.testclient import TestClient

from app import main as app_main
from app.main import create_app
from app.services import attempts_service
from app.services import coach_service


def test_attempts_endpoint_contract(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def _mock_create_attempt(body):
        captured["body"] = body
        return {"saved": True, "attemptId": 123}

    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(attempts_service, "create_attempt", _mock_create_attempt)
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
                "successful": True,
                "signals": {
                    "elapsedMs": 2500,
                    "coachFeedback": {"diagnosis": "Sound"},
                    "submissionRubric": {"verdict": "sound"},
                },
            },
        )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload == {"saved": True, "attemptId": 123}
    body = captured["body"]
    assert body.signals.elapsedMs == 2500
    assert body.signals.coachFeedback == {"diagnosis": "Sound"}
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
                        "coachFeedback": {},
                        "submissionRubric": {},
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
