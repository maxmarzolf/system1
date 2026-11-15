"""The one write path: grade through the pipeline, store the trusted record, keep the traces."""

from __future__ import annotations

import pytest

from app.contracts.evaluation import Evaluation, build_evaluation
from app.contracts.submission import EvaluationOutcome, SubmissionRecord
from app.core.llm import record_llm_exchange
from app.core.signals.defaults import default_spec
from app.models import AttemptCreate
from app.services import submission_service, submission_store
from app.services.evaluation import pipeline


def test_canonical_evaluation_removes_embedded_rubric_and_feedback_metadata() -> None:
    spec = default_spec("total-recall")
    rubric = {
        "verdict": "needs-work",
        "score": {"overall": 62, "conceptual": 70},
        "primaryFailure": {"key": "contract", "label": "Contract", "severity": "high"},
        "dimensions": {},
        "modifiers": {},
        "recommendedAction": "Repair the bounds check.",
    }
    feedback = {
        "fullFeedback": "Needs work: the bounds check is malformed.",
        "submissionRubric": rubric,
        "llmUsed": True,
        "llmProvider": "openai",
        "signals": {"legacy": True},
    }

    evaluation = build_evaluation(rubric, spec, feedback, provider="openai", llm_used=True).to_stored()

    assert evaluation["verdict"] == "needs-work"
    assert evaluation["signalSpec"] == spec.reference()
    assert evaluation["signalSpec"]["modality"] == "total-recall" and evaluation["signalSpec"]["hash"]
    assert evaluation["score"]["overall"] == 62.0
    assert evaluation["feedback"] == {"fullFeedback": "Needs work: the bounds check is malformed."}
    assert evaluation["provenance"] == {"llmUsed": True, "provider": "openai", "source": "jev"}


BODY = AttemptCreate.model_validate({
    "cardId": "bfs-1", "mode": "main-recall", "question": "Write grid BFS.", "correctAnswer": "client copy",
    "userAnswer": "attempt", "elapsedMs": 1000, "categoryTags": ["binary-search"],
})


@pytest.mark.asyncio
async def test_create_submission_stores_the_pipelines_record_and_grading_traces(monkeypatch) -> None:
    record = SubmissionRecord(user_answer="attempt", correct_answer="server copy", problem_slug="bfs-1")
    evaluation = Evaluation.model_validate({"verdict": "close", "provenance": {"source": "jev"}})
    stored: dict[str, object] = {}

    async def evaluate(body):
        assert body is BODY
        # Stand-in for the feedback writer, whose LLM call records itself.
        record_llm_exchange({"provider": "claude", "systemPrompt": "write feedback", "ok": True})
        return EvaluationOutcome(successful=False, evaluation=evaluation, record=record,
                                 feedback_unavailable={"code": "jev_timeout", "message": "slow", "provider": "jev"})

    async def persist(body, *, successful, evaluation, record=None):
        stored.update(successful=successful, evaluation=evaluation, record=record)
        return {"saved": True, "attemptId": 44}

    monkeypatch.setattr(pipeline, "evaluate", evaluate)
    monkeypatch.setattr(submission_store, "create_attempt", persist)
    result = await submission_service.create_submission(BODY)

    assert stored["record"] is record and stored["successful"] is False
    assert result["saved"] is True and result["attemptId"] == 44
    assert result["evaluation"]["verdict"] == "close"
    assert [exchange["systemPrompt"] for exchange in result["evaluation"]["llmTrace"]] == ["write feedback"]
    assert result["feedbackUnavailable"]["code"] == "jev_timeout"


@pytest.mark.asyncio
async def test_no_llm_trace_when_grading_made_no_llm_call(monkeypatch) -> None:
    async def evaluate(_body):
        return EvaluationOutcome(successful=True, evaluation=Evaluation.model_validate({"verdict": "sound"}))

    async def persist(_body, **_kwargs):
        return {"saved": True, "attemptId": 1}

    monkeypatch.setattr(pipeline, "evaluate", evaluate)
    monkeypatch.setattr(submission_store, "create_attempt", persist)
    result = await submission_service.create_submission(BODY)
    assert "llmTrace" not in result["evaluation"]
