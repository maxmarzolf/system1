from __future__ import annotations

import inspect

from app.core import static_functions as sf
from app.core.static_function_catalog import STATIC_FUNCTION_CATALOG, function_names_for_skill
from app.core.static_practice import build_static_function_drill


SKILL_MAP_METHODS = [
    ("Sliding Window", ["fixed vs variable window", "expand / shrink rhythm", "frequency maps", "valid window rule", "window score updates"]),
    ("Two Pointers", ["same-direction scan", "opposing pointers", "sorted-array leverage", "dedupe rules", "pointer move rule"]),
    ("Binary Search", ["left / right bounds", "mid calculation", "search on answer", "first / last occurrence", "boundary rule handling"]),
    ("DFS / BFS", ["base-case guards", "visited tracking", "pre / post-order thinking", "queue frontier management", "level-by-level expansion"]),
    ("Backtracking", ["choice / explore / undo", "path state", "pruning conditions", "start index control", "result collection"]),
    ("Heap / Priority Queue", ["top-k maintenance", "min vs max heap choice", "push / pop discipline", "stream processing", "lazy deletion patterns"]),
    ("Union Find", ["parent initialization", "find with compression", "union by rank / size", "component counting", "cycle detection"]),
    ("Dynamic Programming", ["state definition", "transition equation", "base cases", "iteration order", "space optimization"]),
    ("Graph Traversal", ["adjacency representation", "start state selection", "topological ordering", "indegree bookkeeping", "shortest-path framing"]),
    ("Intervals", ["sort by start / end", "merge overlap logic", "sweep decisions", "room / resource counting", "boundary comparisons"]),
    ("Prefix Sums", ["running total setup", "sum-to-index map", "subarray difference trick", "mod remainder buckets", "constant-time range queries"]),
    ("Monotonic Stack", ["increasing vs decreasing stack", "next greater / smaller", "pop trigger rule", "index storage", "span / area computation"]),
]


def static_function_names() -> set[str]:
    return {
        name
        for name, obj in inspect.getmembers(sf, inspect.isfunction)
        if obj.__module__ == sf.__name__
    }


def test_static_function_catalog_references_real_functions() -> None:
    names = static_function_names()

    assert 75 <= len(names) <= 100
    assert set(STATIC_FUNCTION_CATALOG) == names
    assert "static_cards_refine" not in names


def test_static_function_catalog_has_required_metadata() -> None:
    forbidden_patterns = {"arrays", "hashmaps", "arrays-hashmaps", "hash-maps"}

    for name, meta in STATIC_FUNCTION_CATALOG.items():
        assert meta["title"]
        assert meta["difficulty"] in {"Easy", "Med.", "Hard"}
        assert meta["description"]
        assert meta["patterns"]
        assert meta["methods"]
        assert meta["leetcodeExamples"]
        assert name not in meta["patterns"]
        assert not (set(meta["patterns"]) & forbidden_patterns)


def test_current_skill_map_resolves_to_static_functions() -> None:
    names = static_function_names()

    for pattern, methods in SKILL_MAP_METHODS:
        for method in methods:
            matches = function_names_for_skill(pattern, method)
            assert matches, f"{pattern}: {method}"
            assert set(matches) <= names


def test_representative_static_functions_behave_correctly() -> None:
    assert sf.max_fixed_window_sum([1, 4, 2, 10, 3], 3) == 16
    assert sf.permutation_window_match("eidbaooo", "ab") is True
    assert sf.two_sum_sorted([2, 7, 11, 15], 9) == [0, 1]
    assert sf.lower_bound([1, 3, 3, 5], 3) == 1
    assert sf.shortest_path_unweighted({"A": ["B"], "B": ["C"], "C": []}, "A", "C") == 2
    assert sorted(sf.subsets([1, 2])) == [[], [1], [1, 2], [2]]
    assert sf.house_robber([2, 7, 9, 3, 1]) == 12
    assert sf.kth_largest([3, 2, 1, 5, 6, 4], 2) == 5
    assert sf.count_components_union_find(5, [[0, 1], [1, 2]]) == 3
    assert sf.merge_intervals([[1, 3], [2, 6], [8, 10]]) == [[1, 6], [8, 10]]
    assert sf.count_subarrays_sum([1, 1, 1], 2) == 2
    assert sf.largest_rectangle_area([2, 1, 5, 6, 2, 3]) == 10
    assert sf.eval_rpn(["2", "1", "+", "3", "*"]) == 9
    assert sf.num_islands([["1", "1", "0"], ["0", "1", "0"], ["1", "0", "1"]]) == 3
    assert sf.can_jump([2, 3, 1, 1, 4]) is True
    assert sf.topo_order({0: [1], 1: []}) == [0, 1]


def test_trie_static_functions_share_plain_dict_shape() -> None:
    root = {}
    sf.trie_insert(root, "code")

    assert sf.trie_search(root, "code") is True
    assert sf.trie_search(root, "cod") is False
    assert sf.trie_starts_with(root, "cod") is True
    assert sf.word_dictionary_search(root, "c.de") is True


def test_static_function_row_builds_skill_map_drill_card() -> None:
    row = {
        "name": "binary_search",
        "title": "Closed-Interval Binary Search",
        "difficulty": "Easy",
        "description": "Probe the middle and discard one half.",
        "code": "def binary_search(nums, target):\n    return -1",
        "tags": ["skill-map", "static-function", "binary-search"],
        "leetcode_examples": ["Binary Search"],
        "pattern_slug": "binary-search",
        "pattern_name": "Binary Search",
    }

    card = build_static_function_drill(row)

    assert card["id"] == "static-function-binary_search"
    assert card["solution"] == row["code"]
    assert card["templateTargets"]["algorithm"] == row["code"]
    assert "binary-search" in card["tags"]
    assert card["plainEnglishPromptDetail"]["leetcodeExamples"] == ["Binary Search"]
