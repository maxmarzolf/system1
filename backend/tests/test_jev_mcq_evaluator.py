from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import pytest

from app.core.jev import JevResponse, JevUnavailableError
from app.core.signals import ModalitySignalSpec, SpecEntry
from app.core.signals.base import JevSignal
from app.core.signals.mcq import DEFAULT_MCQ_DIRECTIVE, default_mcq_spec
from app.models import AttemptCreate, SubmissionModality
from app.services import attempts_service, signal_registry_service, submission_context_service, submission_service
from app.services.evaluators import EVALUATORS, SubmissionRecord, get_evaluator, jev_mcq
from app.services.evaluators.jev_mcq import JevMcqEvaluator
from app.services.evaluators.legacy_recall import AssessorEvaluator, GhostRepEvaluator
from app.services.submission_context_service import McqContext

CHOICES = (
    {"id": "A", "text": "Shrink while the window is invalid."},
    {"id": "B", "text": "Restart the window at every index."},
    {"id": "C", "text": "Sort the input first."},
    {"id": "D", "text": "Use a heap of window sums."},
)


def _context(submitted: str = "A") -> McqContext:
    return McqContext(
        problem_id="mcq-1",
        question="When does a sliding window shrink?",
        answers=CHOICES,
        correct_answer=CHOICES[0],
        submitted_answer=next(choice for choice in CHOICES if choice["id"] == submitted),
        elapsed_ms=10_000,
    )


def _body(**overrides: Any) -> AttemptCreate:
    values = {
        "cardId": "mcq-1",
        "generatedCardId": "mcq-1",
        "multipleChoiceProblemId": "mcq-1",
        "selectedChoiceId": "A",
        "mode": "main-recall",
        "modality": "mcq",
        "categoryTags": ["sliding-window"],
        "elapsedMs": 10_000,
    }
    values.update(overrides)
    return AttemptCreate(**values)


class FakeJevGateway:
    def __init__(self, answers: dict[str, dict[str, Any]], *, fail: bool = False):
        self.answers = answers
        self.fail = fail
        self.calls: list[tuple[Any, dict[str, Any]]] = []

    async def system_one(self, state: Any, questions: Mapping[str, Any]) -> JevResponse:
        self.calls.append((state, dict(questions)))
        if self.fail:
            raise JevUnavailableError("jev_timeout", "Jev did not respond in time.")
        return JevResponse(
            model="jev-test",
            answers={key: self.answers[key] for key in questions},
            usage={"input_tokens": 1, "output_tokens": 1},
            request_id=f"req-{len(self.calls)}",
        )


def _answers(correctness: str = "1", confidence: float = 0.95) -> dict[str, dict[str, Any]]:
    return {
        "correctness": {"type": "choice", "choice": correctness, "confidence": confidence, "probabilities": {}},
        "conceptRecognition": {"type": "noul", "noul": 0.9},
        "nearMiss": {"type": "score", "score": 2.0, "confidence": 0.8},
        "distractorMisconception": {"type": "choice", "choice": "wrong_update", "confidence": 0.6},
    }


@pytest.fixture
def patched(monkeypatch):
    state: dict[str, Any] = {"context": _context()}

    async def _build(_body):
        return state["context"]

    async def _load(algorithm):
        state["algorithm"] = algorithm
        return state.get("spec") or default_mcq_spec(algorithm)

    monkeypatch.setattr(jev_mcq, "build_mcq_context", _build)
    monkeypatch.setattr(signal_registry_service, "load_mcq_spec", _load)
    return state


