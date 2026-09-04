from __future__ import annotations

import ast
import inspect

from app.core import core_algorithms as sf
from app.core import core_meta
from app.core.core_algorithm_catalog import CORE_ALGORITHM_CATALOG, CORE_META_CATALOG, problem_slugs_for_skill
from app.core.core_algorithm_practice import build_core_algorithm_drill
from app.core.static_playlists import GOOGLE_QUESTIONS, build_static_playlist_drills, static_playlist_overview_rows
from app.core.taxonomy_catalog import (
    ALGORITHM_SKILLS,
    ALGORITHMS,
    CANONICAL_SKILLS,
    PATTERN_TO_ALGORITHM,
    RETIRED_SKILLS,
    TECHNIQUES,
)


def core_algorithm_names() -> set[str]:
    return {
        name
        for name, obj in inspect.getmembers(sf, inspect.isfunction)
        if obj.__module__ == sf.__name__
    }


def test_algorithm_curricula_have_intentionally_sized_unique_taxonomies() -> None:
    expected_counts = {
        "sliding-window": 9,
        "two-pointers": 9,
        "binary-search": 11,
        "graphs": 22,
        "backtracking": 10,
        "heap": 10,
        "union-find": 10,
        "dynamic-programming": 13,
        "intervals": 10,
        "prefix-sums": 10,
        "monotonic-stack": 10,
    }
    assert {algorithm: len(skills) for algorithm, skills in ALGORITHM_SKILLS.items()} == expected_counts
    for skills in ALGORITHM_SKILLS.values():
        assert len(set(skills)) == len(skills)


def test_taxonomy_catalog_is_internally_consistent() -> None:
    assert set(ALGORITHM_SKILLS) <= set(ALGORITHMS)
    assert not set(RETIRED_SKILLS) & set(CANONICAL_SKILLS)
    assert "correctness-reasoning" not in RETIRED_SKILLS
    assert "complexity-analysis" not in RETIRED_SKILLS
    assert "answer-update-timing" not in RETIRED_SKILLS
    assert "space-optimization" in RETIRED_SKILLS
    assert set(PATTERN_TO_ALGORITHM.values()) <= set(ALGORITHMS)
    assert PATTERN_TO_ALGORITHM["dfs-bfs"] == "graphs"
    assert PATTERN_TO_ALGORITHM["graph-traversal"] == "graphs"
    assert PATTERN_TO_ALGORITHM["topological-sort"] == "graphs"
    assert PATTERN_TO_ALGORITHM["greedy-sorting"] == "sorting"


def test_core_algorithm_catalog_references_real_functions() -> None:
    names = core_algorithm_names()

    assert 75 <= len(names) <= 100
    assert set(CORE_ALGORITHM_CATALOG) == names
    assert "core_algorithm_cards_refine" not in names


def test_core_meta_catalog_references_real_members() -> None:
    names = {
        name
        for name, obj in inspect.getmembers(core_meta)
        if getattr(obj, "__module__", "") == core_meta.__name__ and (inspect.isfunction(obj) or inspect.isclass(obj))
    }
    source_names = {str(meta["sourceName"]) for meta in CORE_META_CATALOG.values()}

    assert len(CORE_META_CATALOG) == 19
    assert source_names <= names
    assert "clone_graph" in source_names
    assert "GraphNode" in names
    assert "meta_clone_graph" not in names
    assert "core-algorithm" not in CORE_META_CATALOG["meta_clone_graph"]["tags"]
    assert "core-algorithm" in CORE_META_CATALOG["meta_merge_intervals"]["tags"]
    assert set(problem_slugs_for_skill("graph cloning")) == {"meta_clone_graph"}


def test_core_algorithm_catalog_has_required_metadata() -> None:
    forbidden_algorithms = {"arrays", "hashmaps", "arrays-hashmaps", "hash-maps"}

    for name, meta in CORE_ALGORITHM_CATALOG.items():
        assert meta["title"]
        assert meta["difficulty"] in {"Easy", "Med.", "Hard"}
        assert meta["description"]
        assert meta["algorithm"] in ALGORITHMS
        assert meta["algorithm"] not in forbidden_algorithms
        assert meta["skills"]
        assert set(meta["techniques"]) <= set(TECHNIQUES)
        assert meta["leetcodeExamples"]
        assert name != meta["algorithm"]


