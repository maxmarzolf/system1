from __future__ import annotations

from app.models import TemplateMode
from app.core.generator import (
    TEMPLATE_MODE_ORDER,
    _clean_concise_prompt,
    _normalize_drill_difficulty,
    _pattern_slug,
    _template_mode_value,
    _normalize_inline_template_target,
    apply_specimen_tuning_to_target,
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
    assert _template_mode_value(TemplateMode.algorithm) == TemplateMode.algorithm.value
    assert _template_mode_value("PSEUDO") == TemplateMode.algorithm.value
    assert _template_mode_value("INVARIANT") == TemplateMode.algorithm.value
    assert _template_mode_value("TOTAL") == TemplateMode.algorithm.value
    assert _template_mode_value("INLINE") == TemplateMode.algorithm.value


def test_template_mode_order_contains_expected_values() -> None:
    assert TEMPLATE_MODE_ORDER == ("algorithm",)


def test_normalize_drill_difficulty_handles_aliases_and_unknowns() -> None:
    assert _normalize_drill_difficulty("easy") == "Easy"
    assert _normalize_drill_difficulty("advanced") == "Hard"
    assert _normalize_drill_difficulty("?") == "Med."


def test_inline_template_normalization_does_not_duplicate_existing_notes() -> None:
    target = (
        "def lower_bound(nums, target):\n"
        "    left, right = 0, len(nums)                  update state for next decision\n"
        "    while left < right:                         restore rule before continuing\n"
        "        mid = left + (right - left) // 2        update state for next decision\n"
        "                                                answer stays inside bounds\n"
        "        if nums[mid] < target:\n"
        "            left = mid + 1                      update state for next decision\n"
        "        else:\n"
        "            right = mid\n"
        "    return left                                 return final answer"
    )

    normalized = _normalize_inline_template_target("binary-search", target)

    assert "update state for next decision  update state for next decision" not in normalized
    assert "restore rule before continuing  restore rule before continuing" not in normalized
    assert "return final answer  return final answer" not in normalized


def test_inline_template_normalization_refines_dynamic_programming_notes() -> None:
    target = (
        "def max_non_adjacent_sum(nums):\n"
        "    if not nums:\n"
        "        return 0                                return final answer\n"
        "    take = 0                                    update state for next decision\n"
        "    skip = 0                                    update state for next decision\n"
        "    for x in nums:\n"
        "        take, skip = skip + x, max(skip, take)  update state for next decision  update state for next decision\n"
        "                                                state depends on solved states\n"
        "    return max(take, skip)                      return final answer"
    )

    normalized = _normalize_inline_template_target("dynamic-programming", target)

    assert "best if previous was taken" in normalized
    assert "best if previous was skipped" in normalized
    assert "take x or skip x" in normalized
    assert "take skip summarize processed prefix" in normalized
    assert "best of final choices" in normalized
    assert "update state for next decision" not in normalized
    assert "state depends on solved states" not in normalized


def test_inline_template_normalization_keeps_sliding_window_notes_sparse() -> None:
    target = (
        "def slide_counts(s, k):\n"
        "    if k <= 0 or k > len(s):\n"
        "        return []                                        return final answer\n"
        "    freq = {}                                            update state for next decision\n"
        "    for i in range(k):\n"
        "        ch = s[i]                                       update state for next decision\n"
        "                                                             window valid before scoring\n"
        "        freq[ch] = freq.get(ch, 0) + 1    update state for next decision\n"
        "    out = [dict(freq)]                            update state for next decision\n"
        "    for right in range(k, len(s)):\n"
        "        left = right - k                             update state for next decision\n"
        "        add = s[right]                             update state for next decision\n"
        "        rem = s[left]                               update state for next decision\n"
        "        freq[add] = freq.get(add, 0) + 1        update state for next decision\n"
        "        freq[rem] -= 1                            update state for next decision\n"
        "        if freq[rem] == 0:\n"
        "            del freq[rem]\n"
        "        out.append(dict(freq))              move through core step\n"
        "    return out                                       return final answer"
    )

    normalized = _normalize_inline_template_target("sliding-window", target)

    assert "window valid before scoring" in normalized
    assert "include entering value" in normalized
    assert "remove leaving value" in normalized
    assert "record current window" in normalized
    assert "drop zero count" in normalized
    assert "update state for next decision" not in normalized
    assert "move through core step" not in normalized
    assert "return final answer" not in normalized
    assert "ch = s[i]" in normalized
    assert "ch = s[i]" not in normalized.split("include entering value", 1)[0].splitlines()[-1]


def test_specimen_tuning_omits_hints_comments_and_renames_x_loop_value() -> None:
    target = (
        "from collections import defaultdict\n\n"
        "def longest_at_most_k_distinct(nums: list[int], k: int) -> int:\n"
        "    cnt: dict[int, int] = defaultdict(int)\n"
        "    l = 0\n"
        "    best = 0\n"
        "    for r, x in enumerate(nums):  # expand right\n"
        "        cnt[x] += 1\n"
        "        best = max(best, r - l + 1)\n"
        "    return best"
    )

    styled = apply_specimen_tuning_to_target(
        target,
        {"typeHints": "omit", "comments": "omit", "variableNames": "readable"},
    )

    assert "def longest_at_most_k_distinct(nums, k):" in styled
    assert "cnt = defaultdict(int)" in styled
    assert "# expand right" not in styled
    assert "for r, val in enumerate(nums):" in styled
    assert "cnt[val] += 1" in styled
