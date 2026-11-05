from __future__ import annotations

import pytest

from app.core.signals import SIGNAL_PLUGINS, SignalContext, applies, register_signal
from app.core.signals.base import DeterministicSignal, JevSignal
from app.core.signals.mcq import COMPLETION_TIME, DEFAULT_MCQ_SIGNAL_SPEC, get_mcq_signal_spec
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


def test_register_signal_rejects_a_different_plugin_with_the_same_key() -> None:
    duplicate = DeterministicSignal(key="completionTime", label="x", description="", compute=lambda _c, _s: (0, 0, ""))

    with pytest.raises(ValueError):
        register_signal(duplicate)


def test_mcq_spec_references_registered_plugins_and_is_stable() -> None:
    spec = get_mcq_signal_spec("sliding-window")

    assert spec.algorithm == "sliding-window"
    assert spec.signals == DEFAULT_MCQ_SIGNAL_SPEC.signals
    assert get_mcq_signal_spec(None) is DEFAULT_MCQ_SIGNAL_SPEC
    assert all(entry.key in SIGNAL_PLUGINS for entry in spec.signals)
    assert "correctness" not in {entry.key for entry in spec.signals}
    assert spec.reference()["hash"] == spec.hash() == get_mcq_signal_spec("sliding-window").hash()
    assert [item["key"] for item in spec.snapshot()["signals"]] == [entry.key for entry in spec.signals]


def test_rubric_weights_correctness_and_skips_diagnostic_signals() -> None:
    results = {
        "conceptRecognition": SIGNAL_PLUGINS["conceptRecognition"].interpret({"type": "noul", "noul": 1.0}, CONTEXT, True),
        "completionTime": COMPLETION_TIME.interpret(None, CONTEXT, True),
    }

    rubric = rubric_from_signal_results(DEFAULT_MCQ_SIGNAL_SPEC, True, results)

    assert rubric["verdict"] == "sound"
    assert rubric["dimensions"]["correctness"]["score"] == 100.0
    assert rubric["dimensions"]["nearMiss"]["status"] == "not_applicable"
    assert "distractorMisconception" not in rubric["dimensions"]
    assert rubric["modifiers"]["completionTime"]["score"] == 100.0
    assert rubric["score"]["overall"] == 100.0
    assert rubric["signalSpec"]["modality"] == "mcq"


def test_rubric_for_a_wrong_answer_names_the_misconception() -> None:
    misconception = SIGNAL_PLUGINS["distractorMisconception"].interpret(
        {"type": "choice", "choice": "off_by_one", "confidence": 0.7}, CONTEXT, False
    )

    rubric = rubric_from_signal_results(DEFAULT_MCQ_SIGNAL_SPEC, False, {"distractorMisconception": misconception})

    assert rubric["verdict"] == "needs-work"
    assert rubric["primaryFailure"]["key"] == "correctness"
    assert rubric["primaryFailure"]["evidence"] == ["Likely misconception: off_by_one"]
    assert rubric["score"]["overall"] == 0.0