def test_every_curriculum_algorithm_has_problems() -> None:
    algorithms_with_problems = {meta["algorithm"] for meta in CORE_ALGORITHM_CATALOG.values()}

    assert set(ALGORITHM_SKILLS) <= algorithms_with_problems


def test_exercised_skills_resolve_to_problems() -> None:
    names = core_algorithm_names()
    exercised = {slug for meta in CORE_ALGORITHM_CATALOG.values() for slug in meta["skills"]}

    for skill in exercised:
        matches = problem_slugs_for_skill(skill)
        assert matches, skill
        assert set(matches) <= names | set(CORE_META_CATALOG)


def test_representative_core_algorithms_behave_correctly() -> None:
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


def test_dynamic_programming_core_algorithms_use_dp_recurrences() -> None:
    assert sf.climb_stairs(5) == 8
    assert sf.house_robber([2, 7, 9, 3, 1]) == 12
    assert sf.min_cost_climbing_stairs([10, 15, 20]) == 15
    assert sf.coin_change_min([1, 2, 5], 11) == 3
    assert sf.coin_change_min([2], 3) == -1
    assert sf.unique_paths(3, 7) == 28
    assert sf.longest_increasing_subsequence([10, 9, 2, 5, 3, 7, 101, 18]) == 4
    assert sf.longest_common_subsequence("abcde", "ace") == 3
    assert sf.can_jump([2, 3, 1, 1, 4]) is True
    assert sf.can_jump([3, 2, 1, 0, 4]) is False
    assert sf.jump_game_min_jumps([2, 3, 1, 1, 4]) == 2
    assert sf.jump_game_min_jumps([0, 1]) == -1

    dp_entries = {
        name: meta
        for name, meta in CORE_ALGORITHM_CATALOG.items()
        if meta["algorithm"] == "dynamic-programming"
    }
    assert len(dp_entries) == 9
    for name, meta in dp_entries.items():
        source = inspect.getsource(getattr(sf, name))
        assert "dp" in source or "solve" in source
        assert "greedy" not in meta["techniques"]
        assert "binary-search" not in meta["techniques"]


def test_trie_core_algorithms_share_plain_dict_shape() -> None:
    root = {}
    sf.trie_insert(root, "code")

    assert sf.trie_search(root, "code") is True
    assert sf.trie_search(root, "cod") is False
    assert sf.trie_starts_with(root, "cod") is True
    assert sf.word_dictionary_search(root, "c.de") is True


def test_core_algorithm_row_builds_skill_map_drill_card() -> None:
    row = {
        "slug": "binary_search",
        "title": "Closed-Interval Binary Search",
        "difficulty": "Easy",
        "description": "Probe the middle and discard one half.",
        "code": "def binary_search(nums, target):\n    return -1",
        "tags": ["skill-map", "core-algorithm", "binary-search"],
        "leetcode_examples": ["Binary Search"],
        "algorithm_slug": "binary-search",
        "algorithm_name": "Binary Search",
        "technique_slugs": [],
        "skill_slugs": ["left-right-bounds", "mid-calculation"],
    }

    card = build_core_algorithm_drill(row)

    assert card["id"] == "core-algorithm-binary_search"
    assert card["prompt"] == "Binary Search: memorize the core algorithm."
    assert card["templatePrompts"]["algorithm"] == card["prompt"]
    assert card["solution"] == row["code"]
    assert card["templateTargets"]["algorithm"] == row["code"]
    assert "binary-search" in card["tags"]
    assert card["plainEnglishPromptDetail"]["leetcodeExamples"] == ["Binary Search"]


