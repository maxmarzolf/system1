"""Narrator retries, the assessor + narrator feedback service, session plans, history and admin reset."""

from __future__ import annotations

import logging

import pytest

from app.core import narrator
from app.core.signal_catalog import BINARY_SEARCH_SIGNAL_SPEC
from app.domain.llm_resilience import SubmissionFeedbackUnavailableError
from app.models import (
    AdminResetPracticeHistoryRequest,
    CoachAttemptFeedbackRequest,
    CoachPracticeHistoryRequest,
    CoachSessionPlanRequest,
)
from app.services import admin_service, feedback_service, history_service, session_service

ASSESSMENT = {
    "v": 1,
    "patternIdentified": "binary search",
    "signals": {
        "searchBounds": {"score": 100, "note": ""},
        "loopCondition": {"score": 90, "note": ""},
        "midpoint": {"score": 80, "note": ""},
        "boundUpdate": {"score": 40, "note": "Right bound never moves."},
        "correctness": {"score": 50, "note": ""},
        "syntax": {"valid": True, "error": None},
        "completionTime": {"score": 70, "note": ""},
    },
    "primaryBlocker": "Discard the correct half.",
    "blockerKey": "boundUpdate",
    "verdict": "needs-work",
    "errorTags": ["bounds"],
    "strengths": ["Bounds are right."],
}

NARRATION = {
    "diagnosis": "The right bound never moves.",
    "primaryFocus": "Move the right bound.",
    "immediateCorrection": "hi = mid - 1",
    "fullFeedback": "needs work: the loop never shrinks.",
    "correctedVersion": "```python\nhi = mid - 1\n```",
    "strengths": ["a", "b", "c", "d"],
    "errorTags": ["bounds"],
}


def body(**overrides) -> CoachAttemptFeedbackRequest:
    return CoachAttemptFeedbackRequest(
        cardId="card-1", expectedAnswer="target", userAnswer="attempt", skillTags=["binary-search"], **overrides
    )


def context(**tuning) -> narrator.NarratorContext:
    return narrator.NarratorContext(
        provider="openai", provider_label="ChatGPT", template_label="binary search template", submission_tuning=tuning
    )


def runtime(results, sleeps=None, **overrides) -> narrator.NarratorRuntime:
    queue = list(results)

    async def sleep(seconds):
        if sleeps is not None:
            sleeps.append(seconds)

    return narrator.NarratorRuntime(
        call_llm_json_for_submission=lambda *_args: queue.pop(0),
        sleep=sleep,
        logger=logging.getLogger("test"),
        **overrides,
    )


# ── narrator ──


def test_narrator_prompt_reflects_grading_mode_and_micro_drills() -> None:
    strict = narrator.narrator_submission_system_prompt("t", {"gradingMode": "strict", "microDrillEnabled": True})
    assert "Grade strictly" in strict and "self-contained reinforcement question" in strict
    lenient = narrator.narrator_submission_system_prompt("t", {"gradingMode": "lenient"})
    assert "minor gaps are acceptable" in lenient and "empty string" in lenient
    unknown = narrator.narrator_submission_system_prompt("t", {"gradingMode": "other"})
    assert "core algorithmic logic" in unknown


def test_narrator_payload_hides_answer_when_asked_and_trims_history() -> None:
    history = [{"successful": True, "signals": {"evaluation": {}}, "createdAt": f"d{i}"} for i in range(10)]
    hidden = narrator.build_narrator_payload(body(), ASSESSMENT, history, False, {})
    assert hidden["attempt"]["expectedAnswer"] == ""
    assert len(hidden["historicalAttempts"]) == 8
    shown = narrator.build_narrator_payload(body(), {}, [], True, {})
    assert shown["attempt"]["expectedAnswer"] == "target"
    assert shown["assessment"]["verdict"] == "needs-work"


async def test_narrator_returns_normalized_feedback() -> None:
    result = await narrator.attempt_feedback_with_narrator(
        body(), ASSESSMENT, [], {}, context(), runtime([(NARRATION, "", "", False)])
    )
    assert result["llmUsed"] is True
    assert result["correctedVersion"] == "hi = mid - 1"
    assert result["strengths"] == ["a", "b", "c"]


