from __future__ import annotations

import re
from textwrap import dedent
from typing import Any


def _slug(value: str) -> str:
    return re.sub(
        r"-+",
        "-",
        re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-"),
    )


def _core_shape_slug(value: str) -> str:
    slug = _slug(value)
    return {
        "heap-priority-queue": "heap",
    }.get(slug, slug)


def _question(
    title: str,
    core_shape: str,
    tier: str,
    difficulty: str,
    methods: tuple[str, ...],
) -> dict[str, Any]:
    return {
        "title": title,
        "coreShape": core_shape,
        "tier": tier,
        "difficulty": difficulty,
        "methods": methods,
    }


GOOGLE_QUESTIONS: tuple[dict[str, Any], ...] = (
    _question("1. Two Sum", "Arrays / Hash Maps", "Tier 1: Must Know", "Easy", ("pair lookup", "complement map")),
    _question("49. Group Anagrams", "Arrays / Hash Maps", "Tier 1: Must Know", "Med.", ("canonical key", "frequency signature")),
    _question("128. Longest Consecutive Sequence", "Arrays / Hash Maps", "Tier 1: Must Know", "Med.", ("set membership", "sequence starts")),
    _question("347. Top K Frequent Elements", "Arrays / Hash Maps", "Tier 1: Must Know", "Med.", ("frequency map", "top-k selection")),
    _question("238. Product of Array Except Self", "Arrays / Hash Maps", "Tier 1: Must Know", "Med.", ("prefix products", "suffix products")),
    _question("3. Longest Substring Without Repeating Characters", "Sliding Window", "Tier 1: Must Know", "Med.", ("variable window", "last-seen index")),
    _question("424. Longest Repeating Character Replacement", "Sliding Window", "Tier 1: Must Know", "Med.", ("frequency counts", "valid window rule")),
    _question("567. Permutation in String", "Sliding Window", "Tier 1: Must Know", "Med.", ("fixed window", "frequency match")),
    _question("76. Minimum Window Substring", "Sliding Window", "Tier 1: Must Know", "Hard", ("required counts", "shrink timing")),
    _question("209. Minimum Size Subarray Sum", "Sliding Window", "Tier 1: Must Know", "Med.", ("running sum", "minimal valid window")),
    _question("11. Container With Most Water", "Two Pointers", "Tier 1: Must Know", "Med.", ("opposing pointers", "area optimization")),
    _question("15. 3Sum", "Two Pointers", "Tier 1: Must Know", "Med.", ("sorted-array leverage", "dedupe rules")),
    _question("42. Trapping Rain Water", "Two Pointers", "Tier 1: Must Know", "Hard", ("left and right maxima", "water contribution")),
    _question("125. Valid Palindrome", "Two Pointers", "Tier 1: Must Know", "Easy", ("opposing pointers", "character filtering")),
    _question("33. Search in Rotated Sorted Array", "Binary Search", "Tier 1: Must Know", "Med.", ("rotated halves", "boundary rule handling")),
    _question("153. Find Minimum in Rotated Sorted Array", "Binary Search", "Tier 1: Must Know", "Med.", ("pivot search", "right-bound comparison")),
    _question("875. Koko Eating Bananas", "Binary Search", "Tier 1: Must Know", "Med.", ("search on answer", "feasibility predicate")),
    _question("981. Time Based Key-Value Store", "Binary Search", "Tier 1: Must Know", "Med.", ("timestamp lookup", "floor search")),
    _question("98. Validate BST", "Trees", "Tier 2: Google Favorites", "Med.", ("range bounds", "DFS validation")),
    _question("102. Binary Tree Level Order Traversal", "Trees", "Tier 2: Google Favorites", "Med.", ("BFS queue", "level-by-level expansion")),
    _question("236. Lowest Common Ancestor", "Trees", "Tier 2: Google Favorites", "Med.", ("post-order search", "split detection")),
    _question("543. Diameter of Binary Tree", "Trees", "Tier 2: Google Favorites", "Easy", ("height recursion", "global best path")),
    _question("124. Binary Tree Maximum Path Sum", "Trees", "Tier 2: Google Favorites", "Hard", ("path gain", "global max update")),
    _question("200. Number of Islands", "Graphs", "Tier 2: Google Favorites", "Med.", ("grid DFS", "visited marking")),
    _question("133. Clone Graph", "Graphs", "Tier 2: Google Favorites", "Med.", ("visited map", "neighbor cloning")),
    _question("207. Course Schedule", "Graphs", "Tier 2: Google Favorites", "Med.", ("cycle detection", "topological ordering")),
    _question("210. Course Schedule II", "Graphs", "Tier 2: Google Favorites", "Med.", ("indegree bookkeeping", "topological ordering")),
    _question("994. Rotting Oranges", "Graphs", "Tier 2: Google Favorites", "Med.", ("multi-source BFS", "minute layers")),
    _question("417. Pacific Atlantic Water Flow", "Graphs", "Tier 2: Google Favorites", "Med.", ("reverse DFS", "reachability intersection")),
    _question("215. Kth Largest Element", "Heap / Priority Queue", "Tier 2: Google Favorites", "Med.", ("top-k maintenance", "quickselect alternative")),
    _question("295. Find Median from Data Stream", "Heap / Priority Queue", "Tier 2: Google Favorites", "Hard", ("two-heap balancing", "stream processing")),
    _question("973. K Closest Points", "Heap / Priority Queue", "Tier 2: Google Favorites", "Med.", ("distance ordering", "top-k selection")),
    _question("39. Combination Sum", "Backtracking", "Tier 3: Often Asked", "Med.", ("choice / explore / undo", "start index control")),
    _question("46. Permutations", "Backtracking", "Tier 3: Often Asked", "Med.", ("path state", "used set")),
    _question("79. Word Search", "Backtracking", "Tier 3: Often Asked", "Med.", ("grid backtracking", "visited restoration")),
    _question("51. N-Queens", "Backtracking", "Tier 3: Often Asked", "Hard", ("constraint tracking", "diagonal pruning")),
    _question("70. Climbing Stairs", "Dynamic Programming", "Tier 3: Often Asked", "Easy", ("state definition", "Fibonacci recurrence")),
    _question("198. House Robber", "Dynamic Programming", "Tier 3: Often Asked", "Med.", ("include / exclude transition", "rolling state")),
    _question("322. Coin Change", "Dynamic Programming", "Tier 3: Often Asked", "Med.", ("min transition", "bottom-up tabulation")),
    _question("300. Longest Increasing Subsequence", "Dynamic Programming", "Tier 3: Often Asked", "Med.", ("subsequence DP", "patience sorting alternative")),
    _question("1143. Longest Common Subsequence", "Dynamic Programming", "Tier 3: Often Asked", "Med.", ("two-dimensional state", "match / skip transition")),
    _question("56. Merge Intervals", "Intervals", "Tier 3: Often Asked", "Med.", ("sort by start", "merge overlap logic")),
    _question("57. Insert Interval", "Intervals", "Tier 3: Often Asked", "Med.", ("interval insertion", "overlap sweep")),
    _question("435. Non-overlapping Intervals", "Intervals", "Tier 3: Often Asked", "Med.", ("greedy interval selection", "end-time sorting")),
    _question("84. Largest Rectangle in Histogram", "Monotonic Stack", "Tier 4: Hard but Worth It", "Hard", ("increasing stack", "area boundaries")),
    _question("239. Sliding Window Maximum", "Sliding Window", "Tier 4: Hard but Worth It", "Hard", ("monotonic deque", "window maximum")),
    _question("297. Serialize and Deserialize Binary Tree", "Trees", "Tier 4: Hard but Worth It", "Hard", ("tree encoding", "preorder reconstruction")),
    _question("23. Merge k Sorted Lists", "Heap / Priority Queue", "Tier 4: Hard but Worth It", "Hard", ("k-way frontier merging", "linked-list merge")),
    _question("269. Alien Dictionary", "Graphs", "Tier 4: Hard but Worth It", "Hard", ("character graph", "topological ordering")),
    _question("642. Design Search Autocomplete System", "Trie", "Tier 4: Hard but Worth It", "Hard", ("prefix traversal", "ranked suggestions", "search-team relevance")),
)