def test_google_static_playlist_contains_requested_questions() -> None:
    expected_titles = [
        "1. Two Sum",
        "49. Group Anagrams",
        "128. Longest Consecutive Sequence",
        "347. Top K Frequent Elements",
        "238. Product of Array Except Self",
        "3. Longest Substring Without Repeating Characters",
        "424. Longest Repeating Character Replacement",
        "567. Permutation in String",
        "76. Minimum Window Substring",
        "209. Minimum Size Subarray Sum",
        "11. Container With Most Water",
        "15. 3Sum",
        "42. Trapping Rain Water",
        "125. Valid Palindrome",
        "33. Search in Rotated Sorted Array",
        "153. Find Minimum in Rotated Sorted Array",
        "875. Koko Eating Bananas",
        "981. Time Based Key-Value Store",
        "98. Validate BST",
        "102. Binary Tree Level Order Traversal",
        "236. Lowest Common Ancestor",
        "543. Diameter of Binary Tree",
        "124. Binary Tree Maximum Path Sum",
        "200. Number of Islands",
        "133. Clone Graph",
        "207. Course Schedule",
        "210. Course Schedule II",
        "994. Rotting Oranges",
        "417. Pacific Atlantic Water Flow",
        "215. Kth Largest Element",
        "295. Find Median from Data Stream",
        "973. K Closest Points",
        "39. Combination Sum",
        "46. Permutations",
        "79. Word Search",
        "51. N-Queens",
        "70. Climbing Stairs",
        "198. House Robber",
        "322. Coin Change",
        "300. Longest Increasing Subsequence",
        "1143. Longest Common Subsequence",
        "56. Merge Intervals",
        "57. Insert Interval",
        "435. Non-overlapping Intervals",
        "84. Largest Rectangle in Histogram",
        "239. Sliding Window Maximum",
        "297. Serialize and Deserialize Binary Tree",
        "23. Merge k Sorted Lists",
        "269. Alien Dictionary",
        "642. Design Search Autocomplete System",
    ]

    assert [str(question["title"]) for question in GOOGLE_QUESTIONS] == expected_titles

    deck = build_static_playlist_drills("google")
    assert deck is not None
    assert deck["llmUsed"] is False
    assert [card["title"] for card in deck["drills"]] == expected_titles
    assert deck["drills"][0]["id"] == "playlist-google-1-two-sum"
    assert "static-playlist" in deck["drills"][0]["tags"]
    assert deck["drills"][0]["solution"].startswith("def solution(nums, target):")
    assert "need = target - num" in deck["drills"][0]["solution"]
    assert "google_124_binary_tree_maximum_path_sum_approach" not in next(
        card for card in deck["drills"] if card["title"] == "124. Binary Tree Maximum Path Sum"
    )["solution"]
    assert next(card for card in deck["drills"] if card["title"] == "124. Binary Tree Maximum Path Sum")[
        "solution"
    ].startswith("def solution(root):")
    for card in deck["drills"]:
        compile(card["solution"], f"<{card['id']}>", "exec")
    assert all(card["solution"].replace("# static playlist outline complete", "").strip() for card in deck["drills"])
    assert "heap" in next(card for card in deck["drills"] if card["title"] == "215. Kth Largest Element")["tags"]
    assert "heap-priority-queue" not in next(card for card in deck["drills"] if card["title"] == "215. Kth Largest Element")["tags"]
    overview_rows = static_playlist_overview_rows()
    assert len([row for row in overview_rows if "google" in row["tags"]]) == 50
    assert len([row for row in overview_rows if "google-skeletons" in row["tags"]]) == 24
    assert len(overview_rows) == 74


