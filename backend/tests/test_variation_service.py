"""Adaptive and sequential variations, with the LLM call replaced."""

from __future__ import annotations

import pytest

from app.domain.llm_resilience import SubmissionFeedbackUnavailableError
from app.models import AdaptiveVariationRequest, SequentialVariationRequest
from app.services import variation_service

SPECIMEN = "def solve(nums):\n    left = 0\n    for right in range(len(nums)):\n        pass\n    return left"


@pytest.fixture
def llm(monkeypatch):
    state: dict = {"available": True, "response": None, "calls": []}
    monkeypatch.setattr(variation_service, "_resolve_available_llm_provider", lambda requested: "openai")
    monkeypatch.setattr(variation_service, "_llm_provider_available", lambda provider: state["available"])

    def fake_call(system_prompt, payload, provider):
        state["calls"].append(payload)
        return state["response"]

    monkeypatch.setattr(variation_service, "_call_llm_json", fake_call)
    return state


def adaptive_request(**overrides) -> AdaptiveVariationRequest:
    return AdaptiveVariationRequest(
        cardId="card-1",
        expectedAnswer=SPECIMEN,
        userAnswer="def solve(nums): return 0",
        skillTags=["sliding-window"],
        **overrides,
    )


def sequential_request() -> SequentialVariationRequest:
    return SequentialVariationRequest(cardId="card-1", cardTitle="Window", expectedAnswer=SPECIMEN, skillTags=["sliding-window"])


GOOD = {
    "prompt": "Window keeps sums; shrink when the total overflows.",
    "specimen": SPECIMEN + "\n{{missing}}",
    "hint": "Shrink from the left.",
    "title": "Shrinking window",
    "variationReason": "Pressure the repair step.",
    "progressionReason": "Adds a boundary.",
}


async def test_adaptive_variation_builds_a_repair_drill(llm) -> None:
    llm["response"] = GOOD
    result = await variation_service.coach_adaptive_variation(adaptive_request())
    assert result.llmUsed
    assert result.variationReason == "Pressure the repair step."
    drill = result.drill
    assert drill.id.startswith("adaptive-sliding-window-")
    assert drill.difficulty == "Med."
    assert "{{missing}}" not in drill.templateTargets["algorithm"]
    assert {"skill-map", "adaptive-variation"} <= set(drill.tags)
    assert any(tag.startswith("adaptive-") and tag != "adaptive-variation" for tag in drill.tags)
    assert llm["calls"][0]["targetDimension"]["key"] == result.targetDimension


async def test_sequential_variation_builds_a_next_step_drill(llm) -> None:
    llm["response"] = GOOD
    result = await variation_service.coach_sequential_variation(sequential_request())
    assert result.progressionReason == "Adds a boundary."
    assert result.drill.id.startswith("sequential-sliding-window-")
    assert result.drill.difficulty == "Easy"
    assert "sequential-next-step" in result.drill.tags


@pytest.mark.parametrize("run", ["adaptive", "sequential"])
@pytest.mark.parametrize(
    ("available", "response", "code"),
    [
        (False, GOOD, "coach_llm_missing_api_key"),
        (True, None, "coach_llm_no_response"),
        (True, {**GOOD, "specimen": "  "}, "coach_llm_invalid_response"),
        (True, {**GOOD, "title": ""}, "coach_llm_invalid_response"),
    ],
)
async def test_variation_failures(llm, run, available, response, code) -> None:
    llm["available"] = available
    if run == "sequential":
        response = {**response, "progressionReason": GOOD["progressionReason"]} if response else None
    llm["response"] = response
    with pytest.raises(SubmissionFeedbackUnavailableError) as error:
        if run == "adaptive":
            await variation_service.coach_adaptive_variation(adaptive_request())
        else:
            await variation_service.coach_sequential_variation(sequential_request())
    assert error.value.code == code


def test_adaptive_drill_requires_failure_details() -> None:
    with pytest.raises(ValueError):
        variation_service._build_variation_drill(
            mode="adaptive",
            pattern_name="sliding window",
            pattern_slug="sliding-window",
            template_mode="algorithm",
            specimen=SPECIMEN,
            prompt="p",
            title="t",
            hint="h",
            tags=[],
            stamp="1",
        )