@pytest.mark.asyncio
async def test_one_call_carries_correctness_and_every_signal_question(patched) -> None:
    gateway = FakeJevGateway(_answers("1"))

    outcome = await JevMcqEvaluator(lambda: gateway).evaluate(_body())

    assert len(gateway.calls) == 1
    state, questions = gateway.calls[0]
    assert state == {
        "question": "When does a sliding window shrink?",
        "answers": [dict(choice) for choice in CHOICES],
        "correctAnswer": dict(CHOICES[0]),
        "submittedAnswer": dict(CHOICES[0]),
    }
    assert questions["correctness"] == {
        "type": "choice",
        "instructions": DEFAULT_MCQ_DIRECTIVE["instructions"],
        "criteria": DEFAULT_MCQ_DIRECTIVE["criteria"],
    }
    assert set(questions["correctness"]["criteria"]) == {"1", "0"}
    assert patched["algorithm"] == "sliding-window"
    assert set(questions) == {"correctness", "conceptRecognition", "nearMiss", "distractorMisconception"}
    assert outcome.successful is True
    assert outcome.record == SubmissionRecord(
        user_answer="A. Shrink while the window is invalid.",
        correct_answer="A. Shrink while the window is invalid.",
        multiple_choice_problem_id="mcq-1",
    )
    evaluation = outcome.evaluation
    assert evaluation["verdict"] == "sound"
    assert evaluation["signalSpec"] == default_mcq_spec("sliding-window").reference()
    assert evaluation["signalSpec"]["algorithm"] == "sliding-window"
    assert evaluation["provenance"]["engine"] == "jev"
    assert evaluation["provenance"]["model"] == "jev-test"
    assert evaluation["provenance"]["flags"] == []
    assert evaluation["correctness"]["answerKeyAgreement"] is True
    assert evaluation["signalResults"]["nearMiss"]["status"] == "not_applicable"
    assert evaluation["signalResults"]["conceptRecognition"]["score"] == 90.0
    assert evaluation["signalResults"]["completionTime"]["score"] == 100.0
    assert evaluation["jevTrace"][0]["questionIds"] == list(questions)


@pytest.mark.asyncio
async def test_wrong_answer_scores_incorrect_only_signals(patched) -> None:
    patched["context"] = _context("B")
    gateway = FakeJevGateway(_answers("0"))

    outcome = await JevMcqEvaluator(lambda: gateway).evaluate(_body(selectedChoiceId="B"))

    results = outcome.evaluation["signalResults"]
    assert outcome.successful is False
    assert results["nearMiss"]["score"] == 100.0
    assert results["distractorMisconception"]["raw"] == "wrong_update"
    assert results["distractorMisconception"]["score"] is None
    assert outcome.evaluation["primaryFailure"]["key"] == "correctness"
    assert outcome.record is not None and outcome.record.user_answer.startswith("B.")


@pytest.mark.asyncio
async def test_jev_decides_and_disagreement_with_the_answer_key_is_flagged(patched) -> None:
    gateway = FakeJevGateway(_answers("0", confidence=0.4))

    outcome = await JevMcqEvaluator(lambda: gateway).evaluate(_body())

    assert outcome.successful is False
    assert outcome.evaluation["correctness"]["answerKeyAgreement"] is False
    assert outcome.evaluation["provenance"]["flags"] == ["answer_key_disagreement", "low_correctness_confidence"]


@pytest.mark.asyncio
async def test_jev_failure_falls_back_to_the_answer_key(patched) -> None:
    gateway = FakeJevGateway({}, fail=True)

    outcome = await JevMcqEvaluator(lambda: gateway).evaluate(_body())

    assert outcome.successful is True
    assert outcome.feedback_unavailable == {
        "code": "jev_timeout",
        "message": "Jev did not respond in time.",
        "provider": "jev",
    }
    results = outcome.evaluation["signalResults"]
    assert results["conceptRecognition"]["status"] == "unavailable"
    assert results["completionTime"]["status"] == "scored"
    assert outcome.evaluation["provenance"]["source"] == "answer-key-fallback"
    assert outcome.evaluation["provenance"]["flags"] == ["jev_unavailable"]


