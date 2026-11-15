from __future__ import annotations

import pytest

from app.core.signal_catalog import (
    BINARY_SEARCH_SIGNAL_SPEC,
    DEFAULT_SIGNAL_SPEC,
    SIGNAL_SPECS,
    SLIDING_WINDOW_SIGNAL_SPEC,
    get_signal_spec,
    spec_from_json,
    spec_to_json,
)
from app.core.taxonomy_catalog import ALGORITHMS

ALL_SPECS = [DEFAULT_SIGNAL_SPEC, *SIGNAL_SPECS.values()]


@pytest.mark.parametrize("spec", ALL_SPECS, ids=lambda spec: spec.algorithm)
def test_spec_keys_are_unique_and_weights_positive(spec) -> None:
    assert len(set(spec.keys)) == len(spec.keys)
    assert all(signal.weight > 0 for signal in spec.signals)
    assert all(signal.guidance and signal.variation_strategy for signal in spec.signals)
    assert any(signal.role == "dimension" for signal in spec.signals)


@pytest.mark.parametrize("spec", ALL_SPECS, ids=lambda spec: spec.algorithm)
def test_each_axis_is_owned_by_at_most_one_signal(spec) -> None:
    axes = [signal.axis for signal in spec.signals if signal.axis]
    assert len(axes) == len(set(axes))
    assert {"fidelity", "executable", "fluency"} == set(axes)


def test_spec_algorithms_are_catalog_groups() -> None:
    assert set(SIGNAL_SPECS) <= set(ALGORITHMS)


def test_every_catalog_group_resolves_to_a_spec() -> None:
    for slug in ALGORITHMS:
        spec = get_signal_spec(slug)
        assert spec.algorithm in {slug, DEFAULT_SIGNAL_SPEC.algorithm}
    assert get_signal_spec(None) is DEFAULT_SIGNAL_SPEC
    assert get_signal_spec("not-a-group") is DEFAULT_SIGNAL_SPEC


@pytest.mark.parametrize("spec", ALL_SPECS, ids=lambda spec: spec.algorithm)
def test_spec_json_round_trip(spec) -> None:
    assert spec_from_json(spec_to_json(spec)) == spec


def test_spec_from_json_rejects_malformed_payloads() -> None:
    assert spec_from_json({}) is None
    assert spec_from_json({"signals": []}) is None
    assert spec_from_json({"algorithm": "x", "version": 1, "signals": [{"key": "a"}]}) is None