GOOGLE_SKELETON_QUESTIONS: tuple[dict[str, Any], ...] = (
    _question(
        "BFS Skeleton",
        "Graphs",
        "Skeletons",
        "Easy",
        ("BFS queue", "visited set", "neighbor expansion"),
    ),
    _question(
        "DFS Skeleton",
        "Graphs",
        "Skeletons",
        "Easy",
        ("recursive DFS", "visited set", "neighbor expansion"),
    ),
    _question(
        "Fixed-Size Sliding Window Skeleton",
        "Sliding Window",
        "Skeletons",
        "Easy",
        ("fixed window", "rolling state", "enter / leave updates"),
    ),
    _question(
        "Variable-Size Sliding Window Skeleton",
        "Sliding Window",
        "Skeletons",
        "Med.",
        ("variable window", "expand / shrink rhythm", "valid window rule"),
    ),
    _question(
        "Top-Down DP Skeleton",
        "Dynamic Programming",
        "Skeletons",
        "Med.",
        ("memoization", "base cases", "state transitions"),
    ),
    _question(
        "Bottom-Up DP Skeleton",
        "Dynamic Programming",
        "Skeletons",
        "Med.",
        ("tabulation", "base cases", "dependency order"),
    ),
    _question(
        "Binary Search Skeleton",
        "Binary Search",
        "Skeletons",
        "Easy",
        ("left / right bounds", "midpoint", "discard half"),
    ),
    _question(
        "Backtracking Skeleton",
        "Backtracking",
        "Skeletons",
        "Med.",
        ("choose / explore / undo", "valid choices", "goal state"),
    ),
    _question(
        "Two Pointers Skeleton",
        "Two Pointers",
        "Skeletons",
        "Easy",
        ("opposing pointers", "movement rule", "termination condition"),
    ),
    _question(
        "Monotonic Stack Skeleton",
        "Monotonic Stack",
        "Skeletons",
        "Med.",
        ("index stack", "pop trigger", "next greater element"),
    ),
    _question(
        "Heap / Top-K Skeleton",
        "Heap / Priority Queue",
        "Skeletons",
        "Easy",
        ("min heap", "top-k maintenance", "push / pop discipline"),
    ),
    _question(
        "Merge Intervals Skeleton",
        "Intervals",
        "Skeletons",
        "Easy",
        ("sort by start", "overlap check", "merge endpoints"),
    ),
    _question(
        "Prefix Sum Skeleton",
        "Prefix Sums",
        "Skeletons",
        "Easy",
        ("leading zero", "running total", "range difference"),
    ),
    _question(
        "Union-Find / Disjoint Set Skeleton",
        "Union Find",
        "Skeletons",
        "Med.",
        ("path compression", "union by size", "cycle detection"),
    ),
    _question(
        "Topological Sort -- Kahn's Algorithm Skeleton",
        "Graphs",
        "Skeletons",
        "Med.",
        ("indegree bookkeeping", "zero-indegree queue", "cycle detection"),
    ),
    _question(
        "Dijkstra Skeleton",
        "Graphs",
        "Skeletons",
        "Med.",
        ("min-heap frontier", "non-negative weights", "finalized distances"),
    ),
    _question(
        "Bellman-Ford Skeleton",
        "Graphs",
        "Skeletons",
        "Med.",
        ("edge relaxation", "n - 1 passes", "early exit"),
    ),
    _question(
        "Trie Skeleton",
        "Trie",
        "Skeletons",
        "Med.",
        ("child map", "word insertion", "exact search"),
    ),
    _question(
        "Greedy Skeleton",
        "Greedy",
        "Skeletons",
        "Easy",
        ("sorting rule", "local choice", "feasibility check"),
    ),
    _question(
        "Divide and Conquer Skeleton",
        "Divide and Conquer",
        "Skeletons",
        "Easy",
        ("base case", "divide", "combine"),
    ),
)


