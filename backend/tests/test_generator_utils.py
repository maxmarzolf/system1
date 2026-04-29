from __future__ import annotations

from app.models import TemplateMode
from app.routers.generator import (
    TEMPLATE_MODE_ORDER,
    _clean_concise_prompt,
    _normalize_drill_difficulty,
    _pattern_slug,
    _template_mode_value,
)


def test_pattern_slug_normalizes_common_variants() -> None:
    assert _pattern_slug("Sliding Window") == "sliding-window"
    assert _pattern_slug("Binary/Search") == "binary-search"
    assert _pattern_slug("A & B") == "a-b"


def test_pattern_slug_is_stable() -> None:
    slug = _pattern_slug("Graph Traversal")
    assert _pattern_slug(slug) == slug


def test_clean_concise_prompt_truncates_on_word_boundary() -> None:
    text = "This is a very long prompt that should be shortened for concise output behavior"
    compact = _clean_concise_prompt(text, max_chars=40)
    assert compact.endswith("...")
    assert len(compact) <= 43


def test_clean_concise_prompt_normalizes_whitespace() -> None:
    assert _clean_concise_prompt(" Recall   the\tpattern ", max_chars=80) == "Recall the pattern"


def test_template_mode_value_defaults_to_algorithm() -> None:
    assert _template_mode_value(None) == TemplateMode.algorithm.value
    assert _template_mode_value("unknown") == TemplateMode.algorithm.value


def test_template_mode_value_accepts_enum_and_casefolds_strings() -> None:
    assert _template_mode_value(TemplateMode.pseudo) == TemplateMode.pseudo.value
    assert _template_mode_value("INVARIANT") == TemplateMode.invariant.value


def test_template_mode_order_contains_expected_values() -> None:
    assert TEMPLATE_MODE_ORDER == ("pseudo", "invariant", "algorithm")


def test_normalize_drill_difficulty_handles_aliases_and_unknowns() -> None:
    assert _normalize_drill_difficulty("easy") == "Easy"
    assert _normalize_drill_difficulty("advanced") == "Hard"
    assert _normalize_drill_difficulty("?") == "Med."
