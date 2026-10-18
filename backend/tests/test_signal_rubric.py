from __future__ import annotations

import pytest

from app.core.assessor import AssessorContext, AssessorRuntime, AssessorUnavailableError, run_signal_assessor
from app.core.signal_catalog import BINARY_SEARCH_SIGNAL_SPEC, DEFAULT_SIGNAL_SPEC, SLIDING_WINDOW_SIGNAL_SPEC
from app.domain.feedback_builder import adaptive_primary_failure, submission_rubric_from_assessment
from app.domain.llm_resilience import SubmissionFeedbackUnavailableError
from app.domain.submission_evaluation import canonical_submission_evaluation
from app.models import AdaptiveVariationRequest, CoachAttemptFeedbackRequest
from app.services import variation_service
from app.submission_rubric import compact_submission_rubric, summarize_submission_rubrics


def _body() -> CoachAttemptFeedbackRequest:
    return CoachAttemptFeedbackRequest(cardId="card-1", expectedAnswer="target", userAnswer="attempt")


def _search_assessment(**overrides) -> dict:
    assessment = {
        "v": 1,
        "patternIdentified": "binary search",
        "signals": {
            "searchBounds": {"score": 100, "note": "Bounds cover the array."},
            "loopCondition": {"score": 90, "note": ""},
            "midpoint": {"score": 80, "note": ""},
            "boundUpdate": {"score": 40, "note": "Right bound never moves."},
            "correctness": {"score": 50, "note": ""},
            "syntax": {"valid": True, "error": None},
            "completionTime": {"score": 70, "note": ""},
            "structure": {"score": 10, "note": "Not part of the binary-search spec."},
        },
        "primaryBlocker": "Discard the correct half.",
        "blockerKey": "boundUpdate",
        "verdict": "needs-work",
        "errorTags": ["bounds"],
        "strengths": ["Bounds are right."],
    }
    assessment.update(overrides)
    return assessment


def test_rubric_follows_spec_order_roles_and_labels() -> None:
    rubric = submission_rubric_from_assessment(_body(), _search_assessment(), BINARY_SEARCH_SIGNAL_SPEC)

    assert list(rubric["dimensions"]) == ["searchBounds", "loopCondition", "midpoint", "boundUpdate", "correctness"]
    assert list(rubric["modifiers"]) == ["syntax", "completionTime"]
    assert rubric["dimensions"]["boundUpdate"]["label"] == "Bound update"
    assert rubric["dimensions"]["boundUpdate"]["status"] == "fail"
    assert rubric["dimensions"]["boundUpdate"]["evidence"] == ["Right bound never moves."]
    assert rubric["primaryFailure"]["label"] == "Bound update"
    assert rubric["signalSpec"] == {"algorithm": "binary-search", "version": 1}


def test_rubric_drops_signals_outside_the_spec() -> None:
    rubric = submission_rubric_from_assessment(_body(), _search_assessment(), BINARY_SEARCH_SIGNAL_SPEC)

    assert "structure" not in rubric["dimensions"]
    assert "structure" not in rubric["modifiers"]


def test_rubric_scores_are_weighted_and_axes_mapped() -> None:
    rubric = submission_rubric_from_assessment(_body(), _search_assessment(), BINARY_SEARCH_SIGNAL_SPEC)
    weights = {signal.key: signal.weight for signal in BINARY_SEARCH_SIGNAL_SPEC.signals}
    scores = {"searchBounds": 100, "loopCondition": 90, "midpoint": 80, "boundUpdate": 40, "correctness": 50, "syntax": 100, "completionTime": 70}
    expected_overall = round(sum(scores[key] * weights[key] for key in scores) / sum(weights.values()), 1)
    dimension_keys = ["searchBounds", "loopCondition", "midpoint", "boundUpdate", "correctness"]
    expected_conceptual = round(
        sum(scores[key] * weights[key] for key in dimension_keys) / sum(weights[key] for key in dimension_keys),
        1,
    )

    assert rubric["score"] == {
        "overall": expected_overall,
        "conceptual": expected_conceptual,
        "fidelity": 40.0,
        "executable": 100.0,
        "fluency": 70.0,
    }


def test_missing_signal_is_not_applicable_and_excluded_from_scores() -> None:
    assessment = _search_assessment()
    del assessment["signals"]["midpoint"]

    rubric = submission_rubric_from_assessment(_body(), assessment, BINARY_SEARCH_SIGNAL_SPEC)

    assert rubric["dimensions"]["midpoint"]["status"] == "not_applicable"
    summary = summarize_submission_rubrics([{"signals": {"evaluation": rubric}}])
    assert "midpoint" not in {item["key"] for item in summary["weakDimensions"]}