SKELETON_APPLICABILITY: dict[str, dict[str, Any]] = {
    "BFS Skeleton": {
        "templateStrength": 10,
        "applicationAbstraction": 2,
        "summary": "Queue → visited → neighbors",
    },
    "DFS Skeleton": {
        "templateStrength": 10,
        "applicationAbstraction": 2,
        "summary": "Visit → neighbors → recurse/stack",
    },
    "Union-Find / Disjoint Set Skeleton": {
        "templateStrength": 10,
        "applicationAbstraction": 3,
        "summary": "find + union implementation barely changes",
    },
    "Merge Intervals Skeleton": {
        "templateStrength": 9,
        "applicationAbstraction": 3,
        "summary": "Sort → compare current interval with previous",
    },
    "Binary Search Skeleton": {
        "templateStrength": 9,
        "applicationAbstraction": 4,
        "summary": "Loop is stable; defining the search condition can be tricky",
    },
    "Topological Sort -- Kahn's Algorithm Skeleton": {
        "templateStrength": 9,
        "applicationAbstraction": 4,
        "summary": "Build indegree → zero-indegree queue → remove edges",
    },
    "Bellman-Ford Skeleton": {
        "templateStrength": 9,
        "applicationAbstraction": 4,
        "summary": "Repeatedly relax every edge",
    },
    "Trie Skeleton": {
        "templateStrength": 9,
        "applicationAbstraction": 4,
        "summary": "Node + children + character traversal",
    },
    "Backtracking Skeleton": {
        "templateStrength": 9,
        "applicationAbstraction": 5,
        "summary": "Choose → explore → undo",
    },
    "Dijkstra Skeleton": {
        "templateStrength": 9,
        "applicationAbstraction": 5,
        "summary": "Heap + distances + relax edges",
    },
    "Two Pointers Skeleton": {
        "templateStrength": 8,
        "applicationAbstraction": 4,
        "summary": "Usually left/right with clear movement rules",
    },
    "Heap / Top-K Skeleton": {
        "templateStrength": 8,
        "applicationAbstraction": 4,
        "summary": "Push/pop heap; deciding what tuple or key to store matters",
    },
    "Fixed-Size Sliding Window Skeleton": {
        "templateStrength": 8,
        "applicationAbstraction": 5,
        "summary": "Expand → maintain fixed width → score",
    },
    "Variable-Size Sliding Window Skeleton": {
        "templateStrength": 8,
        "applicationAbstraction": 5,
        "summary": "Expand → detect invalid → shrink",
    },
    "Prefix Sum Skeleton": {
        "templateStrength": 8,
        "applicationAbstraction": 5,
        "summary": "Construction is easy; recognizing the algebraic transformation is harder",
    },
    "Monotonic Stack Skeleton": {
        "templateStrength": 8,
        "applicationAbstraction": 6,
        "summary": "Stack mechanics are stable; recognizing what belongs on it is harder",
    },
    "Divide and Conquer Skeleton": {
        "templateStrength": 6,
        "applicationAbstraction": 6,
        "summary": "Divide → solve → combine, but implementation varies",
    },
    "Greedy Skeleton": {
        "templateStrength": 3,
        "applicationAbstraction": 9,
        "summary": "No universal template; proving the local choice works is the problem",
    },
    "Top-Down DP Skeleton": {
        "templateStrength": 3,
        "applicationAbstraction": 10,
        "summary": "Discover the state, transitions, dependencies, and evaluation order",
    },
    "Bottom-Up DP Skeleton": {
        "templateStrength": 3,
        "applicationAbstraction": 10,
        "summary": "Discover the state, transitions, dependencies, and evaluation order",
    },
}


STATIC_PLAYLISTS: dict[str, dict[str, Any]] = {
    "google": {
        "title": "Google",
        "questions": GOOGLE_QUESTIONS,
    },
    "google-skeletons": {
        "title": "Skeletons",
        "questions": GOOGLE_SKELETON_QUESTIONS,
    },
}

STATIC_PLAYLIST_ORDERS: tuple[str, ...] = (
    "curated",
    "google-15",
    "solution-length",
    "family",
    "difficulty",
    "mastery",
)

GOOGLE_15_ORDER: tuple[str, ...] = (
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
)

GOOGLE_MASTERY_ORDER: tuple[str, ...] = (
    "1. Two Sum",
    "49. Group Anagrams",
    "238. Product of Array Except Self",
    "3. Longest Substring Without Repeating Characters",
    "125. Valid Palindrome",
    "11. Container With Most Water",
    "15. 3Sum",
    "56. Merge Intervals",
    "33. Search in Rotated Sorted Array",
    "153. Find Minimum in Rotated Sorted Array",
    "200. Number of Islands",
    "102. Binary Tree Level Order Traversal",
    "98. Validate BST",
    "236. Lowest Common Ancestor",
    "207. Course Schedule",
    "215. Kth Largest Element",
    "347. Top K Frequent Elements",
    "70. Climbing Stairs",
    "198. House Robber",
    "209. Minimum Size Subarray Sum",
    "424. Longest Repeating Character Replacement",
    "567. Permutation in String",
    "76. Minimum Window Substring",
    "128. Longest Consecutive Sequence",
    "875. Koko Eating Bananas",
    "981. Time Based Key-Value Store",
    "543. Diameter of Binary Tree",
    "124. Binary Tree Maximum Path Sum",
    "133. Clone Graph",
    "210. Course Schedule II",
    "994. Rotting Oranges",
    "417. Pacific Atlantic Water Flow",
    "973. K Closest Points",
    "295. Find Median from Data Stream",
    "39. Combination Sum",
    "46. Permutations",
    "79. Word Search",
    "322. Coin Change",
    "300. Longest Increasing Subsequence",
    "1143. Longest Common Subsequence",
    "57. Insert Interval",
    "435. Non-overlapping Intervals",
    "42. Trapping Rain Water",
    "84. Largest Rectangle in Histogram",
    "239. Sliding Window Maximum",
    "297. Serialize and Deserialize Binary Tree",
    "23. Merge k Sorted Lists",
    "269. Alien Dictionary",
    "51. N-Queens",
    "642. Design Search Autocomplete System",
)

DIFFICULTY_RANK: dict[str, int] = {
    "Easy": 0,
    "Med.": 1,
    "Hard": 2,
}

