from __future__ import annotations

import pytest

from app.core.signals.mcq import DEFAULT_MCQ_DEFINITIONS
from app.domain.signal_definition_rules import (
    normalize_definition,
    normalize_directive,
    validate_definition,
    validate_directive,
)

ALGORITHMS = {"heap", "sliding-window"}
IMPLEMENTATIONS = {"completionTime"}


def _errors(**overrides) -> dict[str, str]:
    draft = {
        "key": "heapInvariant",
        "label": "Heap invariant",
        "scope": "heap",
        "source": "jev",
        "primitive": "choice",
        "instructions": "Which invariant did they apply?",
        "criteria": {"min_heap": "Min-heap of size k", "max_heap": None},
        "score_map": {"min_heap": 100, "max_heap": 0},
        "role": "dimension",
        "weight": 0.2,
        **overrides,
    }
    return validate_definition(normalize_definition(draft), algorithm_slugs=ALGORITHMS, implementations=IMPLEMENTATIONS)


def test_valid_choice_signal_passes() -> None:
    assert _errors() == {}


@pytest.mark.parametrize("definition", DEFAULT_MCQ_DEFINITIONS, ids=lambda d: d["key"])
def test_every_seed_definition_is_valid(definition) -> None:
    normalized = normalize_definition(definition)
    assert validate_definition(normalized, algorithm_slugs=ALGORITHMS, implementations=IMPLEMENTATIONS) == {}


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"key": "Bad Key"}, "key"),
        ({"key": "correctness"}, "key"),
        ({"label": ""}, "label"),
        ({"scope": "astrology"}, "scope"),
        ({"primitive": "ranking"}, "primitive"),
        ({"instructions": ""}, "instructions"),
        ({"criteria": {}}, "criteria"),
        ({"criteria": {f"l{i}": None for i in range(256)}, "score_map": {}}, "criteria"),
        ({"score_map": {"unknown": 50}}, "score_map"),
        ({"score_map": {"min_heap": 150}}, "score_map"),
        ({"primitive": "score", "criteria": ["only one"], "score_map": {}}, "criteria"),
        ({"primitive": "score", "criteria": ["a", "b"]}, "score_map"),
        ({"primitive": "noul", "instructions": "", "criteria": None, "score_map": {}}, "instructions"),
        ({"role": "boss"}, "role"),
        ({"axis": "vibes"}, "axis"),
        ({"applies_when": "sometimes"}, "applies_when"),
        ({"weight": 1.5}, "weight"),
        ({"source": "deterministic", "implementation": "nope"}, "implementation"),
    ],
)
def test_invalid_fields_are_reported_by_name(overrides, field) -> None:
    assert field in _errors(**overrides)


def test_normalize_forces_diagnostic_weight_and_trims() -> None:
    definition = normalize_definition(
        {
            "key": " wrongChoice ",
            "label": " Why ",
            "source": "jev",
            "primitive": "choice",
            "instructions": " Why? ",
            "criteria": {" a ": " first ", "b": ""},
            "role": "diagnostic",
            "weight": 0.7,
            "axis": "",
        }
    )

    assert definition["key"] == "wrongChoice"
    assert definition["criteria"] == {"a": "first", "b": None}
    assert definition["weight"] == 0.0
    assert definition["axis"] is None
    assert definition["scope"] == "general"


def test_deterministic_signals_drop_jev_fields() -> None:
    definition = normalize_definition(
        {"key": "pace", "label": "Pace", "source": "deterministic", "implementation": "completionTime",
         "primitive": "noul", "instructions": "ignored", "needs_correctness": True, "role": "modifier"}
    )

    assert definition["primitive"] is None
    assert definition["instructions"] == ""
    assert definition["needs_correctness"] is False
    assert validate_definition(definition, algorithm_slugs=ALGORITHMS, implementations=IMPLEMENTATIONS) == {}


def test_directive_labels_are_fixed() -> None:
    good = normalize_directive({"instructions": "Correct?", "criteria": {"1": "yes", "0": "no"}, "correctness_weight": 0.6})
    extra = normalize_directive({"instructions": "Correct?", "criteria": {"1": "yes", "0": "no", "2": "maybe"},
                                 "correctness_weight": 0.6})
    blank = normalize_directive({"instructions": "", "criteria": {"1": "yes"}, "correctness_weight": 2})

    assert validate_directive(good) == {}
    assert "criteria" in validate_directive(extra)
    assert set(validate_directive(blank)) == {"instructions", "criteria", "correctness_weight"}