async def test_narrator_retries_retryable_failures_then_succeeds() -> None:
    sleeps: list[float] = []
    results = [(None, "provider_timeout", "slow", True), ({"x": 1}, "", "", True), (NARRATION, "", "", False)]
    result = await narrator.attempt_feedback_with_narrator(
        body(), ASSESSMENT, [], {}, context(), runtime(results, sleeps)
    )
    assert result["fullFeedback"] == NARRATION["fullFeedback"]
    assert sleeps == [0.3, 0.6]


async def test_narrator_stops_on_non_retryable_failure() -> None:
    with pytest.raises(narrator.NarratorFeedbackUnavailableError) as error:
        await narrator.attempt_feedback_with_narrator(
            body(), ASSESSMENT, [], {}, context(), runtime([(None, "provider_auth_error", "bad key", False)])
        )
    assert error.value.message == "bad key"
    assert error.value.api_error_code == "provider_auth_error"


async def test_narrator_gives_up_after_max_retries_with_default_message() -> None:
    results = [(None, "", "", True)] * 3
    with pytest.raises(narrator.NarratorFeedbackUnavailableError) as error:
        await narrator.attempt_feedback_with_narrator(body(), ASSESSMENT, [], {}, context(), runtime(results))
    assert "No response from ChatGPT" in error.value.message


# ── feedback_service ──


@pytest.fixture
def feedback(monkeypatch):
    state = {"available": True, "assessment": ASSESSMENT, "narration": (NARRATION, "", "", False)}

    async def load_context(_body):
        return [], {}

    monkeypatch.setattr(history_service, "load_feedback_context", load_context)
    monkeypatch.setattr(feedback_service, "_resolve_available_llm_provider", lambda requested: "openai")
    monkeypatch.setattr(feedback_service, "_llm_provider_available", lambda provider: state["available"])
    monkeypatch.setattr(
        feedback_service,
        "ASSESSOR_RUNTIME",
        feedback_service.AssessorRuntime(call_llm_json=lambda *_a: state["assessment"], max_tokens=100),
    )
    monkeypatch.setattr(
        feedback_service, "NARRATOR_RUNTIME", runtime([state["narration"]] * 3)
    )
    return state


async def test_submission_evaluation_combines_assessor_and_narrator(feedback) -> None:
    evaluation = await feedback_service.coach_submission_evaluation(body(), BINARY_SEARCH_SIGNAL_SPEC)
    assert evaluation["verdict"] == "needs-work"
    assert evaluation["signalSpec"]["algorithm"] == BINARY_SEARCH_SIGNAL_SPEC.algorithm
    assert evaluation["provenance"]["llmUsed"] is True


async def test_submission_evaluation_requires_a_provider_key(feedback) -> None:
    feedback["available"] = False
    with pytest.raises(SubmissionFeedbackUnavailableError) as error:
        await feedback_service.coach_submission_evaluation(body(), BINARY_SEARCH_SIGNAL_SPEC)
    assert error.value.code == "coach_llm_missing_api_key"


async def test_assessor_failure_becomes_feedback_unavailable(feedback) -> None:
    feedback["assessment"] = None
    with pytest.raises(SubmissionFeedbackUnavailableError):
        await feedback_service.coach_submission_evaluation(body(), BINARY_SEARCH_SIGNAL_SPEC)


async def test_narrator_failure_becomes_feedback_unavailable(feedback, monkeypatch) -> None:
    monkeypatch.setattr(feedback_service, "NARRATOR_RUNTIME", runtime([(None, "x", "nope", False)]))
    with pytest.raises(SubmissionFeedbackUnavailableError) as error:
        await feedback_service.coach_submission_evaluation(body(), BINARY_SEARCH_SIGNAL_SPEC)
    assert error.value.message == "nope"