GOOGLE_SOLUTIONS: dict[str, str] = {
    "BFS Skeleton": """
from collections import deque


def bfs(start, graph):
    if start not in graph:
        return []

    q = deque([start])
    visited = {start}
    out = []

    while q:
        node = q.popleft()
        out.append(node)

        for ngbr in graph[node]:
            if ngbr not in visited:
                visited.add(ngbr)
                q.append(ngbr)

    return out
""",
    "DFS Skeleton": """
def dfs(start, graph):
    if start not in graph:
        return []

    visited = set()
    out = []

    def walk(node):
        visited.add(node)
        out.append(node)

        for ngbr in graph[node]:
            if ngbr not in visited:
                walk(ngbr)

    walk(start)
    return out
""",
    "Fixed-Size Sliding Window Skeleton": """
def fixed_size_window(items, k):
    left = 0
    state = initialize_state()
    answer = initialize_answer()

    for right, item in enumerate(items):
        # Add the item that entered the window.
        add_to_window(state, item)

        if right - left + 1 > k:
            # Remove the item that left the window.
            remove_from_window(state, items[left])
            left += 1

        if right - left + 1 == k:
            # Score the current window without rebuilding it.
            answer = update_answer(answer, state, left, right)

    return answer
""",
    "Variable-Size Sliding Window Skeleton": """
def variable_size_window(items):
    left = 0
    state = initialize_state()
    answer = initialize_answer()

    for right, item in enumerate(items):
        # Expand the window with the new rightmost item.
        add_to_window(state, item)

        while window_is_invalid(state):
            # Shrink from the left until the invariant is restored.
            remove_from_window(state, items[left])
            left += 1

        # For minimum-window problems, update before each valid shrink instead.
        answer = update_answer(answer, state, left, right)

    return answer
""",
    "Top-Down DP Skeleton": """
def top_down_dp(problem):
    memo = {}

    def solve(state):
        # Return the known answer for a base-case state.
        if is_base_case(state):
            return base_value(state)
        if state in memo:
            return memo[state]

        candidates = []
        for choice in choices(state):
            next_state = next_state_for(state, choice)
            # Combine this choice with the solved subproblem.
            candidate = transition(
                state,
                choice,
                solve(next_state),
            )
            candidates.append(candidate)

        # Keep the best candidate for this state.
        memo[state] = optimize(candidates)
        return memo[state]

    return solve(start_state(problem))
""",
    "Bottom-Up DP Skeleton": """
def bottom_up_dp(problem):
    dp = initialize_dp_storage(problem)
    set_base_cases(dp, problem)

    for state in dependency_order(problem):
        candidates = []
        for previous_state in previous_states(state):
            candidate = transition(
                state,
                previous_state,
                dp[previous_state],
            )
            candidates.append(candidate)
        dp[state] = combine(candidates)
    return dp[target_state(problem)]
""",
    "Binary Search Skeleton": """
def binary_search(nums, target):
    left, right = 0, len(nums) - 1

    while left <= right:
        mid = (left + right) // 2

        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1

    return -1
""",
    "Backtracking Skeleton": """
def backtrack(state, choices, out):
    if goal_reached(state):
        out.append(state.copy())
        return

    for choice in choices:
        if not valid(choice, state):
            continue

        state.append(choice)            # choose
        backtrack(state, choices, out)  # explore
        state.pop()                     # undo
""",
    "Two Pointers Skeleton": """
def two_pointers(nums):
    left = 0
    right = len(nums) - 1

    while left < right:
        if condition(nums[left], nums[right]):
            return True

        if move_left(nums[left], nums[right]):
            left += 1
        else:
            right -= 1

    return False
""",
    "Monotonic Stack Skeleton": """
def monotonic_stack(nums):
    stack = []
    out = [-1] * len(nums)

    for i, num in enumerate(nums):
        while stack and nums[stack[-1]] < num:
            j = stack.pop()
            out[j] = num

        stack.append(i)

    return out
""",
    "Heap / Top-K Skeleton": """
import heapq


def top_k(items, k):
    heap = []

    for item in items:
        heapq.heappush(heap, item)

        if len(heap) > k:
            heapq.heappop(heap)

    return heap
""",
    "Merge Intervals Skeleton": """
def merge_intervals(intervals):
    intervals.sort(key=lambda x: x[0])
    merged = []

    for start, end in intervals:
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)

    return merged
""",
    "Prefix Sum Skeleton": """
def build_prefix(nums):
    prefix = [0] * (len(nums) + 1)

    for i in range(len(nums)):
        prefix[i + 1] = prefix[i] + nums[i]

    return prefix


def range_sum(prefix, left, right):
    return prefix[right + 1] - prefix[left]
""",
    "Union-Find / Disjoint Set Skeleton": """
class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [1] * n

    def find(self, x):
        if x != self.parent[x]:
            self.parent[x] = self.find(self.parent[x])

        return self.parent[x]

    def union(self, a, b):
        root_a = self.find(a)
        root_b = self.find(b)

        if root_a == root_b:
            return False

        if self.rank[root_a] < self.rank[root_b]:
            root_a, root_b = root_b, root_a

        self.parent[root_b] = root_a
        self.rank[root_a] += self.rank[root_b]

        return True
""",
    "Topological Sort -- Kahn's Algorithm Skeleton": """
from collections import defaultdict, deque


def topological_sort(n, edges):
    graph = defaultdict(list)
    indegree = [0] * n

    for a, b in edges:
        graph[a].append(b)
        indegree[b] += 1

    q = deque(
        node for node in range(n)
        if indegree[node] == 0
    )

    order = []

    while q:
        node = q.popleft()
        order.append(node)

        for ngbr in graph[node]:
            indegree[ngbr] -= 1

            if indegree[ngbr] == 0:
                q.append(ngbr)

    return order if len(order) == n else []
""",
    "Dijkstra Skeleton": """
import heapq


def dijkstra(start, graph):
    heap = [(0, start)]
    distance = {}

    while heap:
        dist, node = heapq.heappop(heap)

        if node in distance:
            continue

        distance[node] = dist

        for ngbr, weight in graph.get(node, []):
            if ngbr not in distance:
                heapq.heappush(
                    heap,
                    (dist + weight, ngbr)
                )

    return distance
""",
    "Bellman-Ford Skeleton": """
def bellman_ford(n, edges, start):
    distance = [float("inf")] * n
    distance[start] = 0

    for _ in range(n - 1):
        changed = False

        for u, v, weight in edges:
            if (
                distance[u] != float("inf")
                and distance[u] + weight < distance[v]
            ):
                distance[v] = distance[u] + weight
                changed = True

        if not changed:
            break

    return distance
""",
    "Trie Skeleton": """
class TrieNode:
    def __init__(self):
        self.children = {}
        self.end = False


class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root

        for char in word:
            if char not in node.children:
                node.children[char] = TrieNode()

            node = node.children[char]

        node.end = True

    def search(self, word):
        node = self.root

        for char in word:
            if char not in node.children:
                return False

            node = node.children[char]

        return node.end
""",
    "Greedy Skeleton": """
def greedy(items):
    items.sort(key=some_rule)

    result = initial_result()

    for item in items:
        if valid_to_take(item, result):
            result = take(item, result)

    return result
""",
    "Divide and Conquer Skeleton": """
def divide_and_conquer(problem):
    if small_enough(problem):
        return solve_directly(problem)

    left, right = divide(problem)

    left_answer = divide_and_conquer(left)
    right_answer = divide_and_conquer(right)

    return combine(left_answer, right_answer)
""",
    "1. Two Sum": """
def solution(nums, target):
    seen = {}
    for index, num in enumerate(nums):
        need = target - num
        if need in seen:
            return [seen[need], index]
        seen[num] = index
    return []
""",
    "49. Group Anagrams": """
from collections import defaultdict


def solution(strs):
    groups = defaultdict(list)
    for word in strs:
        counts = [0] * 26
        for char in word:
            counts[ord(char) - ord("a")] += 1
        groups[tuple(counts)].append(word)
    return list(groups.values())
""",
    "128. Longest Consecutive Sequence": """
def solution(nums):
    values = set(nums)
    best = 0
    for value in values:
        if value - 1 in values:
            continue
        length = 1
        while value + length in values:
            length += 1
        best = max(best, length)
    return best
""",
    "347. Top K Frequent Elements": """
from collections import Counter


def solution(nums, k):
    return [num for num, _ in Counter(nums).most_common(k)]
""",
    "238. Product of Array Except Self": """
def solution(nums):
    answer = [1] * len(nums)
    prefix = 1
    for index, num in enumerate(nums):
        answer[index] = prefix
        prefix *= num

    suffix = 1
    for index in range(len(nums) - 1, -1, -1):
        answer[index] *= suffix
        suffix *= nums[index]
    return answer
""",
    "3. Longest Substring Without Repeating Characters": """
def solution(s):
    seen = {}
    left = 0
    best = 0
    for right, char in enumerate(s):
        if char in seen and seen[char] >= left:
            left = seen[char] + 1
        seen[char] = right
        best = max(best, right - left + 1)
    return best
""",
    "424. Longest Repeating Character Replacement": """
from collections import defaultdict


def solution(s, k):
    counts = defaultdict(int)
    left = 0
    max_count = 0
    best = 0
    for right, char in enumerate(s):
        counts[char] += 1
        max_count = max(max_count, counts[char])
        while right - left + 1 - max_count > k:
            counts[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best
""",
    "567. Permutation in String": """
from collections import Counter


def solution(s1, s2):
    need = Counter(s1)
    window = Counter()
    left = 0
    for right, char in enumerate(s2):
        window[char] += 1
        if right - left + 1 > len(s1):
            outgoing = s2[left]
            window[outgoing] -= 1
            if window[outgoing] == 0:
                del window[outgoing]
            left += 1
        if window == need:
            return True
    return False
""",
    "76. Minimum Window Substring": """
from collections import Counter


def solution(s, t):
    need = Counter(t)
    missing = len(t)
    left = 0
    best_start = 0
    best_len = float("inf")

    for right, char in enumerate(s):
        if need[char] > 0:
            missing -= 1
        need[char] -= 1

        while missing == 0:
            window_len = right - left + 1
            if window_len < best_len:
                best_start = left
                best_len = window_len
            outgoing = s[left]
            need[outgoing] += 1
            if need[outgoing] > 0:
                missing += 1
            left += 1

    return "" if best_len == float("inf") else s[best_start:best_start + best_len]
""",
    "209. Minimum Size Subarray Sum": """
def solution(target, nums):
    left = 0
    total = 0
    best = float("inf")
    for right, num in enumerate(nums):
        total += num
        while total >= target:
            best = min(best, right - left + 1)
            total -= nums[left]
            left += 1
    return 0 if best == float("inf") else best
""",
    "11. Container With Most Water": """
def solution(height):
    left = 0
    right = len(height) - 1
    best = 0
    while left < right:
        width = right - left
        best = max(best, width * min(height[left], height[right]))
        if height[left] < height[right]:
            left += 1
        else:
            right -= 1
    return best
""",
    "15. 3Sum": """
def solution(nums):
    nums.sort()
    result = []
    for index, value in enumerate(nums):
        if index > 0 and value == nums[index - 1]:
            continue
        left = index + 1
        right = len(nums) - 1
        while left < right:
            total = value + nums[left] + nums[right]
            if total < 0:
                left += 1
            elif total > 0:
                right -= 1
            else:
                result.append([value, nums[left], nums[right]])
                left += 1
                right -= 1
                while left < right and nums[left] == nums[left - 1]:
                    left += 1
                while left < right and nums[right] == nums[right + 1]:
                    right -= 1
    return result
""",
    "42. Trapping Rain Water": """
def solution(height):
    left = 0
    right = len(height) - 1
    left_max = 0
    right_max = 0
    water = 0
    while left < right:
        if height[left] < height[right]:
            left_max = max(left_max, height[left])
            water += left_max - height[left]
            left += 1
        else:
            right_max = max(right_max, height[right])
            water += right_max - height[right]
            right -= 1
    return water
""",
    "125. Valid Palindrome": """
def solution(s):
    left = 0
    right = len(s) - 1
    while left < right:
        while left < right and not s[left].isalnum():
            left += 1
        while left < right and not s[right].isalnum():
            right -= 1
        if s[left].lower() != s[right].lower():
            return False
        left += 1
        right -= 1
    return True
""",
    "33. Search in Rotated Sorted Array": """
def solution(nums, target):
    left = 0
    right = len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        if nums[left] <= nums[mid]:
            if nums[left] <= target < nums[mid]:
                right = mid - 1
            else:
                left = mid + 1
        else:
            if nums[mid] < target <= nums[right]:
                left = mid + 1
            else:
                right = mid - 1
    return -1
""",
    "153. Find Minimum in Rotated Sorted Array": """
def solution(nums):
    left = 0
    right = len(nums) - 1
    while left < right:
        mid = (left + right) // 2
        if nums[mid] > nums[right]:
            left = mid + 1
        else:
            right = mid
    return nums[left]
""",
    "875. Koko Eating Bananas": """
import math


def solution(piles, h):
    left = 1
    right = max(piles)
    while left < right:
        mid = (left + right) // 2
        hours = sum(math.ceil(pile / mid) for pile in piles)
        if hours <= h:
            right = mid
        else:
            left = mid + 1
    return left
""",
    "981. Time Based Key-Value Store": """
import bisect


class TimeMap:
    def __init__(self):
        self.store = {}

    def set(self, key, value, timestamp):
        self.store.setdefault(key, []).append((timestamp, value))

    def get(self, key, timestamp):
        values = self.store.get(key, [])
        index = bisect.bisect_right(values, (timestamp, chr(255))) - 1
        return values[index][1] if index >= 0 else ""
""",
    "98. Validate BST": """
def solution(root):
    def dfs(node, low, high):
        if not node:
            return True
        if not low < node.val < high:
            return False
        return dfs(node.left, low, node.val) and dfs(node.right, node.val, high)

    return dfs(root, float("-inf"), float("inf"))
""",
    "102. Binary Tree Level Order Traversal": """
from collections import deque


def solution(root):
    if not root:
        return []
    result = []
    q = deque([root])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        result.append(level)
    return result
""",
    "236. Lowest Common Ancestor": """
def solution(root, p, q):
    if not root or root is p or root is q:
        return root
    left = solution(root.left, p, q)
    right = solution(root.right, p, q)
    if left and right:
        return root
    return left or right
""",
    "543. Diameter of Binary Tree": """
def solution(root):
    best = 0

    def height(node):
        nonlocal best
        if not node:
            return 0
        left = height(node.left)
        right = height(node.right)
        best = max(best, left + right)
        return 1 + max(left, right)

    height(root)
    return best
""",
    "124. Binary Tree Maximum Path Sum": """
def solution(root):
    best = float("-inf")

    def gain(node):
        nonlocal best
        if not node:
            return 0
        left_gain = max(gain(node.left), 0)
        right_gain = max(gain(node.right), 0)
        best = max(best, node.val + left_gain + right_gain)
        return node.val + max(left_gain, right_gain)

    gain(root)
    return best
""",
    "200. Number of Islands": """
def solution(grid):
    if not grid:
        return 0

    rows = len(grid)
    cols = len(grid[0])

    def sink(row, col):
        if row < 0 or row == rows or col < 0 or col == cols or grid[row][col] != "1":
            return
        grid[row][col] = "0"
        sink(row + 1, col)
        sink(row - 1, col)
        sink(row, col + 1)
        sink(row, col - 1)

    islands = 0
    for row in range(rows):
        for col in range(cols):
            if grid[row][col] == "1":
                islands += 1
                sink(row, col)
    return islands
""",
    "133. Clone Graph": """
def solution(node):
    if not node:
        return None
    copies = {}

    def clone(current):
        if current in copies:
            return copies[current]
        copy = Node(current.val)
        copies[current] = copy
        copy.neighbors = [clone(neighbor) for neighbor in current.neighbors]
        return copy

    return clone(node)
""",
    "207. Course Schedule": """
from collections import deque


def solution(num_courses, prerequisites):
    graph = [[] for _ in range(num_courses)]
    indegree = [0] * num_courses
    for course, prereq in prerequisites:
        graph[prereq].append(course)
        indegree[course] += 1

    q = deque(course for course in range(num_courses) if indegree[course] == 0)
    taken = 0
    while q:
        course = q.popleft()
        taken += 1
        for neighbor in graph[course]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                q.append(neighbor)
    return taken == num_courses
""",
    "210. Course Schedule II": """
from collections import deque


def solution(num_courses, prerequisites):
    graph = [[] for _ in range(num_courses)]
    indegree = [0] * num_courses
    for course, prereq in prerequisites:
        graph[prereq].append(course)
        indegree[course] += 1

    q = deque(course for course in range(num_courses) if indegree[course] == 0)
    order = []
    while q:
        course = q.popleft()
        order.append(course)
        for neighbor in graph[course]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                q.append(neighbor)
    return order if len(order) == num_courses else []
""",
    "994. Rotting Oranges": """
from collections import deque


def solution(grid):
    rows = len(grid)
    cols = len(grid[0])
    fresh = 0
    q = deque()
    for row in range(rows):
        for col in range(cols):
            if grid[row][col] == 1:
                fresh += 1
            elif grid[row][col] == 2:
                q.append((row, col))

    minutes = 0
    directions = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    while q and fresh:
        for _ in range(len(q)):
            row, col = q.popleft()
            for d_row, d_col in directions:
                next_row = row + d_row
                next_col = col + d_col
                in_bounds = 0 <= next_row < rows and 0 <= next_col < cols
                if in_bounds and grid[next_row][next_col] == 1:
                    grid[next_row][next_col] = 2
                    fresh -= 1
                    q.append((next_row, next_col))
        minutes += 1
    return minutes if fresh == 0 else -1
""",
    "417. Pacific Atlantic Water Flow": """
def solution(heights):
    rows = len(heights)
    cols = len(heights[0])

    def flow(starts):
        reachable = set(starts)
        stack = list(starts)
        while stack:
            row, col = stack.pop()
            for d_row, d_col in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                next_row = row + d_row
                next_col = col + d_col
                if not (0 <= next_row < rows and 0 <= next_col < cols):
                    continue
                if (next_row, next_col) in reachable:
                    continue
                if heights[next_row][next_col] < heights[row][col]:
                    continue
                reachable.add((next_row, next_col))
                stack.append((next_row, next_col))
        return reachable

    pacific_starts = [(0, col) for col in range(cols)]
    pacific_starts += [(row, 0) for row in range(rows)]
    atlantic_starts = [(rows - 1, col) for col in range(cols)]
    atlantic_starts += [(row, cols - 1) for row in range(rows)]
    pacific = flow(pacific_starts)
    atlantic = flow(atlantic_starts)
    return [[row, col] for row, col in pacific & atlantic]
""",
    "215. Kth Largest Element": """
import heapq


def solution(nums, k):
    return heapq.nlargest(k, nums)[-1]
""",
    "295. Find Median from Data Stream": """
import heapq


class MedianFinder:
    def __init__(self):
        self.small = []
        self.large = []

    def addNum(self, num):
        heapq.heappush(self.small, -num)
        heapq.heappush(self.large, -heapq.heappop(self.small))
        if len(self.large) > len(self.small):
            heapq.heappush(self.small, -heapq.heappop(self.large))

    def findMedian(self):
        if len(self.small) > len(self.large):
            return -self.small[0]
        return (-self.small[0] + self.large[0]) / 2
""",
    "973. K Closest Points": """
import heapq


def solution(points, k):
    return heapq.nsmallest(
        k,
        points,
        key=lambda point: point[0] * point[0] + point[1] * point[1],
    )
""",
    "39. Combination Sum": """
def solution(candidates, target):
    candidates.sort()
    result = []

    def backtrack(start, remaining, path):
        if remaining == 0:
            result.append(path[:])
            return
        for index in range(start, len(candidates)):
            value = candidates[index]
            if value > remaining:
                break
            path.append(value)
            backtrack(index, remaining - value, path)
            path.pop()

    backtrack(0, target, [])
    return result
""",
    "46. Permutations": """
def solution(nums):
    result = []
    used = [False] * len(nums)

    def backtrack(path):
        if len(path) == len(nums):
            result.append(path[:])
            return
        for index, value in enumerate(nums):
            if used[index]:
                continue
            used[index] = True
            path.append(value)
            backtrack(path)
            path.pop()
            used[index] = False

    backtrack([])
    return result
""",
    "79. Word Search": """
def solution(board, word):
    rows = len(board)
    cols = len(board[0])

    def dfs(row, col, index):
        if index == len(word):
            return True
        if (
            row < 0
            or row == rows
            or col < 0
            or col == cols
            or board[row][col] != word[index]
        ):
            return False

        saved = board[row][col]
        board[row][col] = "#"
        found = (
            dfs(row + 1, col, index + 1)
            or dfs(row - 1, col, index + 1)
            or dfs(row, col + 1, index + 1)
            or dfs(row, col - 1, index + 1)
        )
        board[row][col] = saved
        return found

    for row in range(rows):
        for col in range(cols):
            if dfs(row, col, 0):
                return True
    return False
""",
    "51. N-Queens": """
def solution(n):
    result = []
    cols = set()
    diag = set()
    anti_diag = set()
    board = [["."] * n for _ in range(n)]

    def backtrack(row):
        if row == n:
            result.append(["".join(line) for line in board])
            return
        for col in range(n):
            if col in cols or row - col in diag or row + col in anti_diag:
                continue
            cols.add(col)
            diag.add(row - col)
            anti_diag.add(row + col)
            board[row][col] = "Q"
            backtrack(row + 1)
            board[row][col] = "."
            cols.remove(col)
            diag.remove(row - col)
            anti_diag.remove(row + col)

    backtrack(0)
    return result
""",
    "70. Climbing Stairs": """
def solution(n):
    if n <= 2:
        return n

    dp = [0] * (n + 1)
    dp[1], dp[2] = 1, 2

    for state in range(3, n + 1):
        candidates = [dp[state - 1], dp[state - 2]]
        dp[state] = sum(candidates)

    return dp[n]
""",
    "198. House Robber": """
def solution(nums):
    memo = {}

    def solve(state):
        if state >= len(nums):
            return 0
        if state in memo:
            return memo[state]

        candidates = [
            solve(state + 1),
            nums[state] + solve(state + 2),
        ]
        memo[state] = max(candidates)
        return memo[state]

    return solve(0)
""",
    "322. Coin Change": """
def solution(coins, amount):
    dp = [0] + [float("inf")] * amount

    for state in range(1, amount + 1):
        candidates = []
        for coin in coins:
            if coin <= state:
                candidates.append(dp[state - coin] + 1)
        dp[state] = min(candidates, default=float("inf"))

    return -1 if dp[amount] == float("inf") else dp[amount]
""",
    "300. Longest Increasing Subsequence": """
def solution(nums):
    if not nums:
        return 0

    dp = [1] * len(nums)

    for state in range(len(nums)):
        candidates = [
            dp[previous_state] + 1
            for previous_state in range(state)
            if nums[previous_state] < nums[state]
        ]
        dp[state] = max(candidates, default=1)

    return max(dp)
""",
    "1143. Longest Common Subsequence": """
def solution(text1, text2):
    dp = [[0] * (len(text2) + 1) for _ in range(len(text1) + 1)]

    for row in range(1, len(text1) + 1):
        for col in range(1, len(text2) + 1):
            if text1[row - 1] == text2[col - 1]:
                dp[row][col] = dp[row - 1][col - 1] + 1
            else:
                candidates = [dp[row - 1][col], dp[row][col - 1]]
                dp[row][col] = max(candidates)

    return dp[len(text1)][len(text2)]
""",
    "56. Merge Intervals": """
def solution(intervals):
    intervals.sort(key=lambda interval: interval[0])
    merged = []
    for start, end in intervals:
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return merged
""",
    "57. Insert Interval": """
def solution(intervals, new_interval):
    result = []
    index = 0
    while index < len(intervals) and intervals[index][1] < new_interval[0]:
        result.append(intervals[index])
        index += 1

    while index < len(intervals) and intervals[index][0] <= new_interval[1]:
        new_interval[0] = min(new_interval[0], intervals[index][0])
        new_interval[1] = max(new_interval[1], intervals[index][1])
        index += 1

    result.append(new_interval)
    result.extend(intervals[index:])
    return result
""",
    "435. Non-overlapping Intervals": """
def solution(intervals):
    intervals.sort(key=lambda interval: interval[1])
    removals = 0
    prev_end = float("-inf")
    for start, end in intervals:
        if start >= prev_end:
            prev_end = end
        else:
            removals += 1
    return removals
""",
    "84. Largest Rectangle in Histogram": """
def solution(heights):
    stack = []
    best = 0
    for index, height in enumerate(heights + [0]):
        while stack and heights[stack[-1]] > height:
            popped_height = heights[stack.pop()]
            left = stack[-1] if stack else -1
            width = index - left - 1
            best = max(best, popped_height * width)
        stack.append(index)
    return best
""",
    "239. Sliding Window Maximum": """
from collections import deque


def solution(nums, k):
    q = deque()
    result = []
    for index, num in enumerate(nums):
        while q and q[0] <= index - k:
            q.popleft()
        while q and nums[q[-1]] <= num:
            q.pop()
        q.append(index)
        if index >= k - 1:
            result.append(nums[q[0]])
    return result
""",
    "297. Serialize and Deserialize Binary Tree": """
class Codec:
    def serialize(self, root):
        values = []

        def dfs(node):
            if not node:
                values.append("#")
                return
            values.append(str(node.val))
            dfs(node.left)
            dfs(node.right)

        dfs(root)
        return ",".join(values)

    def deserialize(self, data):
        values = iter(data.split(","))

        def dfs():
            value = next(values)
            if value == "#":
                return None
            node = TreeNode(int(value))
            node.left = dfs()
            node.right = dfs()
            return node

        return dfs()
""",
    "23. Merge k Sorted Lists": """
import heapq


def solution(lists):
    heap = []
    counter = 0
    for node in lists:
        if node:
            heapq.heappush(heap, (node.val, counter, node))
            counter += 1

    dummy = ListNode(0)
    tail = dummy
    while heap:
        _, _, node = heapq.heappop(heap)
        tail.next = node
        tail = tail.next
        if node.next:
            heapq.heappush(heap, (node.next.val, counter, node.next))
            counter += 1
    return dummy.next
""",
    "269. Alien Dictionary": """
from collections import deque


def solution(words):
    graph = {char: set() for word in words for char in word}
    indegree = {char: 0 for char in graph}

    for first, second in zip(words, words[1:]):
        if len(first) > len(second) and first.startswith(second):
            return ""
        for left, right in zip(first, second):
            if left != right:
                if right not in graph[left]:
                    graph[left].add(right)
                    indegree[right] += 1
                break

    q = deque(char for char in indegree if indegree[char] == 0)
    order = []
    while q:
        char = q.popleft()
        order.append(char)
        for neighbor in graph[char]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                q.append(neighbor)

    return "".join(order) if len(order) == len(indegree) else ""
""",
    "642. Design Search Autocomplete System": """
from collections import defaultdict


class AutocompleteSystem:
    def __init__(self, sentences, times):
        self.counts = defaultdict(int)
        for sentence, count in zip(sentences, times):
            self.counts[sentence] += count
        self.prefix = ""

    def input(self, c):
        if c == "#":
            self.counts[self.prefix] += 1
            self.prefix = ""
            return []

        self.prefix += c
        matches = [
            (-count, sentence)
            for sentence, count in self.counts.items()
            if sentence.startswith(self.prefix)
        ]
        matches.sort()
        return [sentence for _, sentence in matches[:3]]
""",
}


