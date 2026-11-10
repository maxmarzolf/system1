"""The stored-evaluation contract: building, storing and reading back."""

from __future__ import annotations

import json

from app.contracts.coerce import coerce_json_object, score_value
from app.contracts.evaluation import (
    EVALUATION_VERSION,
    Evaluation,
    build_evaluation,
    compact_evaluation,
    evaluation_feedback,
    outcome_evaluation,
)


class Spec:
    def __init__(self, reference: dict):
        self._reference = reference

    def reference(self) -> dict:
        return self._reference


RECALL = Spec({"algorithm": "binary-search", "version": 2})
MCQ = Spec({"algorithm": "heap", "version": 1, "modality": "mcq", "hash": "abc"})


def test_built_evaluations_round_trip_through_storage() -> None:
    evaluation = build_evaluation(
        {
            "verdict": "needs-work",
            "score": {"overall": "62.44", "custom": 7},
            "primaryFailure": {"key": "bounds", "label": "Bounds", "evidence": ["a", "b", "c"]},
            "dimensions": {"bounds": {"label": "Bounds", "status": "fail", "score": 30, "evidence": ["x"]}},
            "modifiers": {"syntax": {"status": "not_applicable"}, "junk": "not a dict"},
            "recommendedAction": " Fix bounds. ",
        },
        MCQ,
        {"diagnosis": "d", "submissionRubric": {}, "llmUsed": True, "llmProvider": "x", "signals": {}},
        provider="openai",
        llm_used=True,
    )
    stored = evaluation.to_stored()
    assert stored["version"] == EVALUATION_VERSION
    assert stored["signalSpec"] == {"algorithm": "heap", "version": 1, "modality": "mcq", "hash": "abc"}
    assert stored["score"]["overall"] == 62.4
    assert stored["score"]["custom"] == 7.0
    assert stored["score"]["fluency"] == 0.0
    assert stored["primaryFailure"]["evidence"] == ["a", "b"]
    assert stored["feedback"] == {"diagnosis": "d"}
    assert stored["recommendedAction"] == "Fix bounds."
    assert stored["provenance"] == {"llmUsed": True, "provider": "openai", "source": "assessor-narrator"}
    assert set(stored["modifiers"]) == {"syntax"}
    assert stored["modifiers"]["syntax"]["label"] == "Syntax"
    assert "correctness" not in stored  # Jev-only fields are left out when unset

    loaded = Evaluation.from_stored(json.dumps(stored))
    assert loaded is not None and loaded.to_stored() == stored


def test_recall_references_omit_mcq_fields_and_provider_is_hidden_without_llm() -> None:
    stored = build_evaluation({}, RECALL, provider="openai", llm_used=False).to_stored()
    assert stored["signalSpec"] == {"algorithm": "binary-search", "version": 2}
    assert stored["provenance"]["provider"] == ""
    assert stored["verdict"] == "needs-work"


def test_outcome_evaluations_score_all_or_nothing() -> None:
    sound = outcome_evaluation(True, RECALL, llm_used=True, provider="claude", source="semantic-evaluator")
    assert sound.sound and sound.score["overall"] == 100.0 and sound.score["fluency"] == 0.0
    assert sound.provenance.provider == "claude"
    assert outcome_evaluation(False, RECALL).score["overall"] == 0.0


def test_readers_tolerate_missing_and_malformed_evaluations() -> None:
    assert Evaluation.from_stored(None) is None
    assert Evaluation.from_stored("not json") is None
    assert Evaluation.from_stored({}) is None
    assert Evaluation.from_stored({"jevTrace": "not a list"}) is None
    legacy = Evaluation.from_stored({"verdict": "sound", "signalSpec": {"algorithm": "default", "version": "x"}})
    assert legacy is not None and legacy.signalSpec.version == 0
    assert evaluation_feedback({"feedback": {"primaryFocus": "p"}}) == {"primaryFocus": "p"}
    assert evaluation_feedback(Evaluation(feedback={"a": 1})) == {"a": 1}
    assert evaluation_feedback(None) == {}
    assert compact_evaluation(None) == {}


def test_scored_entries_skip_unscored_signals_and_keep_spec_order() -> None:
    evaluation = Evaluation.model_validate({
        "dimensions": {"b": {"status": "pass", "score": 90}, "a": {"status": "not_applicable"}},
        "modifiers": {"c": {"status": "partial", "score": "55.56"}},
    })
    assert [key for key, _ in evaluation.entries()] == ["b", "a", "c"]
    assert [(key, entry.score) for key, entry in evaluation.scored_entries()] == [("b", 90.0), ("c", 55.6)]
    compact = evaluation.compact()
    assert set(compact) == {"verdict", "signalSpec", "score", "primaryFailure", "dimensions", "modifiers", "recommendedAction"}


def test_evaluators_can_attach_their_own_fields() -> None:
    evaluation = Evaluation()
    evaluation.correctness = {"label": "1"}
    evaluation.signalResults = {"x": {"score": 1}}
    evaluation.jevTrace = [{"requestId": "r"}]
    evaluation.provenance.engine = "jev"
    evaluation.custom = "kept"
    stored = evaluation.to_stored()
    assert stored["correctness"] == {"label": "1"}
    assert stored["provenance"]["engine"] == "jev"
    assert stored["custom"] == "kept"


def test_coercion_helpers() -> None:
    assert coerce_json_object('{"a": 1}') == {"a": 1}
    assert coerce_json_object("[1]") == {}
    assert coerce_json_object(3) == {}
    assert score_value("12.345") == 12.3
    assert score_value("x") == 0.0
    assert score_value(None) == 0.0
