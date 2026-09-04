from __future__ import annotations

import pytest

from app.services import coach_orchestration_service, coach_service, feedback_service, history_service


@pytest.mark.asyncio
async def test_coach_service_feedback_delegates_to_feedback_service(monkeypatch) -> None:
    called = {"value": False}

    async def _mock_feedback(body):
        called["value"] = True
        return {"ok": True, "cardId": body.cardId}

    monkeypatch.setattr(feedback_service, "coach_attempt_feedback", _mock_feedback)

    body = type("Body", (), {"cardId": "card-1"})()
    result = await coach_service.coach_attempt_feedback(body)

    assert called["value"] is True
    assert result["ok"] is True


@pytest.mark.asyncio
async def test_coach_service_history_delegates_to_history_service(monkeypatch) -> None:
    called = {"value": False}

    async def _mock_history(_body):
        called["value"] = True
        return {"summary": {"attemptCount": 1}, "entries": []}

    monkeypatch.setattr(history_service, "coach_practice_history", _mock_history)

    result = await coach_service.coach_practice_history(object())

    assert called["value"] is True
    assert result["summary"]["attemptCount"] == 1


@pytest.mark.asyncio
async def test_coach_service_session_plan_delegates_to_orchestration_service(monkeypatch) -> None:
    called = {"value": False}

    async def _mock_session(_body):
        called["value"] = True
        return {"headline": "focus", "llmUsed": True}

    monkeypatch.setattr(coach_orchestration_service, "coach_session_plan", _mock_session)

    result = await coach_service.coach_session_plan(object())

    assert called["value"] is True
    assert result["headline"] == "focus"