@pytest.mark.asyncio
async def test_needs_correctness_signals_go_in_a_second_call(patched, monkeypatch) -> None:
    follow_up = JevSignal(
        key="testFollowUp",
        label="Follow-up",
        primitive="noul",
        instructions="Given answeredCorrectly, was the choice confident?",
        needs_correctness=True,
    )
    base = default_mcq_spec("test")
    concept = next(entry for entry in base.signals if entry.plugin.key == "conceptRecognition")
    patched["spec"] = ModalitySignalSpec(
        algorithm="test",
        modality="mcq",
        correctness=base.correctness,
        signals=(concept, SpecEntry(follow_up, 0.25)),
    )
    gateway = FakeJevGateway({**_answers("1"), "testFollowUp": {"type": "noul", "noul": 0.5}})

    outcome = await JevMcqEvaluator(lambda: gateway).evaluate(_body())

    assert len(gateway.calls) == 2
    first_questions = gateway.calls[0][1]
    second_state, second_questions = gateway.calls[1]
    assert set(first_questions) == {"correctness", "conceptRecognition"}
    assert set(second_questions) == {"testFollowUp"}
    assert second_state["answeredCorrectly"] == 1
    assert outcome.evaluation["signalResults"]["testFollowUp"]["score"] == 50.0
    assert outcome.evaluation["provenance"]["requestIds"] == ["req-1", "req-2"]


@pytest.mark.asyncio
async def test_no_second_call_without_needs_correctness_signals(patched) -> None:
    gateway = FakeJevGateway(_answers("1"))

    await JevMcqEvaluator(lambda: gateway).evaluate(_body())

    assert len(gateway.calls) == 1


def test_registry_dispatches_by_modality() -> None:
    assert isinstance(get_evaluator(SubmissionModality.mcq), JevMcqEvaluator)
    assert isinstance(get_evaluator(SubmissionModality.ghost_rep), GhostRepEvaluator)
    assert isinstance(get_evaluator(SubmissionModality.total_recall), AssessorEvaluator)
    assert isinstance(get_evaluator(SubmissionModality.microdrill), AssessorEvaluator)
    assert set(EVALUATORS) == set(SubmissionModality)


@pytest.mark.asyncio
async def test_submission_service_persists_the_evaluator_record(patched, monkeypatch) -> None:
    gateway = FakeJevGateway(_answers("1"))
    monkeypatch.setitem(EVALUATORS, SubmissionModality.mcq, JevMcqEvaluator(lambda: gateway))
    captured: dict[str, Any] = {}

    async def _persist(body, *, successful, evaluation, record=None):
        captured.update(successful=successful, evaluation=evaluation, record=record)
        return {"saved": True, "attemptId": 7}

    monkeypatch.setattr(attempts_service, "create_attempt", _persist)

    result = await submission_service.create_submission(_body(correctAnswer="D. tampered"))

    assert result["successful"] is True
    assert result["feedbackUnavailable"] is None
    assert captured["record"].correct_answer == "A. Shrink while the window is invalid."


@pytest.mark.asyncio
async def test_mcq_context_comes_from_the_stored_problem(monkeypatch) -> None:
    stored = {
        "id": "mcq-1",
        "question": "When does a sliding window shrink?",
        "explanation": "",
        "choices": list(CHOICES),
        "correctChoiceId": "A",
    }

    async def _fetch(problem_id):
        return stored if problem_id == "mcq-1" else None

    monkeypatch.setattr(submission_context_service, "fetch_multiple_choice_problem", _fetch)

    context = await submission_context_service.build_mcq_context(_body(selectedChoiceId="C", correctAnswer="C. lie"))
    assert context.correct_answer == CHOICES[0]
    assert context.submitted_answer == CHOICES[2]
    assert context.answer_key_correct is False

    for body, code in (
        (_body(multipleChoiceProblemId=None, generatedCardId=None), "mcq_missing_ids"),
        (_body(selectedChoiceId=None), "mcq_missing_ids"),
        (_body(multipleChoiceProblemId="mcq-missing"), "mcq_unknown_problem"),
        (_body(selectedChoiceId="Z"), "mcq_unknown_choice"),
    ):
        with pytest.raises(submission_context_service.SubmissionContextError) as error:
            await submission_context_service.build_mcq_context(body)
        assert error.value.code == code
