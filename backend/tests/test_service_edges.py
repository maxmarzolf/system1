"""Fallback and failure branches across the smaller services."""

from __future__ import annotations

import pytest

from app.core.signals import registry as signal_registry
from app.core.llm import LlmUnavailableError
from app.models import AttemptCreate, FlowMicroDrillRequest, InlineCompletionRequest, MultipleChoiceDrillsRequest
from app.services import app_settings_service, drill_generation_service, inline_completion_service, micro_drill_service


@pytest.fixture(autouse=True)
def generation_settings(monkeypatch):
    """Generation settings without a database: the defaults, with a recognisable specimen style."""
    settings = app_settings_service.GenerationSettingsModel(specimen={"typeHints": "include", "comments": "brief"})

    async def generation():
        return settings

    monkeypatch.setattr(app_settings_service, "generation", generation)
    return settings


def test_unknown_deterministic_implementation() -> None:
    with pytest.raises(KeyError, match="Unknown deterministic implementation"):
        signal_registry.get_implementation("nope")


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


async def test_generated_cards_use_the_server_specimen_style(skill_map_request) -> None:
    body = await drill_generation_service._with_server_specimen(skill_map_request.model_copy(update={"specimenTuning": {"typeHints": "omit"}}))
    assert body.specimenTuning == {"typeHints": "include", "comments": "brief", "variableNames": "readable"}


def test_mcq_generation_uses_the_admin_models(generation_settings) -> None:
    call = drill_generation_service.mcq_generation_call(generation_settings)
    assert call.models == generation_settings.mcqModels.model_dump() and call.temperature == 0.7


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