def test_google_skeleton_static_playlist_serves_reusable_algorithm_skeletons() -> None:
    deck = build_static_playlist_drills("google-skeletons")

    assert deck is not None
    assert deck["llmUsed"] is False
    assert len(deck["drills"]) == 24
    assert [card["title"] for card in deck["drills"]] == [
        "BFS Skeleton",
        "Grid BFS Skeleton",
        "DFS Skeleton",
        "Grid DFS Skeleton",
        "Binary Tree DFS -- Return & Combine Skeleton",
        "Binary Tree DFS -- Carry State Skeleton",
        "Binary Tree BFS -- Level Order Skeleton",
        "Union-Find / Disjoint Set Skeleton",
        "Merge Intervals Skeleton",
        "Binary Search Skeleton",
        "Topological Sort -- Kahn's Algorithm Skeleton",
        "Trie Skeleton",
        "Backtracking Skeleton",
        "Dijkstra Skeleton",
        "Two Pointers Skeleton",
        "Heap / Top-K Skeleton",
        "Fixed-Size Sliding Window Skeleton",
        "Variable-Size Sliding Window Skeleton",
        "Prefix Sum Skeleton",
        "Monotonic Stack Skeleton",
        "Divide and Conquer Skeleton",
        "Greedy Skeleton",
        "Top-Down DP Skeleton",
        "Bottom-Up DP Skeleton",
    ]

    cards = {card["title"]: card for card in deck["drills"]}
    assert all("skeletonApplicability" in card for card in cards.values())
    mastery_deck = build_static_playlist_drills("google-skeletons", "mastery")
    assert mastery_deck is not None
    assert [card["title"] for card in mastery_deck["drills"]] == list(cards)
    assert cards["BFS Skeleton"]["skeletonApplicability"] == {
        "templateStrength": 10,
        "applicationAbstraction": 2,
        "summary": "Queue → visited → neighbors",
        "explanation": "Breadth-first search expands the graph one distance layer at a time. Mark each node when it enters the queue so it is scheduled exactly once.",
        "invariant": "Every queued node has been discovered but not yet processed, and every discovered node is already in visited.",
        "timeComplexity": "O(V + E)",
    }
    assert cards["Grid BFS Skeleton"]["skeletonApplicability"] == {
        "templateStrength": 9,
        "applicationAbstraction": 3,
        "summary": "Queue → visited → four neighbors",
        "explanation": "Grid BFS explores cells in increasing distance from the start. Its queue and four-direction traversal are reusable; the problem-specific work is defining valid cells, the goal condition, and whether traversal begins from one or many sources.",
        "invariant": "At the start of each outer iteration, the queue contains the current distance layer; every queued cell is already in visited and will be processed once.",
        "timeComplexity": "O(rows · cols)",
    }
    assert cards["Grid DFS Skeleton"]["skeletonApplicability"] == {
        "templateStrength": 9,
        "applicationAbstraction": 3,
        "summary": "Bounds → visited → four neighbors",
        "explanation": "Grid DFS treats each cell as a graph node and explores its four orthogonal neighbors. The reusable traversal stays fixed; the problem-specific work is defining which cells are eligible to visit.",
        "invariant": "visited contains every cell discovered from the start, and walk recurses only to in-bounds cells not already in that set.",
        "timeComplexity": "O(rows · cols)",
    }
    assert all(card["skeletonApplicability"]["explanation"] for card in cards.values())
    assert all(card["skeletonApplicability"]["invariant"] for card in cards.values())
    assert all(card["skeletonApplicability"]["timeComplexity"] for card in cards.values())
    assert cards["Greedy Skeleton"]["skeletonApplicability"]["applicationAbstraction"] == 9
    assert cards["Top-Down DP Skeleton"]["skeletonApplicability"]["templateStrength"] == 3
    assert cards["Bottom-Up DP Skeleton"]["skeletonApplicability"]["applicationAbstraction"] == 10

    expected_definitions = {
        "Binary Search Skeleton": "def binary_search(nums, target):",
        "Grid BFS Skeleton": "def bfs(grid, r, c):",
        "Grid DFS Skeleton": "def dfs(grid, r, c):",
        "Binary Tree DFS -- Return & Combine Skeleton": "def tree_dfs(root):",
        "Binary Tree DFS -- Carry State Skeleton": "def tree_dfs_with_state(root):",
        "Binary Tree BFS -- Level Order Skeleton": "def tree_level_order(root):",
        "Backtracking Skeleton": "def backtrack(state, choices, out):",
        "Two Pointers Skeleton": "def two_pointers(nums):",
        "Monotonic Stack Skeleton": "def monotonic_stack(nums):",
        "Heap / Top-K Skeleton": "def top_k(items, k):",
        "Merge Intervals Skeleton": "def merge_intervals(intervals):",
        "Prefix Sum Skeleton": "def build_prefix(nums):",
        "Union-Find / Disjoint Set Skeleton": "class UnionFind:",
        "Topological Sort -- Kahn's Algorithm Skeleton": "def topological_sort(n, edges):",
        "Dijkstra Skeleton": "def dijkstra(start, graph):",
        "Trie Skeleton": "class Trie:",
        "Greedy Skeleton": "def greedy(items):",
        "Divide and Conquer Skeleton": "def divide_and_conquer(problem):",
    }
    for title, definition in expected_definitions.items():
        card = next(card for card in deck["drills"] if card["title"] == title)
        assert definition in card["solution"]
        compile(card["solution"], f"<{card['id']}>", "exec")

    grid_bfs_solution = cards["Grid BFS Skeleton"]["solution"]
    assert "start = (r, c)" in grid_bfs_solution
    assert "q = deque([start])" in grid_bfs_solution
    assert "visited = {start}" in grid_bfs_solution
    assert "while q:" in grid_bfs_solution
    assert "r, c = q.popleft()" in grid_bfs_solution

    bfs_card = cards["BFS Skeleton"]
    dfs_card = cards["DFS Skeleton"]
    fixed_window_card = cards["Fixed-Size Sliding Window Skeleton"]
    variable_window_card = cards["Variable-Size Sliding Window Skeleton"]
    top_down_card = cards["Top-Down DP Skeleton"]
    bottom_up_card = cards["Bottom-Up DP Skeleton"]

    assert bfs_card["id"] == "playlist-google-skeletons-bfs-skeleton"
    assert "google-skeletons" in bfs_card["tags"]
    assert bfs_card["solution"].startswith("from collections import deque")
    assert "def bfs(start, graph):" in bfs_card["solution"]
    assert "q = deque([start])" in bfs_card["solution"]
    assert "for ngbr in graph[node]:" in bfs_card["solution"]

    assert dfs_card["id"] == "playlist-google-skeletons-dfs-skeleton"
    assert "google-skeletons" in dfs_card["tags"]
    assert dfs_card["solution"].startswith("def dfs(start, graph):")
    assert "visited = set()" in dfs_card["solution"]
    assert "def walk(node):" in dfs_card["solution"]
    assert "for ngbr in graph[node]:" in dfs_card["solution"]

    assert fixed_window_card["id"] == (
        "playlist-google-skeletons-fixed-size-sliding-window-skeleton"
    )
    assert fixed_window_card["solution"].startswith("def fixed_size_window(items, k):")
    assert "# Add the item that entered the window." in fixed_window_card["solution"]
    assert "add_to_window(state, item)" in fixed_window_card["solution"]
    assert "remove_from_window(state, items[left])" in fixed_window_card["solution"]
    compile(fixed_window_card["solution"], f"<{fixed_window_card['id']}>", "exec")

    assert variable_window_card["id"] == (
        "playlist-google-skeletons-variable-size-sliding-window-skeleton"
    )
    assert variable_window_card["solution"].startswith("def variable_size_window(items):")
    assert "while window_is_invalid(state):" in variable_window_card["solution"]
    assert "# Shrink from the left until the invariant is restored." in variable_window_card["solution"]
    compile(variable_window_card["solution"], f"<{variable_window_card['id']}>", "exec")

    assert top_down_card["id"] == "playlist-google-skeletons-top-down-dp-skeleton"
    assert top_down_card["solution"].startswith("def top_down_dp(problem):")
    assert "memo = {}" in top_down_card["solution"]
    assert "def solve(state):" in top_down_card["solution"]
    assert "candidates = []" in top_down_card["solution"]
    assert "memo[state] = optimize(candidates)" in top_down_card["solution"]
    assert "# Keep the best candidate for this state." in top_down_card["solution"]
    compile(top_down_card["solution"], f"<{top_down_card['id']}>", "exec")

    assert bottom_up_card["id"] == "playlist-google-skeletons-bottom-up-dp-skeleton"
    assert bottom_up_card["solution"].startswith("def bottom_up_dp(problem):")
    assert "dp = initialize_dp_storage(problem)" in bottom_up_card["solution"]
    assert "set_base_cases(dp, problem)" in bottom_up_card["solution"]
    assert "for state in dependency_order(problem):" in bottom_up_card["solution"]
    assert "dp[state] = combine(candidates)" in bottom_up_card["solution"]
    compile(bottom_up_card["solution"], f"<{bottom_up_card['id']}>", "exec")

    graph = {
        "a": ["b", "c"],
        "b": ["d"],
        "c": [],
        "d": [],
    }

    namespace: dict[str, object] = {}
    compile(bfs_card["solution"], f"<{bfs_card['id']}>", "exec")
    exec(bfs_card["solution"], namespace)
    assert namespace["bfs"]("a", graph) == ["a", "b", "c", "d"]
    assert namespace["bfs"]("missing", graph) == []

    namespace = {}
    compile(dfs_card["solution"], f"<{dfs_card['id']}>", "exec")
    exec(dfs_card["solution"], namespace)
    assert namespace["dfs"]("a", graph) == ["a", "b", "d", "c"]
    assert namespace["dfs"]("missing", graph) == []

