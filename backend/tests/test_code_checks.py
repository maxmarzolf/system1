"""Static checks on submitted Python (``app/core/code_checks.py``). Nothing is executed."""

from __future__ import annotations

import pytest

from app.core import code_checks

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
    return result
"""
RENAMED = REFERENCE.replace("left", "lo").replace("right", "hi").replace("result", "best").replace("first_occurrence", "find")
COMMENTED = "# from memory\n" + REFERENCE.replace("    return result", "    # done\n\n    return result")
NO_RETURN = REFERENCE.replace("    return result\n", "")


@pytest.mark.parametrize(
    ("code", "expected"),
    [(REFERENCE, True), ("def f(:\n    pass", False), ("", False), ("   \n", False), (None, False)],
)
def test_parses(code, expected) -> None:
    assert code_checks.parses(code) is expected


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("", True),
        ("   ", True),
        ("def f(nums):\n    pass", True),
        ('def f(nums):\n    """todo"""\n    pass', True),
        ("def f(nums):\n    return nums", False),
        ("x = 1", False),
        ("def f(:", False),  # unparseable code is not "blank"; parses() reports it
    ],
)
def test_is_blank(code, expected) -> None:
    assert code_checks.is_blank(code) is expected


def test_returns_value_ignores_bare_and_none_returns() -> None:
    assert code_checks.returns_value(REFERENCE)
    assert code_checks.returns_value("f = lambda x: x + 1")
    assert not code_checks.returns_value(NO_RETURN)
    assert not code_checks.returns_value("def f():\n    return")
    assert not code_checks.returns_value("def f():\n    return None")
    assert not code_checks.returns_value("def f(:")


def test_missing_return_needs_a_returning_reference_and_a_parseable_answer() -> None:
    assert code_checks.missing_return(REFERENCE, NO_RETURN)
    assert not code_checks.missing_return(REFERENCE, REFERENCE)
    assert not code_checks.missing_return("def f(xs):\n    xs.sort()", "def f(xs):\n    xs.reverse()")
    assert not code_checks.missing_return(REFERENCE, "def f(:")  # syntax is reported separately


def test_structural_match_ignores_names_comments_and_blank_lines() -> None:
    assert code_checks.structural_match(REFERENCE, RENAMED)
    assert code_checks.structural_match(REFERENCE, COMMENTED)
    assert not code_checks.structural_match(REFERENCE, NO_RETURN)
    assert not code_checks.structural_match(REFERENCE, REFERENCE.replace("<=", "<"))
    assert not code_checks.structural_match("def f(:", "def f(:")
    assert code_checks.canonical_form("def f(:") is None


def test_structural_similarity_orders_answers_by_closeness() -> None:
    exact = code_checks.structural_similarity(REFERENCE, RENAMED)
    close = code_checks.structural_similarity(REFERENCE, NO_RETURN)
    far = code_checks.structural_similarity(REFERENCE, "def f(x):\n    return sorted(x)")
    assert exact == 1.0 and 0 < far < close < exact
    assert code_checks.structural_similarity(REFERENCE, "") == 0.0
    assert 0 < code_checks.structural_similarity(REFERENCE, "def broken(:\n    left = 0") < 1


TEMPLATE = "def window(nums, k):\n    total = ___\n    for i in range(k, len(nums)):\n        total += ___\n    return total"


def test_filled_blanks_reads_each_blank() -> None:
    submitted = TEMPLATE.replace("___", "sum(nums[:k])", 1).replace("___", "nums[i] - nums[i - k]", 1)
    assert code_checks.filled_blanks(TEMPLATE, submitted) == ["sum(nums[:k])", "nums[i] - nums[i - k]"]
    assert code_checks.filled_blanks(TEMPLATE, "\n\n" + submitted + "\n") == ["sum(nums[:k])", "nums[i] - nums[i - k]"]
    assert code_checks.filled_blanks(TEMPLATE, TEMPLATE.replace("___", "x", 1).replace("return total", "return 0")) is None
    assert code_checks.filled_blanks("no blanks here", "no blanks here") == []
