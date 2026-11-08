"""Fallback and failure branches across the smaller services."""

from __future__ import annotations

import pytest

from app.core.signals import registry as signal_registry
from app.core.llm import LlmUnavailableError
from app.models import AttemptCreate, FlowMicroDrillRequest, InlineCompletionRequest, MultipleChoiceDrillsRequest
from app.services import drill_generation_service, inline_completion_service, micro_drill_service
from app.services.evaluators import legacy_recall


def test_unknown_deterministic_implementation() -> None:
    with pytest.raises(KeyError, match="Unknown deterministic implementation"):
        signal_registry.get_implementation("nope")


async def test_assessor_evaluator_falls_back_to_semantic_check(monkeypatch) -> None:
    async def spec(_body):
        from app.core.signal_catalog import DEFAULT_SIGNAL_SPEC

        return DEFAULT_SIGNAL_SPEC

    async def unavailable(*_args):
        raise LlmUnavailableError("provider_timeout", "slow", "claude")

    async def semantic(request):
        return {"sound": True, "llmUsed": False}

    monkeypatch.setattr(legacy_recall, "_resolve_spec", spec)
    monkeypatch.setattr(legacy_recall.feedback_service, "coach_submission_evaluation", unavailable)
    monkeypatch.setattr(legacy_recall.evaluation_service, "coach_attempt_evaluation", semantic)

    body = AttemptCreate(cardId="c", mode="main-recall", userAnswer="x", correctAnswer="x")
    outcome = await legacy_recall.AssessorEvaluator().evaluate(body)
    assert outcome.successful is True
    assert outcome.feedback_unavailable == {"code": "provider_timeout", "message": "slow", "provider": "claude"}


# ── drill generation service ──


async def test_skill_map_generation_uses_the_configured_generator(monkeypatch, skill_map_request, progress_summary) -> None:
    monkeypatch.setattr(drill_generation_service, "_resolve_available_llm_provider", lambda requested: "openai")
    monkeypatch.setattr(drill_generation_service, "_llm_provider_available", lambda provider: False)
    persisted: list[bool] = []

    async def persist(drills, llm_used, summary):
        persisted.append(llm_used)

    result = await drill_generation_service.coach_skill_map_drills(skill_map_request, progress_summary, persist)
    assert result["llmUsed"] is False and persisted == [False]
    stream = await drill_generation_service.coach_skill_map_drills_stream(skill_map_request, progress_summary, persist)
    text = "".join([chunk async for chunk in stream])
    assert "event: done" in text


async def test_multiple_choice_generator_errors_become_feedback_unavailable(monkeypatch) -> None:
    async def failing(*_args, **_kwargs):
        raise LlmUnavailableError(
            code="coach_llm_no_response", message="none", provider="openai", api_error_code="x"
        )

    monkeypatch.setattr(drill_generation_service, "generate_multiple_choice_drills_response", failing)
    with pytest.raises(LlmUnavailableError) as error:
        await drill_generation_service.coach_multiple_choice_drills(MultipleChoiceDrillsRequest(), None)
    assert error.value.code == "coach_llm_no_response"


# ── inline completion ──


@pytest.fixture
def completion_llm(monkeypatch):
    state: dict = {"result": None, "error": None}
    monkeypatch.setattr(inline_completion_service, "resolve_available_llm_provider", lambda requested: "openai")
    monkeypatch.setattr(inline_completion_service, "llm_provider_available", lambda provider: True)

    def call(*_args):
        if state["error"]:
            raise state["error"]
        return state["result"]

    monkeypatch.setattr(inline_completion_service, "call_llm_json", call)
    return state


@pytest.mark.parametrize(
    ("result", "prediction"),
    [(None, ""), ({"completion": 3}, ""), ({"completion": "```py\nx\n```"}, ""), ({"completion": "x" * 700}, "x" * 600)],
)
async def test_inline_completion_sanitizes_output(completion_llm, result, prediction) -> None:
    completion_llm["result"] = result
    response = await inline_completion_service.generate_inline_completion(InlineCompletionRequest(prefix="def f(", suffix=""))
    assert response.prediction == prediction


async def test_inline_completion_wraps_provider_crashes(completion_llm) -> None:
    completion_llm["error"] = RuntimeError("socket closed")
    with pytest.raises(inline_completion_service.InlineCompletionGenerationError):
        await inline_completion_service.generate_inline_completion(InlineCompletionRequest(prefix="x", suffix=""))


async def test_micro_drill_wraps_provider_crashes(monkeypatch) -> None:
    monkeypatch.setattr(micro_drill_service, "resolve_available_llm_provider", lambda requested: "openai")
    monkeypatch.setattr(micro_drill_service, "llm_provider_available", lambda provider: True)

    def crash(*_args):
        raise RuntimeError("boom")

    monkeypatch.setattr(micro_drill_service, "call_llm_json", crash)
    with pytest.raises(micro_drill_service.MicroDrillGenerationError, match="failed"):
        await micro_drill_service.generate_flow_micro_drill(FlowMicroDrillRequest(cardTitle="t", prompt="p", target="x"))