def _card_id(playlist_slug: str, title: str) -> str:
    return f"playlist-{playlist_slug}-{_slug(title)}"


def _solution_line_count(question: dict[str, Any]) -> int:
    return len(_outline_target(question).splitlines())


def _ordered_questions(playlist_slug: str, questions: tuple[dict[str, Any], ...], order: str) -> list[dict[str, Any]]:
    normalized_order = order if order in STATIC_PLAYLIST_ORDERS else "curated"
    indexed = list(enumerate(questions))

    if (
        playlist_slug == "google-skeletons"
        and normalized_order in {"curated", "mastery", "google-15"}
    ):
        rank = {title: index for index, title in enumerate(SKELETON_APPLICABILITY)}
        return [
            question
            for _, question in sorted(
                indexed,
                key=lambda item: (rank.get(str(item[1]["title"]), len(rank)), item[0]),
            )
        ]

    if normalized_order == "solution-length":
        return [
            question
            for _, question in sorted(
                indexed,
                key=lambda item: (_solution_line_count(item[1]), item[0]),
            )
        ]

    if normalized_order == "family":
        family_order: dict[str, int] = {}
        for _, question in indexed:
            family_order.setdefault(str(question["coreShape"]), len(family_order))
        return [
            question
            for _, question in sorted(
                indexed,
                key=lambda item: (family_order[str(item[1]["coreShape"])], item[0]),
            )
        ]

    if normalized_order == "difficulty":
        return [
            question
            for _, question in sorted(
                indexed,
                key=lambda item: (DIFFICULTY_RANK.get(str(item[1]["difficulty"]), 99), item[0]),
            )
        ]

    if normalized_order == "mastery" and playlist_slug == "google":
        rank = {title: index for index, title in enumerate(GOOGLE_MASTERY_ORDER)}
        return [
            question
            for _, question in sorted(
                indexed,
                key=lambda item: (rank.get(str(item[1]["title"]), len(rank)), item[0]),
            )
        ]

    if normalized_order == "google-15" and playlist_slug == "google":
        questions_by_title = {str(question["title"]): question for _, question in indexed}
        return [questions_by_title[title] for title in GOOGLE_15_ORDER]

    return [question for _, question in indexed]


