from __future__ import annotations

import pytest

from dataclasses import replace

from app.core.signals import SignalContext, applies, definition_to_plugin, register_implementation
from app.core.signals.base import DeterministicSignal, JevSignal
from app.core.signals.mcq import COMPLETION_TIME, DEFAULT_MCQ_DEFINITIONS, default_mcq_spec
from app.domain.coach_context import algorithm_slug_for_tags
from app.domain.feedback_builder import rubric_from_signal_results

CONTEXT = SignalContext(modality="mcq", state={"question": "q"}, elapsed_ms=10_000)


def test_noul_signal_scores_the_yes_probability() -> None:
    signal = JevSignal(key="k", label="K", primitive="noul", instructions="?")

    result = signal.interpret({"type": "noul", "noul": 0.8}, CONTEXT, True)

    assert signal.question(CONTEXT) == {"type": "noul", "instructions": "?"}
    assert result.status == "scored"
    assert result.score == 80.0
    assert result.confidence == 0.6


def test_score_signal_normalizes_by_top_level() -> None:
    signal = JevSignal(key="k", label="K", primitive="score", instructions="?", criteria=("a", "b", "c"))

    result = signal.interpret({"type": "score", "score": 1.0, "confidence": 0.5}, CONTEXT, False)

    assert signal.question(CONTEXT)["criteria"] == ["a", "b", "c"]
    assert result.score == 50.0
    assert result.confidence == 0.5


def test_choice_signal_uses_score_map_or_stays_diagnostic() -> None:
    graded = JevSignal(
        key="g", label="G", primitive="choice", instructions="?", criteria={"good": None, "bad": None},
        score_map={"good": 100, "bad": 0},
    )
    diagnostic = JevSignal(
        key="d", label="D", primitive="choice", instructions="?", criteria={"x": None}, role="diagnostic",
    )
    answer = {"type": "choice", "choice": "good", "confidence": 0.9}

    assert graded.interpret(answer, CONTEXT, True).score == 100.0
    result = diagnostic.interpret({**answer, "choice": "x"}, CONTEXT, True)
    assert result.raw == "x"
    assert result.score is None


def test_missing_answer_is_unavailable() -> None:
    signal = JevSignal(key="k", label="K", primitive="noul", instructions="?")

    assert signal.interpret(None, CONTEXT, True).status == "unavailable"


def test_completion_time_is_deterministic() -> None:
    assert COMPLETION_TIME.question(CONTEXT) is None
    assert COMPLETION_TIME.interpret(None, CONTEXT, True).score == 100.0
    slow = SignalContext(modality="mcq", state={}, elapsed_ms=50_000)
    assert COMPLETION_TIME.interpret(None, slow, True).score == 50.0


def test_applies_when_filters_by_correctness() -> None:
    only_wrong = JevSignal(key="k", label="K", primitive="noul", instructions="?", applies_when="incorrect")

    assert applies(only_wrong, successful=False)
    assert not applies(only_wrong, successful=True)


def test_register_implementation_rejects_a_different_implementation_with_the_same_name() -> None:
    duplicate = DeterministicSignal(key="completionTime", label="x", description="", compute=lambda _c, _s: (0, 0, ""))

    with pytest.raises(ValueError):
        register_implementation(duplicate)


def test_definitions_build_jev_and_deterministic_plugins() -> None:
    definitions = {definition["key"]: definition for definition in DEFAULT_MCQ_DEFINITIONS}

    concept = definition_to_plugin(definitions["conceptRecognition"])
    near_miss = definition_to_plugin(definitions["nearMiss"])
    timing = definition_to_plugin({**definitions["completionTime"], "label": "Pace", "weight": 0.2})

    assert isinstance(concept, JevSignal) and concept.primitive == "noul"
    assert near_miss.question(CONTEXT)["criteria"] == definitions["nearMiss"]["criteria"]
    assert near_miss.applies_when == "incorrect"
    assert isinstance(timing, DeterministicSignal)
    assert timing.label == "Pace"
    assert timing.interpret(None, CONTEXT, True).score == 100.0


def test_noul_criteria_describe_outcomes() -> None:
    signal = definition_to_plugin(
        {**DEFAULT_MCQ_DEFINITIONS[0], "criteria": {"true": "Recognized it", "false": None}}
    )

    assert signal.question(CONTEXT) == {
        "type": "noul",
        "instructions": DEFAULT_MCQ_DEFINITIONS[0]["instructions"],
        "criteria": {"true": "Recognized it"},
    }


def test_default_spec_hash_tracks_content() -> None:
    spec = default_mcq_spec("sliding-window")
    reworded = replace(spec, correctness=replace(spec.correctness, instructions="Different wording"))

    assert spec.algorithm == "sliding-window"
    assert [entry.plugin.key for entry in spec.signals] == [d["key"] for d in DEFAULT_MCQ_DEFINITIONS]
    assert spec.reference()["hash"] == spec.hash() == default_mcq_spec("sliding-window").hash()
    assert reworded.hash() != spec.hash()
    assert spec.snapshot()["correctness"]["criteria"].keys() == {"1", "0"}
    assert {item["scope"] for item in spec.snapshot()["signals"]} == {"general"}


def _plugin(key: str):
    return next(entry.plugin for entry in default_mcq_spec().signals if entry.plugin.key == key)


def test_rubric_weights_correctness_and_skips_diagnostic_signals() -> None:
    results = {
        "conceptRecognition": _plugin("conceptRecognition").interpret({"type": "noul", "noul": 1.0}, CONTEXT, True),
        "completionTime": COMPLETION_TIME.interpret(None, CONTEXT, True),
    }

    rubric = rubric_from_signal_results(default_mcq_spec(), True, results)

    assert rubric["verdict"] == "sound"
    assert rubric["dimensions"]["correctness"]["score"] == 100.0
    assert rubric["dimensions"]["nearMiss"]["status"] == "not_applicable"
    assert "distractorMisconception" not in rubric["dimensions"]
    assert rubric["modifiers"]["completionTime"]["score"] == 100.0
    assert rubric["score"]["overall"] == 100.0
    assert rubric["signalSpec"]["modality"] == "mcq"


def test_rubric_for_a_wrong_answer_names_the_misconception() -> None:
    misconception = _plugin("distractorMisconception").interpret(
        {"type": "choice", "choice": "off_by_one", "confidence": 0.7}, CONTEXT, False
    )

    rubric = rubric_from_signal_results(default_mcq_spec(), False, {"distractorMisconception": misconception})

    assert rubric["verdict"] == "needs-work"
    assert rubric["primaryFailure"]["key"] == "correctness"
    assert rubric["primaryFailure"]["evidence"] == ["Likely misconception: off_by_one"]
    assert rubric["score"]["overall"] == 0.0


def test_pattern_tags_resolve_to_algorithm_slugs() -> None:
    assert algorithm_slug_for_tags(["skill-map", "heap-priority-queue"]) == "heap"
    assert algorithm_slug_for_tags(["dp"]) == "dynamic-programming"
    assert algorithm_slug_for_tags(["sliding-window"]) == "sliding-window"
    assert algorithm_slug_for_tags(["skill-map"]) == ""
