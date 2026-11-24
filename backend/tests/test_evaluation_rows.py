"""Splitting an evaluation into rows and joining it back is lossless, whatever the JSON holds."""

from __future__ import annotations

import pytest

from app.contracts.evaluation_rows import (
    CORRECTNESS_KEY,
    DefinitionRef,
    UnknownSignal,
    join_evaluation,
    same,
    signal_keys,
    signal_value,
    split_evaluation,
)


def _definitions(data: dict, source: str = "jev") -> dict[str, DefinitionRef]:
    return {key: DefinitionRef(id=index, version=2, weight=0.25, source=source) for index, key in enumerate(signal_keys(data), 1)}


def _round_trip(data: dict) -> tuple[dict, list[dict]]:
    evaluation, signals = split_evaluation(data, _definitions(data))
    signals = [{**row, "key": row["key"]} for row in signals]
    assert same(join_evaluation(evaluation, signals), data)
    return evaluation, signals


def test_same_tells_types_apart() -> None:
    assert same({"a": [1, {"b": True}]}, {"a": [1, {"b": True}]})
    assert not same(1, 1.0)
    assert not same(True, 1)
    assert not same({"a": 1}, {"a": 1, "b": 2})
    assert not same([1], [1, 2])


def test_signal_values_keep_their_type() -> None:
    data = {"signalResults": {
        key: {"key": key, "label": key, "role": "dimension", "status": "scored", "raw": raw, "score": 50.0,
              "confidence": None, "note": ""}
        for key, raw in (("text", "Near"), ("integer", 3), ("number", 2.5), ("boolean", False), ("none", None))
    }}
    _, signals = _round_trip(data)
    by_key = {row["key"]: row for row in signals}
    assert [by_key[key]["value_kind"] for key in ("text", "integer", "number", "boolean", "none")] == [
        "text", "integer", "number", "boolean", "null"]
    assert signal_value(by_key["integer"]) == 3 and isinstance(signal_value(by_key["integer"]), int)
    assert signal_value(by_key["boolean"]) is False
    assert signal_value({"value_kind": "integer", "value_number": None}) is None
    # Only one value column is ever set.
    assert all(sum(row[c] is not None for c in ("value_text", "value_number", "value_boolean")) <= 1 for row in signals)


def test_values_the_columns_cannot_hold_are_kept_verbatim() -> None:
    data = {
        "version": "one",  # not an int
        "score": {"overall": "high"},  # not a number
        "dimensions": {"a": {"key": "a", "status": "pass", "score": 90, "evidence": ["x"], "missing": ["y"], "why": "z"}},
        "modifiers": {"a": {"key": "a", "status": "fail", "score": 10.0}},  # the same key again
        "signalResults": {"b": {"key": "b", "role": "mystery", "status": "pending", "raw": [1, 2], "score": "?"}},
        "provenance": {"flags": "not-a-list", "llmUsed": True},
        "somethingNew": {"kept": True},
    }
    evaluation, signals = _round_trip(data)
    assert evaluation["extra"]["overrides"].keys() >= {"version", "score", "modifiers", "somethingNew"}
    by_key = {row["key"]: row for row in signals}
    assert by_key["a"]["extra"]["rubric"]["missing"] == ["y"]  # the rubric entry is kept whole
    assert (by_key["b"]["role"], by_key["b"]["status"], by_key["b"]["value_kind"]) == ("dimension", "not_applicable", "null")
    assert by_key["b"]["extra"]["result"]["role"] == "mystery"


def test_an_evaluation_without_a_rubric_or_signals_round_trips() -> None:
    evaluation, signals = _round_trip({"version": 1, "feedback": {"why": "x"}, "provenance": {}, "signalSpec": {"algorithm": "a", "version": 1}})
    assert signals == [] and evaluation["has_rubric"] is False and evaluation["extra"] is None
    _, empty = _round_trip({"version": 1, "dimensions": {}, "modifiers": {}})
    assert empty == []


def test_correctness_without_a_rubric_entry_still_gets_its_row() -> None:
    data = {"correctness": {"source": "deterministic-fallback", "deterministicCorrect": True}}
    evaluation, signals = _round_trip(data)
    (row,) = signals
    assert (row["key"], row["role"], row["source"], row["rubric_placement"], row["in_results"]) == (
        CORRECTNESS_KEY, CORRECTNESS_KEY, "deterministic", None, False)
    assert evaluation["correctness_extra"] == {"deterministicCorrect": True}


@pytest.mark.parametrize(("provenance", "correctness", "expected"), [
    ({"engine": "jev", "model": "jev-1"}, {"source": "jev"}, ("jev", "jev-1")),
    ({"engine": "jev"}, {"source": "deterministic-override"}, ("deterministic", None)),
    ({"engine": "answer-key"}, None, ("answer-key", None)),
    ({"llmUsed": True, "provider": "claude"}, None, ("llm-grader", "claude")),
    ({}, None, ("deterministic", None)),
])
def test_correctness_source(provenance: dict, correctness: dict | None, expected: tuple) -> None:
    data = {"dimensions": {"correctness": {"key": "correctness", "label": "C", "status": "pass", "score": 100.0,
                                           "evidence": [], "missing": []}},
            "modifiers": {}, "provenance": provenance, **({"correctness": correctness} if correctness else {})}
    _, signals = _round_trip(data)
    assert (signals[0]["source"], signals[0]["model"]) == expected


def test_weights_come_from_the_spec_snapshot_when_it_has_them() -> None:
    data = {
        "dimensions": {"a": {"key": "a", "label": "A", "status": "pass", "score": 80.0, "evidence": [], "missing": []},
                       "b": {"key": "b", "label": "B", "status": "pass", "score": 80.0, "evidence": [], "missing": []}},
        "modifiers": {},
        "signalSpecSnapshot": {"signals": [{"key": "a", "weight": 0.4}, {"key": "x"}], "correctnessWeight": "n/a"},
    }
    _, signals = _round_trip(data)
    assert [(row["key"], row["weight"]) for row in signals] == [("a", 0.4), ("b", 0.25)]


def test_a_key_without_a_definition_is_refused() -> None:
    with pytest.raises(UnknownSignal):
        split_evaluation({"dimensions": {"ghost": {"status": "pass", "score": 1.0}}, "modifiers": {}}, {})