def _outline_target(question: dict[str, Any]) -> str:
    solution = GOOGLE_SOLUTIONS.get(str(question["title"]))
    if solution:
        return dedent(solution).strip()

    title = str(question["title"])
    function_name = f"google_{_slug(title).replace('-', '_')}_approach"
    methods = [str(method) for method in question["methods"]]
    method_rows = "\n".join(f'        "{index}. {method}",' for index, method in enumerate(methods, start=1))
    return (
        f"def {function_name}():\n"
        "    \"\"\"\n"
        f"    Problem: {title}\n"
        f"    Core shape: {question['coreShape']}\n"
        f"    Priority: {question['tier']}\n"
        "    \"\"\"\n"
        "    key_moves = [\n"
        f"{method_rows}\n"
        "    ]\n"
        "    return key_moves"
    )


def _tags(playlist_slug: str, question: dict[str, Any]) -> list[str]:
    core_shape_slug = _core_shape_slug(str(question["coreShape"]))
    return list(dict.fromkeys([
        "skill-map",
        "static-playlist",
        playlist_slug,
        core_shape_slug,
        _slug(str(question["tier"])),
        _slug(str(question["title"])),
        *[_slug(str(method)) for method in question["methods"]],
    ]))


def build_static_playlist_drills(playlist_slug: str, order: str = "curated") -> dict[str, Any] | None:
    normalized_slug = _slug(playlist_slug)
    playlist = STATIC_PLAYLISTS.get(normalized_slug)
    if not playlist:
        return None

    drills = []
    for question in _ordered_questions(normalized_slug, playlist["questions"], order):
        target = _outline_target(question)
        title = str(question["title"])
        core_shape = str(question["coreShape"])
        tier = str(question["tier"])
        methods = [str(method) for method in question["methods"]]
        prompt = f"{playlist['title']}: recall the static solution for {title}."
        drill = {
            "id": _card_id(normalized_slug, title),
            "title": title,
            "difficulty": str(question["difficulty"]),
            "prompt": prompt,
            "templatePrompts": {
                "algorithm": prompt,
                "coreShape": f"{playlist['title']}: recall the {core_shape} solution shape for {title}.",
                "inline": prompt,
            },
            "templateTargets": {
                "algorithm": target,
                "coreShape": target,
                "inline": target,
            },
            "solution": target,
            "missing": "# static playlist outline complete",
            "hint": f"{tier}. Focus on {', '.join(methods)}.",
            "tags": _tags(normalized_slug, question),
            "plainEnglishPromptDetail": {
                "plainEnglish": f"What is the approach for {title}?",
                "interviewQuestion": f"Solve {title} using {core_shape}.",
                "inputExample": "Use the examples from the original problem statement.",
                "outputExample": "Return the value required by the original problem.",
                "explanation": f"{tier}: {core_shape}. Key moves: {', '.join(methods)}.",
                "brassTacks": f"Recall the invariant, data structure, and update rule for {title}.",
                "leetcodeExamples": [title],
            },
        }
        applicability = SKELETON_APPLICABILITY.get(title)
        if normalized_slug == "google-skeletons" and applicability:
            drill["skeletonApplicability"] = applicability
        drills.append(drill)

    return {"drills": drills, "llmUsed": False}


def static_playlist_overview_rows() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for playlist_slug, playlist in STATIC_PLAYLISTS.items():
        for question in _ordered_questions(playlist_slug, playlist["questions"], "curated"):
            rows.append({
                "id": _card_id(playlist_slug, str(question["title"])),
                "title": str(question["title"]),
                "tags": _tags(playlist_slug, question),
            })
    return rows


def static_playlist_activity_rows() -> list[dict[str, Any]]:
    return [
        {
            "algorithm": str(playlist["title"]),
            "slug": playlist_slug,
            "skills": [
                str(question["title"])
                for question in _ordered_questions(playlist_slug, playlist["questions"], "curated")
            ],
        }
        for playlist_slug, playlist in STATIC_PLAYLISTS.items()
    ]
