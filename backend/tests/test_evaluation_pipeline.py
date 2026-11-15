"""The evaluation pipeline, for every modality, with a fake Jev and fake stores (no database).

context → spec → Jev pass 1 → decide → Jev pass 2 → interpret → band → rubric → feedback → outcome
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import pytest

from app.contracts.catalog_ids import problem_slug_candidates
from app.core.jev import JevResponse, JevUnavailableError
from app.core.signals.defaults import default_spec
from app.models import AttemptCreate
from app.services import grading_settings_service, signal_registry_service
from app.services.evaluation import pipeline
from app.services.evaluation.context import SubmissionContextError
from app.services.evaluation.contexts import code as code_contexts
from app.services.evaluation.contexts import mcq as mcq_contexts
from app.services.evaluation.feedback import FeedbackResult
from app.services.grading_settings_service import GradingSettings

REFERENCE = """def first_occurrence(nums, target):
    left, right, result = 0, len(nums) - 1, -1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            result = mid
            right = mid - 1
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return result"""
RENAMED = REFERENCE.replace("result", "best")  # the same program structurally
REWRITTEN = REFERENCE.replace("mid = (left + right) // 2", "mid = left + (right - left) // 2")  # correct, not identical
NO_RETURN = REFERENCE.replace("\n    return result", "")
OFF_BY_ONE = REFERENCE.replace("left <= right", "left < right")


class FakeJev:
    """Answers each question from ``answers`` (by question id); records every call."""

    def __init__(self, answers: Mapping[str, dict[str, Any]] | None = None, *, fail_on: int | None = None):
        self.answers = dict(answers or {})
        self.fail_on = fail_on
        self.calls: list[tuple[Any, dict[str, Any]]] = []

    async def system_one(self, state, questions):
        self.calls.append((state, dict(questions)))
        if self.fail_on == len(self.calls):
            raise JevUnavailableError("jev_timeout", "Jev did not respond in time.")
        return JevResponse(
            model="jev-test",
            answers={key: self.answers.get(key, _default_answer(question)) for key, question in questions.items()},
            usage={"input_tokens": 10, "output_tokens": 2},
            request_id=f"req-{len(self.calls)}",
            latency_ms=150,
        )


def _default_answer(question: dict[str, Any]) -> dict[str, Any]:
    if question["type"] == "choice":
        return {"type": "choice", "choice": next(iter(question["criteria"])), "confidence": 0.9, "probabilities": {}}
    if question["type"] == "score":
        return {"type": "score", "score": 2.0, "confidence": 0.8}
    return {"type": "noul", "noul": 0.9}


def correct(label: str = "1", confidence: float = 0.95) -> dict[str, Any]:
    return {"type": "choice", "choice": label, "confidence": confidence, "probabilities": {label: confidence}}


def near_miss(score: float) -> dict[str, Any]:
    return {"type": "score", "score": score, "confidence": 0.8}


@pytest.fixture
def stores(monkeypatch):
    """Default specs instead of the database, and stores that hold what each test puts in."""
    state: dict[str, Any] = {"problems": {}, "exercises": {}, "mcq": {}, "settings": GradingSettings(feedback_modalities=frozenset())}

    async def load_spec(modality, algorithm):
        return default_spec(modality, algorithm)

    async def fetch_problem(card_ids):
        # Same id resolution as the real lookup (core catalog ids carry a prefix).
        return next((state["problems"][slug] for slug in problem_slug_candidates(card_ids) if slug in state["problems"]), None)

    async def fetch_exercise(item_id):
        return state["exercises"].get(item_id)

    async def fetch_mcq(problem_id):
        return state["mcq"].get(problem_id)

    async def settings():
        return state["settings"]

    monkeypatch.setattr(signal_registry_service, "load_spec", load_spec)
    monkeypatch.setattr(code_contexts.unified_catalog_repository, "fetch_problem_for_cards", fetch_problem)
    monkeypatch.setattr(code_contexts.exercise_repository, "fetch_exercise", fetch_exercise)
    monkeypatch.setattr(mcq_contexts, "fetch_multiple_choice_problem", fetch_mcq)
    monkeypatch.setattr(grading_settings_service, "grading_settings", settings)
    return state


def recall_body(answer: str, **overrides) -> AttemptCreate:
    return AttemptCreate.model_validate({
        "cardId": "core-algorithm-first_occurrence", "mode": "main-recall", "modality": "total-recall",
        "question": "Recall first_occurrence(nums, target).", "correctAnswer": "client copy", "userAnswer": answer,
        "elapsedMs": 30_000, "categoryTags": ["skill-map", "binary-search"], **overrides,
    })


def store_problem(stores) -> None:
    stores["problems"]["first_occurrence"] = {
        "slug": "first_occurrence", "algorithm_slug": "binary-search", "description": "Find the first index.",
        "code": REFERENCE, "missing": "# core algorithm complete", "generation_context": {},
    }


# ─── Total recall ───


async def test_total_recall_is_graded_by_jev_against_the_stored_problem(stores) -> None:
    store_problem(stores)
    jev = FakeJev({"correctness": correct("1")})
    outcome = await pipeline.evaluate(recall_body(REWRITTEN), gateway_factory=lambda: jev)

    state, questions = jev.calls[0]
    assert state == {"prompt": "Recall first_occurrence(nums, target).", "referenceSolution": REFERENCE, "submittedAnswer": REWRITTEN}
    assert {"correctness", "structure", "completeness", "patternFidelity", "searchBounds", "boundUpdate"} <= set(questions)
    assert "syntaxValid" not in questions  # deterministic signals are computed locally
    assert len(jev.calls) == 1  # no needs_correctness signals in the defaults

    evaluation = outcome.evaluation
    assert outcome.successful is True and evaluation.verdict == "sound"
    assert evaluation.correctness["source"] == "jev" and evaluation.correctness["label"] == "1"
    assert evaluation.correctness["deterministicCorrect"] is False  # a rewrite: Jev, not the exact match, decided
    assert evaluation.signalSpec.modality == "total-recall" and evaluation.signalSpec.algorithm == "binary-search"
    assert evaluation.signalResults["syntaxValid"]["score"] == 100.0
    assert evaluation.signalResults["nearMiss"]["status"] == "not_applicable"
    assert evaluation.jevTrace[0]["state"] == state and evaluation.jevTrace[0]["latencyMs"] == 150
    assert evaluation.provenance.engine == "jev" and evaluation.provenance.flags == []
    assert outcome.record.correct_answer == REFERENCE and outcome.record.problem_slug == "first_occurrence"


async def test_a_missing_return_is_incorrect_even_when_jev_says_correct(stores) -> None:
    store_problem(stores)
    jev = FakeJev({"correctness": correct("1", 0.98)})
    outcome = await pipeline.evaluate(recall_body(NO_RETURN), gateway_factory=lambda: jev)

    evaluation = outcome.evaluation
    assert outcome.successful is False
    assert evaluation.correctness["source"] == "deterministic-override"
    assert evaluation.correctness["overrides"] == [{"key": "no_return", "message": "The reference returns a value, but the answer never does."}]
    assert "deterministic_override" in evaluation.provenance.flags
    assert "The reference returns a value, but the answer never does." in evaluation.primaryFailure.evidence
    assert len(jev.calls) == 1  # Jev was still asked: its signals are recorded


@pytest.mark.parametrize(
    ("answer", "reason"),
    [("", "empty"), ("def first_occurrence(nums, target):\n    pass", "empty"), ("def broken(:", "syntax")],
)
async def test_empty_and_unparseable_answers_are_overridden(stores, answer, reason) -> None:
    store_problem(stores)
    outcome = await pipeline.evaluate(recall_body(answer), gateway_factory=lambda: FakeJev({"correctness": correct("1")}))
    assert outcome.successful is False
    assert [item["key"] for item in outcome.evaluation.correctness["overrides"]] == [reason]


@pytest.mark.parametrize(("score", "verdict"), [(2.0, "close"), (1.5, "close"), (1.0, "needs-work"), (0.0, "needs-work")])
async def test_wrong_answers_are_banded_by_near_miss(stores, score, verdict) -> None:
    store_problem(stores)
    jev = FakeJev({"correctness": correct("0"), "nearMiss": near_miss(score), "errorPattern": correct("wrong_condition")})
    outcome = await pipeline.evaluate(recall_body(OFF_BY_ONE), gateway_factory=lambda: jev)
    assert outcome.successful is False and outcome.evaluation.verdict == verdict
    assert outcome.evaluation.signalResults["nearMiss"]["score"] == score / 2 * 100
    assert "What went wrong: wrong_condition" in outcome.evaluation.primaryFailure.evidence


async def test_the_near_miss_threshold_is_a_setting(stores) -> None:
    store_problem(stores)
    stores["settings"] = GradingSettings(feedback_modalities=frozenset(), near_miss_threshold=40)
    jev = FakeJev({"correctness": correct("0"), "nearMiss": near_miss(1.0)})
    outcome = await pipeline.evaluate(recall_body(OFF_BY_ONE), gateway_factory=lambda: jev)
    assert outcome.evaluation.verdict == "close"


async def test_when_jev_is_down_the_exact_structural_match_decides(stores) -> None:
    store_problem(stores)
    exact = await pipeline.evaluate(recall_body(RENAMED), gateway_factory=lambda: FakeJev(fail_on=1))
    rewritten = await pipeline.evaluate(recall_body(REWRITTEN), gateway_factory=lambda: FakeJev(fail_on=1))

    assert exact.successful is True and rewritten.successful is False
    evaluation = rewritten.evaluation
    assert evaluation.correctness["source"] == "deterministic-fallback"
    assert "jev_unavailable" in evaluation.provenance.flags and evaluation.provenance.engine == "deterministic"
    assert evaluation.signalResults["structure"]["status"] == "unavailable"
    assert evaluation.signalResults["syntaxValid"]["status"] == "scored"
    assert rewritten.feedback_unavailable == {"code": "jev_timeout", "message": "Jev did not respond in time.", "provider": "jev"}
    assert evaluation.jevTrace is None


async def test_missing_jev_key_also_falls_back(stores) -> None:
    store_problem(stores)

    def no_key():
        raise JevUnavailableError("jev_missing_api_key", "TYPESAFE_API_KEY is not configured.")

    outcome = await pipeline.evaluate(recall_body(REFERENCE), gateway_factory=no_key)
    assert outcome.successful is True and outcome.evaluation.correctness["source"] == "deterministic-fallback"


async def test_without_a_stored_problem_the_browser_reference_is_used_and_flagged(stores) -> None:
    jev = FakeJev({"correctness": correct("1")})
    outcome = await pipeline.evaluate(recall_body(REFERENCE, correctAnswer=REFERENCE), gateway_factory=lambda: jev)
    assert jev.calls[0][0]["referenceSolution"] == REFERENCE
    assert outcome.evaluation.provenance.flags == ["reference_from_client"]
    assert outcome.record.problem_slug is None
    assert outcome.evaluation.signalSpec.algorithm == "binary-search"  # from the tags

    with pytest.raises(SubmissionContextError):
        await pipeline.evaluate(recall_body(REFERENCE, correctAnswer=""), gateway_factory=lambda: jev)


def test_recall_reference_prefers_the_generated_target_and_fills_the_missing_step() -> None:
    assert code_contexts.recall_reference({"code": "a = 1\n{{missing}}", "missing": "return a"}) == "a = 1\nreturn a"
    assert code_contexts.recall_reference({
        "code": "ignored", "missing": "x", "generation_context": {"templateTargets": {"algorithm": "def f():\n    {{missing}}"}},
    }) == "def f():\n    x"
    assert code_contexts.recall_reference({"code": REFERENCE, "missing": "# core algorithm complete"}) == REFERENCE


async def test_feedback_is_written_from_jevs_result_for_configured_modalities(stores, monkeypatch) -> None:
    store_problem(stores)
    stores["settings"] = GradingSettings(feedback_modalities=frozenset({"total-recall"}))
    seen: dict[str, Any] = {}

    async def write_feedback(context, *, verdict, successful, results, requested_provider):
        seen.update(verdict=verdict, successful=successful, keys=set(results), provider=requested_provider)
        return FeedbackResult({"fullFeedback": "Close: one bound is off."}, provider="claude")

    monkeypatch.setattr(pipeline, "write_feedback", write_feedback)
    jev = FakeJev({"correctness": correct("0"), "nearMiss": near_miss(2.0)})
    outcome = await pipeline.evaluate(recall_body(OFF_BY_ONE, llmProvider="claude"), gateway_factory=lambda: jev)

    assert seen == {"verdict": "close", "successful": False, "keys": seen["keys"], "provider": "claude"}
    assert "nearMiss" in seen["keys"]
    assert outcome.evaluation.feedback == {"fullFeedback": "Close: one bound is off."}
    assert outcome.evaluation.provenance.feedbackProvider == "claude"


async def test_failed_feedback_keeps_the_grade_and_is_flagged(stores, monkeypatch) -> None:
    store_problem(stores)
    stores["settings"] = GradingSettings(feedback_modalities=frozenset({"total-recall"}))

    async def write_feedback(*_args, **_kwargs):
        return FeedbackResult({}, error="feedback_unavailable")

    monkeypatch.setattr(pipeline, "write_feedback", write_feedback)
    outcome = await pipeline.evaluate(recall_body(REFERENCE), gateway_factory=lambda: FakeJev({"correctness": correct("1")}))
    assert outcome.successful is True and outcome.evaluation.feedback == {}
    assert outcome.evaluation.provenance.flags == ["feedback_unavailable"]


# ─── Ghost reps ───


def ghost_body(answer: str, target: str = REFERENCE) -> AttemptCreate:
    return AttemptCreate.model_validate({
        "cardId": "core-algorithm-first_occurrence", "mode": "main-recall", "modality": "ghost-rep",
        "correctAnswer": target, "userAnswer": answer, "elapsedMs": 20_000, "categoryTags": ["binary-search"],
    })


async def test_ghost_reps_never_call_jev(stores) -> None:
    def no_jev():
        raise AssertionError("ghost reps must not call Jev")

    typed = await pipeline.evaluate(ghost_body(REFERENCE + "\n"), gateway_factory=no_jev)
    slipped = await pipeline.evaluate(ghost_body(OFF_BY_ONE), gateway_factory=no_jev)
    targeted = await pipeline.evaluate(ghost_body("        else:\n            right = mid - 1", "        else:\n            right = mid - 1"), gateway_factory=no_jev)

    assert typed.successful is True and typed.evaluation.verdict == "sound"
    assert slipped.successful is False and slipped.evaluation.verdict == "needs-work"
    assert targeted.successful is True  # a line subset that doesn't parse on its own
    assert typed.evaluation.correctness["source"] == "deterministic"
    assert typed.evaluation.provenance.engine == "deterministic" and typed.evaluation.jevTrace is None
    assert typed.evaluation.signalResults["structuralMatch"]["score"] == 100.0
    assert slipped.evaluation.signalResults["structuralMatch"]["raw"] is False


# ─── Microdrills ───

TEMPLATE = "def window(nums, k):\n    total = ___\n    return ___"
DRILL_SOLUTION = "def window(nums, k):\n    total = sum(nums[:k])\n    return total"


def drill_body(answer: str, item_id: str | None = "microdrill-1") -> AttemptCreate:
    return AttemptCreate.model_validate({
        "cardId": "card-1", "mode": "main-recall", "modality": "microdrill", "exerciseId": item_id,
        "correctAnswer": "client copy", "userAnswer": answer, "elapsedMs": 9_000, "categoryTags": ["sliding-window"],
    })


def store_drill(stores) -> None:
    stores["exercises"]["microdrill-1"] = {
        "id": "microdrill-1", "modality": "microdrill", "algorithmSlug": "sliding-window", "prompt": "Fill the window.",
        "reference": DRILL_SOLUTION, "metadata": {"template": TEMPLATE, "answers": ["sum(nums[:k])", "total"]},
        "generationTrace": [], "createdAt": "",
    }


async def test_microdrills_are_graded_against_the_stored_exercise(stores) -> None:
    store_drill(stores)
    jev = FakeJev({"correctness": correct("1")})
    half_right = DRILL_SOLUTION.replace("sum(nums[:k])", "sum(nums[0:k])")
    outcome = await pipeline.evaluate(drill_body(half_right), gateway_factory=lambda: jev)

    state = jev.calls[0][0]
    assert state["template"] == TEMPLATE and state["expectedBlanks"] == ["sum(nums[:k])", "total"]
    assert state["referenceSolution"] == DRILL_SOLUTION and state["prompt"] == "Fill the window."
    assert outcome.successful is True  # an equivalent blank is still correct
    assert outcome.evaluation.signalResults["blankAccuracy"]["score"] == 50.0
    assert outcome.record.exercise_id == "microdrill-1" and outcome.record.correct_answer == DRILL_SOLUTION


async def test_microdrill_fallback_accepts_exact_blanks(stores) -> None:
    store_drill(stores)
    exact = await pipeline.evaluate(drill_body(DRILL_SOLUTION), gateway_factory=lambda: FakeJev(fail_on=1))
    wrong = await pipeline.evaluate(drill_body(DRILL_SOLUTION.replace("return total", "return k")), gateway_factory=lambda: FakeJev(fail_on=1))
    assert exact.successful is True and wrong.successful is False


async def test_unknown_or_mismatched_exercises_are_rejected(stores) -> None:
    store_drill(stores)
    stores["exercises"]["ladder-9"] = {**stores["exercises"]["microdrill-1"], "id": "ladder-9", "modality": "ladder"}
    with pytest.raises(SubmissionContextError) as unknown:
        await pipeline.evaluate(drill_body(DRILL_SOLUTION, "nope"), gateway_factory=FakeJev)
    with pytest.raises(SubmissionContextError):
        await pipeline.evaluate(drill_body(DRILL_SOLUTION, "ladder-9"), gateway_factory=FakeJev)
    assert unknown.value.code == "microdrill_unknown_item"


# ─── Ladder rungs ───


def ladder_body(answer: str, item_id: str | None = "ladder-1", **overrides) -> AttemptCreate:
    return AttemptCreate.model_validate({
        "cardId": "card-1", "mode": "main-recall", "modality": "ladder", "exerciseId": item_id,
        "userAnswer": answer, "elapsedMs": 40_000, "categoryTags": ["sliding-window"], **overrides,
    })


RUNG = "def add_char(counts, ch):\n    counts[ch] = counts.get(ch, 0) + 1\n    return counts"


async def test_ladder_rungs_are_their_own_modality(stores) -> None:
    stores["exercises"]["ladder-1"] = {
        "id": "ladder-1", "modality": "ladder", "algorithmSlug": "sliding-window", "prompt": "Add a character.",
        "reference": RUNG, "metadata": {"starterCode": "def add_char(counts, ch):\n    pass"}, "generationTrace": [], "createdAt": "",
    }
    jev = FakeJev({"correctness": correct("1")})
    outcome = await pipeline.evaluate(ladder_body(RUNG), gateway_factory=lambda: jev)
    assert jev.calls[0][0]["starterCode"] == "def add_char(counts, ch):\n    pass"
    assert outcome.evaluation.signalSpec.modality == "ladder" and outcome.successful is True

    legacy = await pipeline.evaluate(ladder_body(RUNG, None, correctAnswer=RUNG), gateway_factory=lambda: FakeJev({"correctness": correct("1")}))
    assert legacy.evaluation.provenance.flags == ["reference_from_client"]


# ─── MCQ ───


def store_mcq(stores) -> None:
    stores["mcq"]["mcq-1"] = {
        "id": "mcq-1", "question": "When does a sliding window shrink?", "explanation": "",
        "choices": [{"id": "A", "text": "While invalid"}, {"id": "B", "text": "Never"}],
        "correctChoiceId": "A", "algorithmSlug": "sliding-window",
    }


def mcq_body(choice: str) -> AttemptCreate:
    return AttemptCreate.model_validate({
        "cardId": "mcq-1", "mode": "main-recall", "modality": "mcq", "multipleChoiceProblemId": "mcq-1",
        "selectedChoiceId": choice, "elapsedMs": 8_000, "categoryTags": [],
    })


async def test_mcq_goes_through_the_same_pipeline(stores) -> None:
    store_mcq(stores)
    jev = FakeJev({"correctness": correct("1")})
    outcome = await pipeline.evaluate(mcq_body("A"), gateway_factory=lambda: jev)
    assert outcome.successful is True
    assert outcome.evaluation.correctness["answerKeyAgreement"] is True
    assert outcome.record.multiple_choice_problem_id == "mcq-1" and outcome.record.user_answer == "A. While invalid"
    assert jev.calls[0][0]["submittedAnswer"] == {"id": "A", "text": "While invalid"}


async def test_mcq_flags_disagreement_and_low_confidence_and_falls_back_to_the_key(stores) -> None:
    store_mcq(stores)
    disagree = await pipeline.evaluate(mcq_body("B"), gateway_factory=lambda: FakeJev({"correctness": correct("1", 0.4)}))
    assert disagree.successful is True
    assert {"answer_key_disagreement", "low_correctness_confidence"} <= set(disagree.evaluation.provenance.flags)

    down = await pipeline.evaluate(mcq_body("B"), gateway_factory=lambda: FakeJev(fail_on=1))
    assert down.successful is False and down.evaluation.correctness["source"] == "deterministic-fallback"
    assert down.evaluation.signalResults["completionTime"]["status"] == "scored"


async def test_needs_correctness_signals_go_in_a_second_pass(stores, monkeypatch) -> None:
    store_mcq(stores)
    base = default_spec("mcq", "sliding-window")

    async def load_spec(modality, algorithm):
        from dataclasses import replace

        signals = tuple(
            replace(entry, plugin=replace(entry.plugin, needs_correctness=True)) if entry.plugin.key == "nearMiss" else entry
            for entry in base.signals
        )
        return replace(base, signals=signals)

    monkeypatch.setattr(signal_registry_service, "load_spec", load_spec)
    jev = FakeJev({"correctness": correct("0")})
    outcome = await pipeline.evaluate(mcq_body("B"), gateway_factory=lambda: jev)
    assert len(jev.calls) == 2
    assert "nearMiss" not in jev.calls[0][1] and set(jev.calls[1][1]) == {"nearMiss"}
    assert jev.calls[1][0]["answeredCorrectly"] == 0
    assert len(outcome.evaluation.jevTrace) == 2

    jev_second_fails = FakeJev({"correctness": correct("0")}, fail_on=2)
    partial = await pipeline.evaluate(mcq_body("B"), gateway_factory=lambda: jev_second_fails)
    assert partial.evaluation.signalResults["nearMiss"]["status"] == "unavailable"
    assert partial.evaluation.signalResults["conceptRecognition"]["status"] == "scored"


# ─── Every modality, one shape ───


@pytest.mark.parametrize("modality", ["mcq", "total-recall", "ghost-rep", "microdrill", "ladder"])
async def test_every_modality_produces_the_same_evaluation_shape(stores, modality) -> None:
    store_problem(stores)
    store_drill(stores)
    store_mcq(stores)
    stores["exercises"]["ladder-1"] = {**stores["exercises"]["microdrill-1"], "id": "ladder-1", "modality": "ladder", "reference": RUNG}
    body = {
        "mcq": mcq_body("A"),
        "total-recall": recall_body(REFERENCE),
        "ghost-rep": ghost_body(REFERENCE),
        "microdrill": drill_body(DRILL_SOLUTION),
        "ladder": ladder_body(RUNG),
    }[modality]
    outcome = await pipeline.evaluate(body, gateway_factory=lambda: FakeJev({"correctness": correct("1")}))
    stored = outcome.evaluation.to_stored()
    assert {"verdict", "signalSpec", "score", "primaryFailure", "dimensions", "modifiers", "correctness", "signalResults",
            "signalSpecSnapshot", "provenance"} <= set(stored)
    assert stored["signalSpec"]["modality"] == modality and stored["signalSpec"]["hash"]
    assert stored["dimensions"]["correctness"]["score"] == 100.0
    assert stored["verdict"] == "sound" and outcome.successful is True
    assert set(stored["score"]) >= {"overall", "conceptual", "fidelity", "executable", "fluency"}


def test_context_builders_cover_every_modality() -> None:
    pipeline.CONTEXT_BUILDERS.clear()
    assert {modality: type(pipeline.context_builder(modality)).__name__ for modality in default_spec.__globals__["MODALITIES"]} == {
        "mcq": "McqContextBuilder",
        "total-recall": "TotalRecallContextBuilder",
        "ghost-rep": "GhostRepContextBuilder",
        "microdrill": "MicrodrillContextBuilder",
        "ladder": "LadderContextBuilder",
    }
    with pytest.raises(LookupError):
        pipeline.context_builder("nope")
