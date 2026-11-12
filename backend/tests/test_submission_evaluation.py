from __future__ import annotations

import pytest

from app.core.signal_catalog import BINARY_SEARCH_SIGNAL_SPEC, DEFAULT_SIGNAL_SPEC
from app.contracts.evaluation import Evaluation, build_evaluation
from app.models import AttemptCreate
from app.services import feedback_service, signal_spec_service, submission_service
from app.services import submission_store


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

    evaluation = build_evaluation(
        rubric,
        DEFAULT_SIGNAL_SPEC,
        feedback,
        provider="openai",
        llm_used=True,
    ).to_stored()

    assert evaluation["verdict"] == "needs-work"
    assert evaluation["signalSpec"] == {"algorithm": "default", "version": 1}
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
    canonical = Evaluation.model_validate({
        "version": 1,
        "verdict": "sound",
        "score": {"overall": 91.0},
        "feedback": {"affirmation": "The queue discipline is correct."},
        "provenance": {"llmUsed": True, "provider": "openai", "source": "assessor-narrator"},
    })
    captured: dict[str, object] = {}

    async def _evaluate(body, spec):
        captured["evaluation_request"] = body
        captured["spec"] = spec
        return canonical

    async def _resolve(card_ids, skill_tags):
        captured["resolved"] = (card_ids, skill_tags)
        return BINARY_SEARCH_SIGNAL_SPEC

    async def _persist(body, *, successful, evaluation, record=None):
        assert record is None
        captured["persist_body"] = body
        captured["successful"] = successful
        captured["evaluation"] = evaluation
        return {"saved": True, "attemptId": 44}

    monkeypatch.setattr(feedback_service, "coach_submission_evaluation", _evaluate)
    monkeypatch.setattr(submission_store, "create_attempt", _persist)
    monkeypatch.setattr(signal_spec_service, "resolve_signal_spec", _resolve)

    body = AttemptCreate.model_validate({
        "cardId": "bfs-1",
        "mode": "main-recall",
        "question": "Write grid BFS.",
        "correctAnswer": "target",
        "userAnswer": "attempt",
        "elapsedMs": 450262,
        "categoryTags": ["binary-search"],
    })
    result = await submission_service.create_submission(body)

    assert captured["resolved"] == ([None, "bfs-1"], ["binary-search"])
    assert captured["spec"] is BINARY_SEARCH_SIGNAL_SPEC
    assert captured["evaluation_request"].exact is False
    assert captured["successful"] is True
    assert captured["evaluation"] is canonical
    assert result["evaluation"] == canonical.to_stored()
    assert result["successful"] is True
    assert result["feedbackUnavailable"] is None


@pytest.mark.asyncio
async def test_llm_calls_made_while_grading_are_stored_on_the_evaluation(monkeypatch) -> None:
    from app.core.llm import record_llm_exchange

    async def _evaluate(_body, _spec):
        # Stand-in for the assessor and narrator, whose LLM calls record themselves.
        record_llm_exchange({"provider": "claude", "systemPrompt": "assess", "payload": {"userAnswer": "attempt"}, "ok": True})
        record_llm_exchange({"provider": "claude", "systemPrompt": "narrate", "payload": {}, "ok": True})
        return Evaluation.model_validate({"verdict": "sound", "provenance": {"source": "assessor-narrator"}})

    async def _persist(_body, *, successful, evaluation, record=None):
        return {"saved": True, "attemptId": 45}

    async def _resolve(_card_ids, _skill_tags):
        return BINARY_SEARCH_SIGNAL_SPEC

    monkeypatch.setattr(feedback_service, "coach_submission_evaluation", _evaluate)
    monkeypatch.setattr(submission_store, "create_attempt", _persist)
    monkeypatch.setattr(signal_spec_service, "resolve_signal_spec", _resolve)

    body = AttemptCreate.model_validate({
        "cardId": "bfs-1", "mode": "main-recall", "question": "Write grid BFS.",
        "correctAnswer": "target", "userAnswer": "attempt", "elapsedMs": 1000, "categoryTags": ["binary-search"],
    })
    result = await submission_service.create_submission(body)

    trace = result["evaluation"]["llmTrace"]
    assert [exchange["systemPrompt"] for exchange in trace] == ["assess", "narrate"]
    assert [exchange["attempt"] for exchange in trace] == [1, 2]