def test_compacted_evaluation_keeps_spec_reference_and_order() -> None:
    rubric = submission_rubric_from_assessment(_body(), _search_assessment(), BINARY_SEARCH_SIGNAL_SPEC)
    evaluation = canonical_submission_evaluation(rubric, BINARY_SEARCH_SIGNAL_SPEC)

    compact = compact_submission_rubric(evaluation)

    assert compact["signalSpec"] == {"algorithm": "binary-search", "version": 1}
    assert list(compact["dimensions"]) == list(rubric["dimensions"])


def test_adaptive_primary_failure_uses_weakest_spec_signal_when_sound() -> None:
    rubric = submission_rubric_from_assessment(
        _body(),
        _search_assessment(verdict="sound", blockerKey=""),
        BINARY_SEARCH_SIGNAL_SPEC,
    )

    assert adaptive_primary_failure(rubric) == {"key": "boundUpdate", "label": "Bound update", "score": 40.0}


def test_adaptive_primary_failure_falls_back_to_first_spec_dimension() -> None:
    evaluation = {"signalSpec": {"algorithm": "sliding-window", "version": 1}}

    assert adaptive_primary_failure(evaluation) == {"key": "windowState", "label": "Window state"}


@pytest.mark.asyncio
async def test_variation_strategy_comes_from_the_stored_spec(monkeypatch) -> None:
    captured: dict = {}

    def fake_call(_system_prompt, payload, _provider):
        captured.update(payload)
        return None

    monkeypatch.setattr(variation_service, "_resolve_available_llm_provider", lambda _requested: "openai")
    monkeypatch.setattr(variation_service, "_llm_provider_available", lambda _provider: True)
    monkeypatch.setattr(variation_service, "_call_llm_json", fake_call)

    evaluation = {
        "signalSpec": {"algorithm": "sliding-window", "version": 1},
        "primaryFailure": {"key": "windowRepair", "label": "Window repair"},
    }
    with pytest.raises(SubmissionFeedbackUnavailableError):
        await variation_service.coach_adaptive_variation(
            AdaptiveVariationRequest(cardId="card-1", expectedAnswer="target", skillTags=["sliding-window"], evaluation=evaluation)
        )

    assert captured["targetDimension"] == {"key": "windowRepair", "label": "Window repair"}
    assert captured["strategy"] == SLIDING_WINDOW_SIGNAL_SPEC.signal("windowRepair").variation_strategy


def _runtime(response) -> AssessorRuntime:
    return AssessorRuntime(call_llm_json=lambda *_args: response, max_tokens=100)


_CONTEXT = AssessorContext(provider="openai", provider_label="OpenAI", template_mode="algorithm")


@pytest.mark.asyncio
async def test_assessor_sends_spec_guidance_and_accepts_complete_signals() -> None:
    captured: dict = {}

    def fake_call(system_prompt, payload, *_args):
        captured.update({"prompt": system_prompt, "payload": payload})
        return _search_assessment()

    runtime = AssessorRuntime(call_llm_json=fake_call, max_tokens=100)
    result = await run_signal_assessor(_body(), _CONTEXT, runtime, BINARY_SEARCH_SIGNAL_SPEC)

    assert result["llmUsed"] is True
    assert set(captured["payload"]["signalGuidance"]) == set(BINARY_SEARCH_SIGNAL_SPEC.keys)
    assert "boundUpdate" in captured["prompt"]


@pytest.mark.asyncio
async def test_assessor_rejects_response_missing_a_spec_signal() -> None:
    assessment = _search_assessment()
    del assessment["signals"]["boundUpdate"]

    with pytest.raises(AssessorUnavailableError) as error:
        await run_signal_assessor(_body(), _CONTEXT, _runtime(assessment), BINARY_SEARCH_SIGNAL_SPEC)

    assert error.value.code == "signal_assessor_invalid_response"


@pytest.mark.asyncio
async def test_assessor_rejects_non_dict_response() -> None:
    with pytest.raises(AssessorUnavailableError) as error:
        await run_signal_assessor(_body(), _CONTEXT, _runtime(None), DEFAULT_SIGNAL_SPEC)

    assert error.value.code == "signal_assessor_no_response"