def test_google_static_solutions_keep_imports_at_top_level() -> None:
    deck = build_static_playlist_drills("google")
    assert deck is not None

    for card in deck["drills"]:
        tree = ast.parse(card["solution"])
        top_level_functions = [node.name for node in tree.body if isinstance(node, ast.FunctionDef)]
        if top_level_functions:
            assert top_level_functions == ["solution"], card["title"]
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                nested_imports = [
                    child
                    for child in ast.walk(node)
                    if isinstance(child, (ast.Import, ast.ImportFrom))
                ]
                assert nested_imports == [], card["title"]
            if isinstance(node, ast.Name):
                assert node.id != "last_seen", card["title"]
                assert node.id != "queue", card["title"]
        assert all(len(line) <= 88 for line in card["solution"].splitlines()), card["title"]


def test_google_static_playlist_order_modes() -> None:
    curated = build_static_playlist_drills("google", "curated")
    mastery = build_static_playlist_drills("google", "mastery")
    family = build_static_playlist_drills("google", "family")
    difficulty = build_static_playlist_drills("google", "difficulty")
    solution_length = build_static_playlist_drills("google", "solution-length")
    google_15 = build_static_playlist_drills("google", "google-15")

    assert curated and mastery and family and difficulty and solution_length and google_15
    assert curated["drills"][0]["title"] == "1. Two Sum"
    assert [card["title"] for card in google_15["drills"]] == [
        "1. Two Sum",
        "3. Longest Substring Without Repeating Characters",
        "49. Group Anagrams",
        "347. Top K Frequent Elements",
        "15. 3Sum",
        "33. Search in Rotated Sorted Array",
        "102. Binary Tree Level Order Traversal",
        "236. Lowest Common Ancestor",
        "200. Number of Islands",
        "207. Course Schedule",
        "215. Kth Largest Element",
        "56. Merge Intervals",
        "322. Coin Change",
        "239. Sliding Window Maximum",
        "84. Largest Rectangle in Histogram",
    ]
    assert [card["title"] for card in mastery["drills"][:5]] == [
        "1. Two Sum",
        "49. Group Anagrams",
        "238. Product of Array Except Self",
        "3. Longest Substring Without Repeating Characters",
        "125. Valid Palindrome",
    ]
    assert [card["title"] for card in family["drills"][:5]] == [
        "1. Two Sum",
        "49. Group Anagrams",
        "128. Longest Consecutive Sequence",
        "347. Top K Frequent Elements",
        "238. Product of Array Except Self",
    ]
    difficulty_ranks = {"Easy": 0, "Med.": 1, "Hard": 2}
    ranks = [difficulty_ranks[card["difficulty"]] for card in difficulty["drills"]]
    assert ranks == sorted(ranks)
    lengths = [len(card["solution"].splitlines()) for card in solution_length["drills"]]
    assert lengths == sorted(lengths)


