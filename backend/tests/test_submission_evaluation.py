from __future__ import annotations

import pytest

from app.domain.submission_evaluation import canonical_submission_evaluation
from app.models import AttemptCreate
from app.services import attempts_service, feedback_service, submission_service


def test_canonical_evaluation_removes_embedded_rubric_and_feedback_metadata() -> None:
    rubric = {
        "verdict": "needs-work",
        "score": {"overall": 62, "conceptual": 70},
        "primaryFailure": {"key": "contract", "label": "Contract", "severity": "high"},
        "dimensions": {},
        "modifiers": {},
        "recommendedAction": "Repair the bounds check.",
    }
    feedback = {
        "diagnosis": "The bounds check is malformed.",
        "submissionRubric": rubric,
        "llmUsed": True,
        "llmProvider": "openai",
        "signals": {"legacy": True},
    }

    evaluation = canonical_submission_evaluation(
        rubric,
        feedback,
        provider="openai",
        llm_used=True,
    )

    assert evaluation["verdict"] == "needs-work"
    assert evaluation["score"]["overall"] == 62.0
    assert evaluation["feedback"] == {"diagnosis": "The bounds check is malformed."}
    assert evaluation["provenance"] == {
        "llmUsed": True,
        "provider": "openai",
        "source": "assessor-narrator",
    }
    assert "submissionRubric" not in evaluation["feedback"]


@pytest.mark.asyncio
async def test_final_recall_uses_one_evaluation_flow_and_persists_its_result(monkeypatch) -> None:
    canonical = {
        "version": 1,
        "verdict": "sound",
        "score": {"overall": 91.0},
        "feedback": {"affirmation": "The queue discipline is correct."},
        "provenance": {"llmUsed": True, "provider": "openai", "source": "assessor-narrator"},
    }
    captured: dict[str, object] = {}

    async def _evaluate(body):
        captured["evaluation_request"] = body
        return canonical

    async def _persist(body, *, successful, evaluation):
        captured["persist_body"] = body
        captured["successful"] = successful
        captured["evaluation"] = evaluation
        return {"saved": True, "attemptId": 44}

    monkeypatch.setattr(feedback_service, "coach_submission_evaluation", _evaluate)
    monkeypatch.setattr(attempts_service, "create_attempt", _persist)

    body = AttemptCreate.model_validate({
        "cardId": "bfs-1",
        "mode": "main-recall",
        "question": "Write grid BFS.",
        "correctAnswer": "target",
        "userAnswer": "attempt",
        "elapsedMs": 450262,
    })
    result = await submission_service.create_submission(body)

    assert captured["evaluation_request"].liveMode is False
    assert captured["successful"] is True
    assert captured["evaluation"] is canonical
    assert result["evaluation"] is canonical
    assert result["successful"] is True
    assert result["feedbackUnavailable"] is None