async def test_narrator_without_llm_use_is_rejected(feedback, monkeypatch) -> None:
    async def no_llm(*_args):
        return {"llmUsed": False}

    monkeypatch.setattr(feedback_service, "attempt_feedback_with_narrator", no_llm)
    with pytest.raises(SubmissionFeedbackUnavailableError) as error:
        await feedback_service.coach_submission_evaluation(body(), BINARY_SEARCH_SIGNAL_SPEC)
    assert error.value.code == "submission_feedback_no_response"


# ── session plans ──

PLAN = {"headline": "h", "focusTheme": "f", "warmup": "w", "mainSet": "m", "cooldown": "c", "note": "n"}


@pytest.fixture
def plan_llm(monkeypatch):
    state = {"available": True, "response": PLAN}
    monkeypatch.setattr(session_service, "_resolve_available_llm_provider", lambda requested: "openai")
    monkeypatch.setattr(session_service, "_llm_provider_available", lambda provider: state["available"])
    monkeypatch.setattr(session_service, "_call_llm_json", lambda *_args: state["response"])
    return state


def plan_request() -> CoachSessionPlanRequest:
    return CoachSessionPlanRequest(attempts=4, correctCount=3, avgElapsedMs=1200)


async def test_session_plan_success(plan_llm) -> None:
    plan = await session_service.coach_session_plan(plan_request())
    assert plan.headline == "h" and plan.llmUsed


@pytest.mark.parametrize(
    ("available", "response", "code"),
    [
        (False, PLAN, "coach_llm_missing_api_key"),
        (True, None, "coach_llm_no_response"),
        (True, {"headline": "only"}, "coach_llm_invalid_response"),
    ],
)
async def test_session_plan_failures(plan_llm, available, response, code) -> None:
    plan_llm.update(available=available, response=response)
    with pytest.raises(SubmissionFeedbackUnavailableError) as error:
        await session_service.coach_session_plan(plan_request())
    assert error.value.code == code


# ── history ──


async def test_history_service_reads_and_summarizes(monkeypatch, skill_map_request) -> None:
    seen: list[dict] = []
    entry = {"attemptId": 1, "successful": True, "categoryTags": ["sliding-window"], "signals": {}, "question": "q"}

    async def fetch(**kwargs):
        seen.append(kwargs)
        return [entry]

    monkeypatch.setattr(history_service, "fetch_practice_history_entries", fetch)

    history, summary = await history_service.load_feedback_context(body())
    assert history == [entry] and summary["attemptCount"] == 1
    assert seen[-1]["limit"] == 20

    response = await history_service.coach_practice_history(CoachPracticeHistoryRequest(cardId="c", limit=5))
    assert response.summary["attemptCount"] == 1
    assert seen[-1]["limit"] == 5

    progress = await history_service.load_skill_map_generation_summary(skill_map_request)
    assert seen[-1]["skill_tags"] == ["sliding-window", "two-pointers"]
    assert progress["patterns"]["sliding-window"]["attemptCount"] == 1


# ── admin reset ──


async def test_reset_requires_the_confirmation_token(monkeypatch) -> None:
    monkeypatch.setattr(admin_service.settings, "admin_reset_token", "yes")
    with pytest.raises(admin_service.AdminResetPermissionError):
        await admin_service.reset_practice_history(AdminResetPracticeHistoryRequest(confirm="no"))


async def test_reset_counts_before_and_after(monkeypatch) -> None:
    counts = iter([{"submission": 3, "generated_problems": 1}, {"submission": 0, "generated_problems": 0}])
    truncated: list[bool] = []

    async def count():
        return next(counts)

    async def truncate():
        truncated.append(True)

    monkeypatch.setattr(admin_service.settings, "admin_reset_token", "yes")
    monkeypatch.setattr(admin_service, "count_practice_history_rows", count)
    monkeypatch.setattr(admin_service, "truncate_practice_history_tables", truncate)
    result = await admin_service.reset_practice_history(AdminResetPracticeHistoryRequest(confirm="yes"))
    assert result["before"]["submission"] == 3
    assert result["after"]["submission"] == 0
    assert truncated == [True]