def test_representative_google_static_solutions_behave_correctly() -> None:
    deck = build_static_playlist_drills("google")
    assert deck is not None
    solutions = {card["title"]: card["solution"] for card in deck["drills"]}

    namespace: dict[str, object] = {}
    exec(solutions["1. Two Sum"], namespace)
    assert namespace["solution"]([2, 7, 11, 15], 9) == [0, 1]

    namespace = {}
    exec(solutions["76. Minimum Window Substring"], namespace)
    assert namespace["solution"]("ADOBECODEBANC", "ABC") == "BANC"

    namespace = {}
    exec(solutions["124. Binary Tree Maximum Path Sum"], namespace)

    class TreeNode:
        def __init__(self, val=0, left=None, right=None):
            self.val = val
            self.left = left
            self.right = right

    root = TreeNode(-10, TreeNode(9), TreeNode(20, TreeNode(15), TreeNode(7)))
    assert namespace["solution"](root) == 42

    namespace = {}
    exec(solutions["981. Time Based Key-Value Store"], namespace)
    time_map = namespace["TimeMap"]()
    time_map.set("foo", "bar", 1)
    assert time_map.get("foo", 1) == "bar"
    assert time_map.get("foo", 3) == "bar"

    namespace = {}
    exec(solutions["642. Design Search Autocomplete System"], namespace)
    autocomplete = namespace["AutocompleteSystem"](["i love you", "island", "ironman", "i love leetcode"], [5, 3, 2, 2])
    assert autocomplete.input("i") == ["i love you", "island", "i love leetcode"]
