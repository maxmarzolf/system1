from __future__ import annotations

import re
from typing import Any


def pattern_slug(value: str) -> str:
    return re.sub(
        r"\s+",
        "-",
        re.sub(r"[^a-z0-9\s-]", " ", str(value or "").lower().replace("/", " ").replace("&", " ").replace("-", " ")).strip(),
    )


def method_slug(method: str) -> str:
    return pattern_slug(method)


def pattern_family_slug(pattern_or_slug: str) -> str:
    slug = pattern_slug(pattern_or_slug)
    return {
        "heap-priority-queue": "heap",
    }.get(slug, slug)


def _limit_words(value: str, max_words: int) -> str:
    words = re.findall(r"[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)?", str(value or ""))
    if len(words) <= max_words:
        return re.sub(r"\s+", " ", str(value or "").strip())
    return " ".join(words[:max_words])


def _entry(
    title: str,
    prompt: str,
    hint: str,
    plain_english: str,
    interview_question: str,
    input_example: str,
    output_example: str,
    explanation: str,
    brass_tacks: str,
    leetcode_examples: list[str],
    target_terms: tuple[str, ...],
    skeleton: str,
) -> dict[str, Any]:
    return {
        "title": title,
        "prompt": prompt,
        "hint": hint,
        "plainEnglish": plain_english,
        "interviewQuestion": interview_question,
        "inputExample": input_example,
        "outputExample": output_example,
        "explanation": explanation,
        "brassTacks": brass_tacks,
        "leetcodeExamples": leetcode_examples,
        "targetTerms": target_terms,
        "skeleton": skeleton.strip(),
    }


FOCUSED_CARD_CATALOG: dict[tuple[str, str], dict[str, Any]] = {
    ("sliding-window", "fixed-vs-variable-window"): _entry(
        "Maximum Average Subarray I",
        "Fixed-Window Rolling Sum",
        "Add entering value; subtract leaving value.",
        "How do I score each fixed-size window cheaply?",
        "Given nums and k, find the best score among all contiguous windows of length k.",
        "nums = [1, 4, 2, 10, 3]\nk = 3\n\nfixed_window_best(nums, k)",
        "16",
        "The window keeps exactly k items, so each slide changes one entering and one leaving value.",
        "Keep one window score; slide by one add and one subtract.",
        [
            "Maximum Average Subarray I: fixed window scoring.",
            "Permutation in String: fixed-size frequency window.",
            "Find All Anagrams in a String: fixed-size counts.",
        ],
        ("fixed_window_best",),
        """
def fixed_window_best(nums, k):
    window = sum(nums[:k])
    best = window
    for right in range(k, len(nums)):
        window += nums[right] - nums[right - k]
        best = max(best, window)
    return best
""",
    ),
    ("sliding-window", "expand-shrink-rhythm"): _entry(
        "Minimum Size Subarray Sum",
        "Expand Then Shrink Window Rhythm",
        "Expand right; shrink left while valid.",
        "When should the left edge move?",
        "Given positive nums and target, return the smallest window whose sum reaches target.",
        "nums = [2, 3, 1, 2, 4, 3]\ntarget = 7\n\nmin_window_len(nums, target)",
        "2",
        "The right edge searches for enough total; the left edge removes excess once valid.",
        "Grow until valid, then shrink until removing more would break it.",
        [
            "Minimum Size Subarray Sum: shrink after reaching target.",
            "Longest Substring Without Repeating Characters: shrink after conflict.",
            "Max Consecutive Ones III: shrink after too many flips.",
        ],
        ("min_window_len",),
        """
def min_window_len(nums, target):
    left, total, best = 0, 0, len(nums) + 1
    for right, val in enumerate(nums):
        total += val
        while total >= target:
            best = min(best, right - left + 1)
            total -= nums[left]
            left += 1
    return 0 if best > len(nums) else best
""",
    ),
    ("sliding-window", "frequency-maps"): _entry(
        "Permutation in String",
        "Frequency Window Matching",
        "Track entering and leaving character counts.",
        "Do the current window counts match the target?",
        "Given s and pattern, decide whether any fixed-size window has the same counts as pattern.",
        's = "eidbaooo"\npattern = "ab"\n\nhas_permutation(s, pattern)',
        "True",
        "A frequency map lets the window compare multiset state instead of rebuilding each substring.",
        "Maintain counts for exactly one window and compare after each slide.",
        [
            "Permutation in String: fixed-size count match.",
            "Find All Anagrams in a String: count windows.",
            "Minimum Window Substring: required counts.",
        ],
        ("has_permutation",),
        """
def has_permutation(s, pattern):
    need = Counter(pattern)
    window = Counter(s[:len(pattern)])
    for right in range(len(pattern), len(s) + 1):
        if window == need:
            return True
        if right == len(s):
            break
        left = right - len(pattern)
        window[s[right]] += 1
        window[s[left]] -= 1
    return False
""",
    ),
    ("sliding-window", "valid-window-rule"): _entry(
        "Longest Repeating Character Replacement",
        "Valid Window Rule with Shrink",
        "Shrink only when the invariant is broken.",
        "What makes this window invalid?",
        "Given a string and k replacements, return the longest window that can be made of one repeated char.",
        's = "AABABBA"\nk = 1\n\nlongest_replacement(s, k)',
        "4",
        "The invariant says replacements needed must stay within k; left moves only to restore it.",
        "Name the validity rule, then shrink until it is true.",
        [
            "Longest Repeating Character Replacement: validity by max count.",
            "Max Consecutive Ones III: validity by zero count.",
            "Fruit Into Baskets: validity by distinct count.",
        ],
        ("longest_replacement",),
        """
def longest_replacement(s, k):
    left, best, max_count = 0, 0, 0
    counts = {}
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1
        max_count = max(max_count, counts[ch])
        while right - left + 1 - max_count > k:
            counts[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best
""",
    ),
    ("sliding-window", "window-score-updates"): _entry(
        "Maximum Points from Cards",
        "Window Score Update",
        "Update score from edge changes only.",
        "How does the score change when the window slides?",
        "Given card points and k, maximize points by taking k cards from either end.",
        "cards = [1, 2, 3, 4, 5, 6, 1]\nk = 3\n\nmax_card_points(cards, k)",
        "12",
        "Instead of recomputing a score, each step swaps one left-side card for one right-side card.",
        "Keep the score; update only what enters and leaves.",
        [
            "Maximum Points from Cards: edge score swap.",
            "Maximum Average Subarray I: rolling sum.",
            "Grumpy Bookstore Owner: rolling satisfied score.",
        ],
        ("max_card_points",),
        """
def max_card_points(cards, k):
    score = sum(cards[:k])
    best = score
    for take_right in range(1, k + 1):
        score -= cards[k - take_right]
        score += cards[-take_right]
        best = max(best, score)
    return best
""",
    ),
    ("two-pointers", "same-direction-scan"): _entry(
        "Remove Duplicates from Sorted Array",
        "In-Place Deduplication with Read/Write Pointers",
        "Read scans; write advances only for unique values.",
        "How do I remove duplicates in-place?",
        "Given sorted nums, remove duplicates in-place so each value appears once, and return the new length.",
        "nums = [1, 1, 2, 2, 3]\n\ncompact_scan(nums)",
        "3, with nums[:3] == [1, 2, 3]",
        "The read pointer inspects every value; the write pointer marks the next unique slot.",
        "Read every item; write only the first copy of each value.",
        [
            "Remove Duplicates from Sorted Array: read/write pointer compaction.",
            "Remove Element: write only values you keep.",
            "Move Zeroes: preserve order while compacting non-zero values.",
        ],
        ("compact_scan",),
        """
def compact_scan(nums):
    write = 0
    for read, val in enumerate(nums):
        if read == 0 or val != nums[read - 1]:
            nums[write] = val
            write += 1
    return write
""",
    ),
    ("two-pointers", "opposing-pointers"): _entry(
        "Two Sum II",
        "Sorted Pair Search with Opposing Pointers",
        "Use the sum to discard one pointer side.",
        "Which side can no longer make the target?",
        "Given sorted nums and target, find a pair whose sum equals target.",
        "nums = [2, 7, 11, 15]\ntarget = 9\n\ninward_scan(nums, target)",
        "the pair boundary that reaches target",
        "A small sum needs a larger left value; a large sum needs a smaller right value.",
        "Measure the pair, then move the side that cannot help.",
        [
            "Two Sum II: sorted pair search.",
            "Container With Most Water: discard the shorter wall.",
            "3Sum: sort, fix one value, scan inward.",
        ],
        ("inward_scan",),
        """
def inward_scan(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        total = nums[left] + nums[right]
        if total < target:
            left += 1
        else:
            right -= 1
    return left, right
""",
    ),
    ("two-pointers", "sorted-array-leverage"): _entry(
        "Container With Most Water",
        "Sorted/Ordered Pointer Elimination",
        "Move the side that limits the answer.",
        "Which pointer is safe to discard?",
        "Given ordered candidates, discard the side that cannot improve the current answer.",
        "height = [1, 8, 6, 2, 5, 4, 8, 3, 7]\n\nmax_area(height)",
        "49",
        "Order lets one pointer movement eliminate a whole set of weaker pairs.",
        "Use the ordering signal to move exactly one pointer.",
        [
            "Container With Most Water: discard shorter wall.",
            "Squares of a Sorted Array: largest absolute edge.",
            "3Sum: sorted scan after fixing one value.",
        ],
        ("max_area",),
        """
def max_area(height):
    left, right, best = 0, len(height) - 1, 0
    while left < right:
        best = max(best, min(height[left], height[right]) * (right - left))
        if height[left] < height[right]:
            left += 1
        else:
            right -= 1
    return best
""",
    ),
    ("two-pointers", "dedupe-rules"): _entry(
        "3Sum",
        "Duplicate Skipping Around Pointer Scans",
        "Skip repeated anchors and repeated pointer values.",
        "How do I avoid returning the same combination twice?",
        "Given nums, return unique triplets that sum to zero.",
        "nums = [-1, 0, 1, 2, -1, -4]\n\nthree_sum(nums)",
        "[[-1, -1, 2], [-1, 0, 1]]",
        "Sorting clusters duplicates; skip equal values at the anchor and after recording a pair.",
        "Sort first, then skip duplicates exactly where choices repeat.",
        [
            "3Sum: dedupe anchor and scan values.",
            "4Sum: same sorted dedupe principle.",
            "Remove Duplicates from Sorted Array: keep only first copy.",
        ],
        ("three_sum",),
        """
def three_sum(nums):
    nums.sort()
    out = []
    for i, val in enumerate(nums):
        if i and val == nums[i - 1]:
            continue
        left, right = i + 1, len(nums) - 1
        while left < right:
            total = val + nums[left] + nums[right]
            if total < 0:
                left += 1
            elif total > 0:
                right -= 1
            else:
                out.append([val, nums[left], nums[right]])
                left += 1
    return out
""",
    ),
    ("two-pointers", "pointer-move-rule"): _entry(
        "Valid Palindrome",
        "Pointer Move Rule",
        "Move pointers only after the current pair is resolved.",
        "What condition decides the next pointer move?",
        "Given text, decide whether mirrored characters can match from both ends.",
        's = "racecar"\n\nis_palindrome(s)',
        "True",
        "Each comparison either proves mismatch or lets both pointers move inward.",
        "Compare current pair, then move the pointer named by the rule.",
        [
            "Valid Palindrome: inward pair rule.",
            "Two Sum II: sum decides which side moves.",
            "Container With Most Water: shorter side moves.",
        ],
        ("is_palindrome",),
        """
def is_palindrome(s):
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True
""",
    ),
}


METHOD_PROFILE_CATALOG: dict[tuple[str, str], dict[str, str]] = {
    ("binary-search", "left-right-bounds"): {
        "title": "Search Insert Position",
        "prompt": "Lower Bound with Left/Right Boundaries",
        "function": "lower_bound",
        "plain": "Where is the first valid insertion point?",
        "question": "Given sorted nums and target, return the first index where target could be inserted.",
        "example_in": "nums = [1, 3, 5, 6]\ntarget = 5\n\nlower_bound(nums, target)",
        "example_out": "2",
        "brass": "Maintain an answer range, probe mid, then move one boundary.",
    },
    ("binary-search", "mid-calculation"): {
        "title": "Guess Number Higher or Lower",
        "prompt": "Overflow-Safe Midpoint Probe",
        "function": "binary_search",
        "plain": "How do I probe the middle without breaking bounds?",
        "question": "Given sorted nums and target, probe mid safely while narrowing toward target.",
        "example_in": "nums = [1, 3, 5, 7]\ntarget = 5\n\nbinary_search(nums, target)",
        "example_out": "2",
        "brass": "Use left + (right - left) // 2, then move one side.",
    },
    ("binary-search", "search-on-answer"): {
        "title": "Koko Eating Bananas",
        "prompt": "Binary Search on Feasible Answer",
        "function": "min_speed",
        "plain": "What is the smallest value that passes the check?",
        "question": "Given a monotonic feasibility rule, return the minimum answer that satisfies it.",
        "example_in": "piles = [3, 6, 7, 11]\nhours = 8\n\nmin_speed(piles, hours)",
        "example_out": "4",
        "brass": "Binary search the answer space, not the input array.",
    },
    ("binary-search", "first-last-occurrence"): {
        "title": "Find First and Last Position",
        "prompt": "Duplicate Range Boundary Search",
        "function": "search_range",
        "plain": "Where does the target's duplicate block start and end?",
        "question": "Given sorted nums and target, return the first and last index containing target.",
        "example_in": "nums = [5, 7, 7, 8, 8, 10]\ntarget = 8\n\nsearch_range(nums, target)",
        "example_out": "[3, 4]",
        "brass": "Find target's first slot; find next value's first slot.",
    },
    ("binary-search", "boundary-rule-handling"): {
        "title": "First Bad Version",
        "prompt": "Invariant-Preserving Boundary Update",
        "function": "first_bad",
        "plain": "How do I keep the answer inside the bounds?",
        "question": "Given a monotonic bad-version check, return the first version that is bad.",
        "example_in": "n = 5\n\nfirst_bad(n, is_bad)",
        "example_out": "the first bad version",
        "brass": "One side is impossible; the other still may contain answer.",
    },
    ("dfs-bfs", "base-case-guards"): {
        "title": "Maximum Depth of Binary Tree",
        "prompt": "Recursive Base-Case Guard",
        "function": "tree_depth",
        "plain": "When should recursion stop?",
        "question": "Given a tree node, return the depth while stopping cleanly at missing children.",
        "example_in": "root = TreeNode(1)\n\ntree_depth(root)",
        "example_out": "1",
        "brass": "Handle the empty state before recursing into children.",
    },
    ("dfs-bfs", "visited-tracking"): {
        "title": "Number of Islands",
        "prompt": "Visited Set Traversal",
        "function": "traverse_seen",
        "plain": "How do I visit every reachable state once?",
        "question": "Given connected states, traverse outward without revisiting nodes.",
        "example_in": 'graph = {"A": ["B"], "B": []}\nstart = "A"\n\ntraverse_seen(graph, start)',
        "example_out": '["A", "B"]',
        "brass": "Mark before adding new work so cycles cannot repeat.",
    },
    ("dfs-bfs", "pre-post-order-thinking"): {
        "title": "Diameter of Binary Tree",
        "prompt": "Post-Order Result Assembly",
        "function": "post_order_height",
        "plain": "What result do children need to return first?",
        "question": "Given a tree, compute child results before updating the parent answer.",
        "example_in": "root = TreeNode(1)\n\npost_order_height(root)",
        "example_out": "height from child results",
        "brass": "Recurse first, then combine child values at the parent.",
    },
    ("dfs-bfs", "queue-frontier-management"): {
        "title": "Rotting Oranges",
        "prompt": "Queue Frontier Expansion",
        "function": "bfs_frontier",
        "plain": "What work belongs in the queue next?",
        "question": "Given starting states, process each frontier item and enqueue unseen neighbors.",
        "example_in": 'graph = {"A": ["B"], "B": []}\n\nbfs_frontier(graph, "A")',
        "example_out": "reachable order",
        "brass": "Pop one state, then enqueue only new neighbors.",
    },
    ("dfs-bfs", "level-by-level-expansion"): {
        "title": "Binary Tree Level Order Traversal",
        "prompt": "Level-by-Level BFS",
        "function": "bfs_levels",
        "plain": "How do I separate one BFS layer from the next?",
        "question": "Given a tree or graph, return nodes grouped by BFS distance from the start.",
        "example_in": 'graph = {"A": ["B", "C"], "B": [], "C": []}\n\nbfs_levels(graph, "A")',
        "example_out": '[["A"], ["B", "C"]]',
        "brass": "Freeze the current queue length before expanding the level.",
    },
    ("backtracking", "choice-explore-undo"): {
        "title": "Subsets",
        "prompt": "Choose, Explore, Undo",
        "function": "dfs_choices",
        "plain": "How do I explore every choice cleanly?",
        "question": "Given items, return every subset formed by choosing or skipping each item.",
        "example_in": "items = [1, 2]\n\ndfs_choices(items)",
        "example_out": "[[], [2], [1], [1, 2]]",
        "brass": "Choose one item, recurse, then pop it back off.",
    },
    ("backtracking", "path-state"): {
        "title": "Permutations",
        "prompt": "Path State Tracking",
        "function": "permute_path",
        "plain": "What is currently in this branch's path?",
        "question": "Given nums, build permutations by tracking the active path and used values.",
        "example_in": "nums = [1, 2]\n\npermute_path(nums)",
        "example_out": "[[1, 2], [2, 1]]",
        "brass": "The path is branch-local state; restore it after recursion.",
    },
    ("backtracking", "pruning-conditions"): {
        "title": "Combination Sum",
        "prompt": "Backtracking with Pruning",
        "function": "combination_prune",
        "plain": "When can this branch stop early?",
        "question": "Given candidates and target, skip branches that already exceed the target.",
        "example_in": "candidates = [2, 3, 6, 7]\ntarget = 7\n\ncombination_prune(candidates, target)",
        "example_out": "[[2, 2, 3], [7]]",
        "brass": "Check impossible totals before exploring deeper.",
    },
    ("backtracking", "start-index-control"): {
        "title": "Combinations",
        "prompt": "Start Index Control",
        "function": "combine_from",
        "plain": "How do I avoid reusing earlier choices?",
        "question": "Given n and k, generate combinations by advancing the start index.",
        "example_in": "n = 4\nk = 2\n\ncombine_from(n, k)",
        "example_out": "six 2-number combinations",
        "brass": "Pass the next start index so choices stay ordered.",
    },
    ("backtracking", "result-collection"): {
        "title": "Palindrome Partitioning",
        "prompt": "Result Collection at Leaves",
        "function": "collect_paths",
        "plain": "When is a path complete enough to record?",
        "question": "Given choices, record a copy only when the path reaches a valid leaf.",
        "example_in": 's = "aab"\n\ncollect_paths(s)',
        "example_out": "valid complete partitions",
        "brass": "Append a copy at the leaf, never the live path object.",
    },
    ("heap", "top-k-maintenance"): {
        "title": "Kth Largest Element in an Array",
        "prompt": "Top-K Maintenance with a Min-Heap",
        "function": "keep_top_k",
        "plain": "How do I keep only the best k items?",
        "question": "Given nums and k, keep the k largest values seen so far.",
        "example_in": "nums = [3, 2, 1, 5, 6, 4]\nk = 2\n\nkeep_top_k(nums, k)",
        "example_out": "a heap containing the top 2 values",
        "brass": "Push candidate, then pop if you kept too many.",
    },
    ("heap", "min-vs-max-heap-choice"): {
        "title": "Last Stone Weight",
        "prompt": "Max-Heap via Negated Values",
        "function": "max_heap_pop",
        "plain": "Do I need the smallest or largest item next?",
        "question": "Given priorities, repeatedly pull the largest item first.",
        "example_in": "stones = [2, 7, 4, 1, 8, 1]\n\nmax_heap_pop(stones)",
        "example_out": "largest-priority processing order",
        "brass": "Use negative values when Python needs max-heap behavior.",
    },
    ("heap", "push-pop-discipline"): {
        "title": "Find Median from Data Stream",
        "prompt": "Heap Push/Pop Discipline",
        "function": "rebalance_heaps",
        "plain": "What must be true after each heap update?",
        "question": "Given a stream, push new values and rebalance heaps after every insert.",
        "example_in": "values = [1, 2, 3]\n\nrebalance_heaps(values)",
        "example_out": "balanced heap state",
        "brass": "Push first, then pop/rebalance until the invariant holds.",
    },
    ("heap", "stream-processing"): {
        "title": "Kth Largest in a Stream",
        "prompt": "Streaming Top-K Heap",
        "function": "stream_top_k",
        "plain": "How do I update the answer after each new item?",
        "question": "Given stream values, maintain the kth largest after each insertion.",
        "example_in": "values = [4, 5, 8, 2]\nk = 3\n\nstream_top_k(values, k)",
        "example_out": "running kth-largest values",
        "brass": "Handle one new value, prune, then read heap top.",
    },
    ("heap", "lazy-deletion-patterns"): {
        "title": "Sliding Window Median",
        "prompt": "Lazy Heap Deletion",
        "function": "prune_deleted",
        "plain": "How do I remove stale heap items later?",
        "question": "Given a moving window, delay heap deletion until stale items reach the top.",
        "example_in": "heap = [1, 2, 3]\ndelayed = {1: 1}\n\nprune_deleted(heap, delayed)",
        "example_out": "heap top is no longer stale",
        "brass": "Mark stale now; physically pop only when it reaches top.",
    },
    ("union-find", "parent-initialization"): {
        "title": "Number of Provinces",
        "prompt": "Parent Initialization",
        "function": "init_parent",
        "plain": "How does each node start as its own group?",
        "question": "Given n nodes, initialize each node as a separate component.",
        "example_in": "n = 3\n\ninit_parent(n)",
        "example_out": "{0: 0, 1: 1, 2: 2}",
        "brass": "Every node points to itself before any union.",
    },
    ("union-find", "find-with-compression"): {
        "title": "Accounts Merge",
        "prompt": "Find with Path Compression",
        "function": "find",
        "plain": "How do I shorten parent chains while finding roots?",
        "question": "Given parent links, return a node's root and compress the path.",
        "example_in": "parent = {0: 1, 1: 1}\n\nfind(0)",
        "example_out": "1",
        "brass": "Walk to root, then point nodes closer to root.",
    },
    ("union-find", "union-by-rank-size"): {
        "title": "Union by Size",
        "prompt": "Union by Rank or Size",
        "function": "union_by_size",
        "plain": "Which root should absorb the other?",
        "question": "Given two nodes, merge their components while keeping trees shallow.",
        "example_in": "parent = [0, 1]\nsize = [1, 1]\n\nunion_by_size(0, 1)",
        "example_out": "one merged component",
        "brass": "Attach the smaller root beneath the larger root.",
    },
    ("union-find", "component-counting"): {
        "title": "Number of Connected Components",
        "prompt": "Component Count on Union",
        "function": "count_components",
        "plain": "When does the component count decrease?",
        "question": "Given n and edges, count connected components after merging endpoints.",
        "example_in": "n = 5\nedges = [[0, 1], [1, 2]]\n\ncount_components(n, edges)",
        "example_out": "3",
        "brass": "Only decrement when two different roots merge.",
    },
    ("union-find", "cycle-detection"): {
        "title": "Redundant Connection",
        "prompt": "Cycle Detection by Same Root",
        "function": "find_cycle_edge",
        "plain": "Does this edge connect nodes already joined?",
        "question": "Given edges, return the edge that would create a cycle.",
        "example_in": "edges = [[1, 2], [1, 3], [2, 3]]\n\nfind_cycle_edge(edges)",
        "example_out": "[2, 3]",
        "brass": "If endpoints share a root, this edge is redundant.",
    },
    ("dynamic-programming", "state-definition"): {
        "title": "House Robber",
        "prompt": "DP State Definition",
        "function": "rob_state",
        "plain": "What does each state mean?",
        "question": "Given nums, define states for best total when taking or skipping current value.",
        "example_in": "nums = [2, 7, 9, 3, 1]\n\nrob_state(nums)",
        "example_out": "12",
        "brass": "State meaning first; transition second.",
    },
    ("dynamic-programming", "transition-equation"): {
        "title": "Min Cost Climbing Stairs",
        "prompt": "DP Transition Equation",
        "function": "min_cost",
        "plain": "Which solved states feed the current one?",
        "question": "Given costs, compute each state from the cheaper previous choices.",
        "example_in": "cost = [10, 15, 20]\n\nmin_cost(cost)",
        "example_out": "15",
        "brass": "Write current state as a function of solved states.",
    },
    ("dynamic-programming", "base-cases"): {
        "title": "Climbing Stairs",
        "prompt": "DP Base Cases",
        "function": "climb_base",
        "plain": "What answers are known before the loop starts?",
        "question": "Given n stairs, seed the recurrence with the smallest known cases.",
        "example_in": "n = 3\n\nclimb_base(n)",
        "example_out": "3",
        "brass": "Seed tiny inputs so every later state can look backward.",
    },
    ("dynamic-programming", "iteration-order"): {
        "title": "Coin Change",
        "prompt": "DP Iteration Order",
        "function": "coin_change_order",
        "plain": "Which direction makes dependencies ready?",
        "question": "Given coins and amount, iterate states so each transition reads solved values.",
        "example_in": "coins = [1, 2, 5]\namount = 11\n\ncoin_change_order(coins, amount)",
        "example_out": "3",
        "brass": "Loop in the order that makes dependencies already computed.",
    },
    ("dynamic-programming", "time-and-space-optimization"): {
        "title": "House Robber Space Optimized",
        "prompt": "DP Space Optimization",
        "function": "rob_rolling",
        "plain": "Which old states do I actually still need?",
        "question": "Given nums, keep only rolling states instead of the whole DP table.",
        "example_in": "nums = [2, 7, 9, 3, 1]\n\nrob_rolling(nums)",
        "example_out": "12",
        "brass": "Keep only the previous states used by the next transition.",
    },
    ("graph-traversal", "adjacency-representation"): {
        "title": "Clone Graph",
        "prompt": "Adjacency Representation Traversal",
        "function": "walk_adjacency",
        "plain": "How is each node's neighbor list represented?",
        "question": "Given an adjacency map and start node, traverse reachable neighbors once.",
        "example_in": 'graph = {"A": ["B"], "B": []}\n\nwalk_adjacency(graph, "A")',
        "example_out": '["A", "B"]',
        "brass": "Read neighbors from the adjacency structure, not from scattered conditionals.",
    },
    ("graph-traversal", "start-state-selection"): {
        "title": "Number of Islands",
        "prompt": "Traversal Start State Selection",
        "function": "start_components",
        "plain": "Which unvisited state starts the next traversal?",
        "question": "Given many states, start a traversal only from states not already visited.",
        "example_in": "grid = [[1, 1], [0, 1]]\n\nstart_components(grid)",
        "example_out": "1 component",
        "brass": "Scan for unvisited starts; each traversal consumes one component.",
    },
    ("graph-traversal", "topological-ordering"): {
        "title": "Course Schedule",
        "prompt": "Topological Ordering by Indegree",
        "function": "topo_order",
        "plain": "Which nodes are ready before their dependents?",
        "question": "Given prerequisites, return an order where each course appears after its prerequisites.",
        "example_in": "graph = {0: [1], 1: []}\n\ntopo_order(graph)",
        "example_out": "[0, 1]",
        "brass": "Start with indegree-zero nodes, then unlock neighbors.",
    },
    ("graph-traversal", "indegree-bookkeeping"): {
        "title": "Course Schedule II",
        "prompt": "Indegree Bookkeeping",
        "function": "update_indegree",
        "plain": "How do completed nodes unlock later nodes?",
        "question": "Given directed edges, decrement neighbor indegrees as prerequisites are processed.",
        "example_in": "graph = {0: [1], 1: []}\n\nupdate_indegree(graph)",
        "example_out": "nodes released in prerequisite order",
        "brass": "Every processed edge lowers one neighbor's remaining prerequisite count.",
    },
    ("graph-traversal", "shortest-path-framing"): {
        "title": "Shortest Path in Binary Matrix",
        "prompt": "BFS Shortest-Path Framing",
        "function": "shortest_path_bfs",
        "plain": "Why does BFS find the shortest unweighted path?",
        "question": "Given an unweighted graph, return the minimum number of edges from start to target.",
        "example_in": 'graph = {"A": ["B"], "B": []}\n\nshortest_path_bfs(graph, "A", "B")',
        "example_out": "1",
        "brass": "Process by levels; the first target hit is shortest.",
    },
    ("intervals", "sort-by-start-end"): {
        "title": "Meeting Rooms",
        "prompt": "Sort Intervals by Boundary",
        "function": "sort_intervals",
        "plain": "Which boundary order makes comparisons local?",
        "question": "Given intervals, sort by start time so neighboring intervals reveal conflicts.",
        "example_in": "intervals = [[5, 8], [1, 3]]\n\nsort_intervals(intervals)",
        "example_out": "[[1, 3], [5, 8]]",
        "brass": "Sort once so each decision compares against the current neighbor.",
    },
    ("intervals", "merge-overlap-logic"): {
        "title": "Merge Intervals",
        "prompt": "Merge Overlap Logic",
        "function": "merge_intervals",
        "plain": "Can the next interval extend the current merged tail?",
        "question": "Given intervals, merge every overlapping range into disjoint intervals.",
        "example_in": "intervals = [[1, 3], [2, 6], [8, 10]]\n\nmerge_intervals(intervals)",
        "example_out": "[[1, 6], [8, 10]]",
        "brass": "Append if separate, extend the tail if overlapping.",
    },
    ("intervals", "sweep-decisions"): {
        "title": "Employee Free Time",
        "prompt": "Interval Sweep Decision",
        "function": "sweep_intervals",
        "plain": "What event changes the active interval state?",
        "question": "Given sorted interval boundaries, sweep through events and update active state.",
        "example_in": "intervals = [[1, 3], [2, 4]]\n\nsweep_intervals(intervals)",
        "example_out": "swept active counts",
        "brass": "Turn starts and ends into ordered events, then update active state.",
    },
    ("intervals", "room-resource-counting"): {
        "title": "Meeting Rooms II",
        "prompt": "Room Counting with Boundaries",
        "function": "min_rooms",
        "plain": "How many intervals are active at once?",
        "question": "Given meeting intervals, return the minimum rooms needed.",
        "example_in": "intervals = [[0, 30], [5, 10], [15, 20]]\n\nmin_rooms(intervals)",
        "example_out": "2",
        "brass": "Count active starts minus ended meetings; max active is rooms.",
    },
    ("intervals", "boundary-comparisons"): {
        "title": "Insert Interval",
        "prompt": "Interval Boundary Comparison",
        "function": "insert_interval",
        "plain": "Is this interval before, after, or overlapping the new range?",
        "question": "Given disjoint intervals and a new interval, insert and merge it.",
        "example_in": "intervals = [[1, 3], [6, 9]]\nnew = [2, 5]\n\ninsert_interval(intervals, new)",
        "example_out": "[[1, 5], [6, 9]]",
        "brass": "Compare starts and ends to decide append, merge, or defer.",
    },
    ("prefix-sums", "running-total-setup"): {
        "title": "Running Sum of 1d Array",
        "prompt": "Running Prefix Total",
        "function": "running_total",
        "plain": "How do I carry a cumulative total forward?",
        "question": "Given nums, return the running sum at every index.",
        "example_in": "nums = [1, 2, 3]\n\nrunning_total(nums)",
        "example_out": "[1, 3, 6]",
        "brass": "Add current value to the carried prefix before recording.",
    },
    ("prefix-sums", "sum-to-index-map"): {
        "title": "Subarray Sum Equals K",
        "prompt": "Prefix Sum Lookup Map",
        "function": "prefix_counts",
        "plain": "Which previous prefix would make this subarray work?",
        "question": "Given nums and target, count subarrays whose sum equals target.",
        "example_in": "nums = [1, 1, 1]\ntarget = 2\n\nprefix_counts(nums, target)",
        "example_out": "2",
        "brass": "Current prefix minus target names the previous prefix to count.",
    },
    ("prefix-sums", "subarray-difference-trick"): {
        "title": "Range Sum Query",
        "prompt": "Subarray Difference Trick",
        "function": "range_sum",
        "plain": "How do two prefixes give one range sum?",
        "question": "Given prefix sums and a range, return the subarray sum in O(1).",
        "example_in": "prefix = [0, 2, 5, 9]\nleft = 1\nright = 2\n\nrange_sum(prefix, left, right)",
        "example_out": "7",
        "brass": "Range sum is prefix after right minus prefix before left.",
    },
    ("prefix-sums", "mod-remainder-buckets"): {
        "title": "Subarray Sums Divisible by K",
        "prompt": "Modulo Remainder Buckets",
        "function": "count_mod_buckets",
        "plain": "Which earlier prefixes had this same remainder?",
        "question": "Given nums and k, count subarrays whose sum is divisible by k.",
        "example_in": "nums = [4, 5, 0, -2, -3, 1]\nk = 5\n\ncount_mod_buckets(nums, k)",
        "example_out": "7",
        "brass": "Equal remainders mean the subarray between them divides cleanly.",
    },
    ("prefix-sums", "constant-time-range-queries"): {
        "title": "Range Sum Query Immutable",
        "prompt": "Constant-Time Range Query",
        "function": "query_sum",
        "plain": "What preprocessing makes each query O(1)?",
        "question": "Given nums and many range queries, answer each sum with prefix differences.",
        "example_in": "prefix = [0, -2, -2, 1]\n\nquery_sum(prefix, 0, 2)",
        "example_out": "1",
        "brass": "Pay once to build prefixes; answer each query by subtraction.",
    },
    ("monotonic-stack", "increasing-vs-decreasing-stack"): {
        "title": "Daily Temperatures",
        "prompt": "Increasing vs Decreasing Stack",
        "function": "monotonic_direction",
        "plain": "Should the stack keep rising or falling candidates?",
        "question": "Given nums, choose stack direction so the current value resolves prior candidates.",
        "example_in": "temps = [73, 74, 75]\n\nmonotonic_direction(temps)",
        "example_out": "next warmer waits",
        "brass": "Pick stack direction from the comparison that resolves waiting items.",
    },
    ("monotonic-stack", "next-greater-smaller"): {
        "title": "Next Greater Element",
        "prompt": "Next Greater/Smaller Resolution",
        "function": "next_greater",
        "plain": "Which earlier items does this value resolve?",
        "question": "Given nums, find the next greater value for each position.",
        "example_in": "nums = [2, 1, 3]\n\nnext_greater(nums)",
        "example_out": "[3, 3, -1]",
        "brass": "Pop every unresolved item answered by the current value.",
    },
    ("monotonic-stack", "pop-trigger-rule"): {
        "title": "Largest Rectangle in Histogram",
        "prompt": "Stack Pop Trigger Rule",
        "function": "pop_on_break",
        "plain": "What condition means the stack top is finished?",
        "question": "Given heights, pop bars when the current height breaks increasing order.",
        "example_in": "heights = [2, 1, 5, 6, 2, 3]\n\npop_on_break(heights)",
        "example_out": "10",
        "brass": "Pop when current value proves the top cannot extend farther.",
    },
    ("monotonic-stack", "index-storage"): {
        "title": "Online Stock Span",
        "prompt": "Store Indices for Distance",
        "function": "span_indices",
        "plain": "Why store indices instead of only values?",
        "question": "Given prices, use stack indices to compute distance to the previous blocker.",
        "example_in": "prices = [100, 80, 60, 70]\n\nspan_indices(prices)",
        "example_out": "stock spans",
        "brass": "Store indices when the answer depends on distance or width.",
    },
    ("monotonic-stack", "span-area-computation"): {
        "title": "Largest Rectangle in Histogram",
        "prompt": "Span/Area from Popped Index",
        "function": "area_from_span",
        "plain": "What width belongs to the popped height?",
        "question": "Given heights, compute area when a popped bar's span is known.",
        "example_in": "heights = [2, 1, 5, 6, 2, 3]\n\narea_from_span(heights)",
        "example_out": "10",
        "brass": "When popping, current index and new stack top define width.",
    },
}


STATIC_DIFFICULTY_CATALOG: dict[tuple[str, str], str] = {
    ("sliding-window", "fixed-vs-variable-window"): "Easy",
    ("sliding-window", "expand-shrink-rhythm"): "Med.",
    ("sliding-window", "frequency-maps"): "Med.",
    ("sliding-window", "valid-window-rule"): "Med.",
    ("sliding-window", "window-score-updates"): "Med.",
    ("two-pointers", "same-direction-scan"): "Easy",
    ("two-pointers", "opposing-pointers"): "Med.",
    ("two-pointers", "sorted-array-leverage"): "Med.",
    ("two-pointers", "dedupe-rules"): "Med.",
    ("two-pointers", "pointer-move-rule"): "Easy",
    ("binary-search", "left-right-bounds"): "Easy",
    ("binary-search", "mid-calculation"): "Easy",
    ("binary-search", "search-on-answer"): "Med.",
    ("binary-search", "first-last-occurrence"): "Med.",
    ("binary-search", "boundary-rule-handling"): "Easy",
    ("dfs-bfs", "base-case-guards"): "Easy",
    ("dfs-bfs", "visited-tracking"): "Med.",
    ("dfs-bfs", "pre-post-order-thinking"): "Easy",
    ("dfs-bfs", "queue-frontier-management"): "Med.",
    ("dfs-bfs", "level-by-level-expansion"): "Med.",
    ("backtracking", "choice-explore-undo"): "Med.",
    ("backtracking", "path-state"): "Med.",
    ("backtracking", "pruning-conditions"): "Med.",
    ("backtracking", "start-index-control"): "Med.",
    ("backtracking", "result-collection"): "Med.",
    ("heap", "top-k-maintenance"): "Med.",
    ("heap", "min-vs-max-heap-choice"): "Easy",
    ("heap", "push-pop-discipline"): "Hard",
    ("heap", "stream-processing"): "Easy",
    ("heap", "lazy-deletion-patterns"): "Hard",
    ("union-find", "parent-initialization"): "Med.",
    ("union-find", "find-with-compression"): "Med.",
    ("union-find", "union-by-rank-size"): "Med.",
    ("union-find", "component-counting"): "Med.",
    ("union-find", "cycle-detection"): "Med.",
    ("dynamic-programming", "state-definition"): "Med.",
    ("dynamic-programming", "transition-equation"): "Easy",
    ("dynamic-programming", "base-cases"): "Easy",
    ("dynamic-programming", "iteration-order"): "Med.",
    ("dynamic-programming", "time-and-space-optimization"): "Med.",
    ("graph-traversal", "adjacency-representation"): "Med.",
    ("graph-traversal", "start-state-selection"): "Med.",
    ("graph-traversal", "topological-ordering"): "Med.",
    ("graph-traversal", "indegree-bookkeeping"): "Med.",
    ("graph-traversal", "shortest-path-framing"): "Med.",
    ("intervals", "sort-by-start-end"): "Easy",
    ("intervals", "merge-overlap-logic"): "Med.",
    ("intervals", "sweep-decisions"): "Hard",
    ("intervals", "room-resource-counting"): "Med.",
    ("intervals", "boundary-comparisons"): "Med.",
    ("prefix-sums", "running-total-setup"): "Easy",
    ("prefix-sums", "sum-to-index-map"): "Med.",
    ("prefix-sums", "subarray-difference-trick"): "Easy",
    ("prefix-sums", "mod-remainder-buckets"): "Med.",
    ("prefix-sums", "constant-time-range-queries"): "Easy",
    ("monotonic-stack", "increasing-vs-decreasing-stack"): "Med.",
    ("monotonic-stack", "next-greater-smaller"): "Easy",
    ("monotonic-stack", "pop-trigger-rule"): "Hard",
    ("monotonic-stack", "index-storage"): "Med.",
    ("monotonic-stack", "span-area-computation"): "Hard",
}


SPECIFIC_SKELETONS: dict[str, str] = {
    "tree_depth": """
def tree_depth(root):                                   
    if not root:
        return 0
    left = tree_depth(root.left)
    right = tree_depth(root.right)
    return 1 + max(left, right)
""",
    "traverse_seen": """
def traverse_seen(graph, start):
    seen, stack, order = {start}, [start], []
    while stack:
        node = stack.pop()
        order.append(node)
        for nxt in graph[node]:
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return order
""",
    "post_order_height": """
def post_order_height(root):
    if not root:
        return 0
    left = post_order_height(root.left)
    right = post_order_height(root.right)
    return 1 + max(left, right)
""",
    "bfs_frontier": """
def bfs_frontier(graph, start):
    seen, frontier, order = {start}, [start], []
    while frontier:
        node = frontier.pop(0)
        order.append(node)
        for nxt in graph[node]:
            if nxt not in seen:
                seen.add(nxt)
                frontier.append(nxt)
    return order
""",
    "bfs_levels": """
def bfs_levels(root):
    queue, levels = [root], []
    while queue:
        level, next_queue = [], []
        for node in queue:
            level.append(node.val)
            next_queue += [node.left, node.right]
        levels.append(level)
        queue = [node for node in next_queue if node]
    return levels
""",
    "dfs_choices": """
def dfs_choices(items):
    path, result = [], []

    def dfs(i):
        if i == len(items):
            result.append(path[:])
            return
        dfs(i + 1)
        path.append(items[i])
        dfs(i + 1)
        path.pop()

    dfs(0)
    return result
""",
    "permute_path": """
def permute_path(nums):
    path, used, result = [], set(), []

    def dfs():
        if len(path) == len(nums):
            result.append(path[:])
            return
        for i, val in enumerate(nums):
            if i in used:
                continue
            used.add(i)
            path.append(val)
            dfs()
            path.pop()
            used.remove(i)

    dfs()
    return result
""",
    "combination_prune": """
def combination_prune(nums, target):
    nums.sort()
    path, result = [], []

    def dfs(start, total):
        if total == target:
            result.append(path[:])
            return
        for i in range(start, len(nums)):
            if total + nums[i] > target:
                break
            path.append(nums[i])
            dfs(i + 1, total + nums[i])
            path.pop()

    dfs(0, 0)
    return result
""",
    "combine_from": """
def combine_from(nums, k):
    path, result = [], []

    def dfs(start):
        if len(path) == k:
            result.append(path[:])
            return
        for i in range(start, len(nums)):
            path.append(nums[i])
            dfs(i + 1)
            path.pop()

    dfs(0)
    return result
""",
    "collect_paths": """
def collect_paths(root):
    path, result = [], []

    def dfs(node):
        if not node:
            return
        path.append(node.val)
        if not node.left and not node.right:
            result.append(path[:])
        dfs(node.left)
        dfs(node.right)
        path.pop()

    dfs(root)
    return result
""",
    "keep_top_k": """
def keep_top_k(nums, k):
    heap = []
    for val in nums:
        heappush(heap, val)
        if len(heap) > k:
            heappop(heap)
    return heap
""",
    "max_heap_pop": """
def max_heap_pop(nums, k):
    heap = []
    for val in nums:
        heappush(heap, -val)
    for _ in range(k - 1):
        heappop(heap)
    return -heap[0]
""",
    "rebalance_heaps": """
def rebalance_heaps(nums):
    low, high = [], []
    for val in nums:
        heappush(low, -val)
        heappush(high, -heappop(low))
        if len(high) > len(low):
            heappush(low, -heappop(high))
    return -low[0]
""",
    "stream_top_k": """
def stream_top_k(stream, k):
    heap, snapshots = [], []
    for val in stream:
        heappush(heap, val)
        if len(heap) > k:
            heappop(heap)
        snapshots.append(heap[0])
    return snapshots
""",
    "prune_deleted": """
def prune_deleted(heap, deleted):
    while heap and deleted.get(heap[0], 0):
        val = heappop(heap)
        deleted[val] -= 1
    return heap[0] if heap else None
""",
    "init_parent": """
def init_parent(n):
    parent = list(range(n))
    size = [1] * n
    return parent, size
""",
    "find": """
def find(parent, x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
""",
    "union_by_size": """
def union_by_size(parent, size, a, b):
    ra, rb = find(parent, a), find(parent, b)
    if ra == rb:
        return False
    if size[ra] < size[rb]:
        ra, rb = rb, ra
    parent[rb] = ra
    size[ra] += size[rb]
    return True
""",
    "count_components": """
def count_components(n, edges):
    parent, size = init_parent(n)
    count = n
    for a, b in edges:
        if union_by_size(parent, size, a, b):
            count -= 1
    return count
""",
    "find_cycle_edge": """
def find_cycle_edge(n, edges):
    parent, size = init_parent(n)
    for a, b in edges:
        if not union_by_size(parent, size, a, b):
            return [a, b]
    return []
""",
    "rob_state": """
def rob_state(nums):
    dp = [0] * (len(nums) + 1)
    for i, val in enumerate(nums, 1):
        take = val + (dp[i - 2] if i >= 2 else 0)
        skip = dp[i - 1]
        dp[i] = max(take, skip)
    return dp[-1]
""",
    "min_cost": """
def min_cost(cost):
    dp = [0] * (len(cost) + 1)
    for i in range(2, len(dp)):
        one = dp[i - 1] + cost[i - 1]
        two = dp[i - 2] + cost[i - 2]
        dp[i] = min(one, two)
    return dp[-1]
""",
    "climb_base": """
def climb_base(n):
    if n <= 2:
        return n
    prev2, prev1 = 1, 2
    for _ in range(3, n + 1):
        prev2, prev1 = prev1, prev1 + prev2
    return prev1
""",
    "coin_change_order": """
def coin_change_order(coins, amount):
    dp = [0] + [float("inf")] * amount
    for total in range(1, amount + 1):
        for coin in coins:
            if total >= coin:
                dp[total] = min(dp[total], dp[total - coin] + 1)
    return -1 if dp[amount] == float("inf") else dp[amount]
""",
    "rob_rolling": """
def rob_rolling(nums):
    take = 0
    skip = 0
    for val in nums:
        take, skip = skip + val, max(take, skip)
    return max(take, skip)
""",
    "walk_adjacency": """
def walk_adjacency(graph, start):
    seen, stack, order = {start}, [start], []
    while stack:
        node = stack.pop()
        order.append(node)
        for nxt in graph.get(node, []):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return order
""",
    "start_components": """
def start_components(graph):
    seen, count = set(), 0
    for start in graph:
        if start in seen:
            continue
        count += 1
        stack = [start]
        seen.add(start)
        while stack:
            node = stack.pop()
            for nxt in graph[node]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
    return count
""",
    "topo_order": """
def topo_order(graph):
    indegree = {node: 0 for node in graph}
    for node in graph:
        for nxt in graph[node]:
            indegree[nxt] += 1
    q = [node for node in indegree if indegree[node] == 0]
    order = []
    while q:
        node = q.pop(0)
        order.append(node)
        for nxt in graph[node]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                q.append(nxt)
    return order
""",
    "update_indegree": """
def update_indegree(graph):
    indegree = {node: 0 for node in graph}
    for node, neighbors in graph.items():
        for nxt in neighbors:
            indegree[nxt] = indegree.get(nxt, 0) + 1
    return indegree
""",
    "shortest_path_bfs": """
def shortest_path_bfs(graph, start, target):
    seen, q, dist = {start}, [start], 0
    while q:
        for _ in range(len(q)):
            node = q.pop(0)
            if node == target:
                return dist
            for nxt in graph[node]:
                if nxt not in seen:
                    seen.add(nxt)
                    q.append(nxt)
        dist += 1
    return -1
""",
    "sort_intervals": """
def sort_intervals(intervals):
    intervals.sort(key=lambda item: (item[0], item[1]))
    return intervals
""",
    "merge_intervals": """
def merge_intervals(intervals):
    intervals.sort()
    out = []
    for start, end in intervals:
        if not out or start > out[-1][1]:
            out.append([start, end])
        else:
            out[-1][1] = max(out[-1][1], end)
    return out
""",
    "sweep_intervals": """
def sweep_intervals(intervals):
    events = []
    for start, end in intervals:
        events.append((start, 1))
        events.append((end, -1))
    active = best = 0
    for _, delta in sorted(events):
        active += delta
        best = max(best, active)
    return best
""",
    "min_rooms": """
def min_rooms(meetings):
    starts = sorted(start for start, _ in meetings)
    ends = sorted(end for _, end in meetings)
    used = end_i = 0
    for start in starts:
        if start >= ends[end_i]:
            end_i += 1
        else:
            used += 1
    return used
""",
    "insert_interval": """
def insert_interval(intervals, new_interval):
    out, i = [], 0
    while i < len(intervals) and intervals[i][1] < new_interval[0]:
        out.append(intervals[i])
        i += 1
    while i < len(intervals) and intervals[i][0] <= new_interval[1]:
        new_interval[0] = min(new_interval[0], intervals[i][0])
        new_interval[1] = max(new_interval[1], intervals[i][1])
        i += 1
    return out + [new_interval] + intervals[i:]
""",
    "running_total": """
def running_total(nums):
    total, prefix = 0, [0]
    for val in nums:
        total += val
        prefix.append(total)
    return prefix
""",
    "prefix_counts": """
def prefix_counts(nums, target):
    seen, total, count = {0: 1}, 0, 0
    for val in nums:
        total += val
        count += seen.get(total - target, 0)
        seen[total] = seen.get(total, 0) + 1
    return count
""",
    "range_sum": """
def range_sum(nums, left, right):
    prefix = running_total(nums)
    return prefix[right + 1] - prefix[left]
""",
    "count_mod_buckets": """
def count_mod_buckets(nums, k):
    seen, total, count = {0: 1}, 0, 0
    for val in nums:
        total = (total + val) % k
        count += seen.get(total, 0)
        seen[total] = seen.get(total, 0) + 1
    return count
""",
    "query_sum": """
def query_sum(prefix, left, right):
    return prefix[right + 1] - prefix[left]
""",
    "monotonic_direction": """
def monotonic_direction(nums):
    stack = []
    for i, val in enumerate(nums):
        while stack and nums[stack[-1]] >= val:
            stack.pop()
        stack.append(i)
    return stack
""",
    "next_greater": """
def next_greater(nums):
    ans = [-1] * len(nums)
    stack = []
    for i, val in enumerate(nums):
        while stack and nums[stack[-1]] < val:
            ans[stack.pop()] = val
        stack.append(i)
    return ans
""",
    "pop_on_break": """
def pop_on_break(nums):
    stack, popped = [], []
    for i, val in enumerate(nums):
        while stack and nums[stack[-1]] > val:
            popped.append(stack.pop())
        stack.append(i)
    return popped
""",
    "span_indices": """
def span_indices(prices):
    stack, spans = [], []
    for i, price in enumerate(prices):
        while stack and prices[stack[-1]] <= price:
            stack.pop()
        prev = stack[-1] if stack else -1
        spans.append(i - prev)
        stack.append(i)
    return spans
""",
    "area_from_span": """
def area_from_span(heights):
    stack, best = [], 0
    for i, height in enumerate(heights + [0]):
        while stack and heights[stack[-1]] > height:
            h = heights[stack.pop()]
            left = stack[-1] if stack else -1
            best = max(best, h * (i - left - 1))
        stack.append(i)
    return best
""",
}


def _core_algorithm_skeleton(family: str, method: str, function_name: str) -> str:
    if function_name in SPECIFIC_SKELETONS:
        return SPECIFIC_SKELETONS[function_name]
    if family == "binary-search":
        if function_name == "binary_search":
            return """
def binary_search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
"""
        if function_name == "min_speed":
            return """
def min_speed(piles, hours):
    left, right = 1, max(piles)
    while left < right:
        mid = (left + right) // 2
        if can_finish(mid, piles, hours):
            right = mid
        else:
            left = mid + 1
    return left
"""
        if function_name == "search_range":
            return """
def search_range(nums, target):
    left = lower_bound(nums, target)
    right = lower_bound(nums, target + 1) - 1
    if left <= right and right < len(nums):
        return [left, right]
    return [-1, -1]
"""
        if function_name == "first_bad":
            return """
def first_bad(n, is_bad):
    left, right = 1, n
    while left < right:
        mid = left + (right - left) // 2
        if is_bad(mid):
            right = mid
        else:
            left = mid + 1
    return left
"""
        return """
def lower_bound(nums, target):
    left, right = 0, len(nums)
    while left < right:
        mid = (left + right) // 2
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid
    return left
"""
    if family == "graph-traversal":
        if function_name in {"topo_order", "update_indegree"}:
            return f"""
def {function_name}(graph):
    indegree = {{node: 0 for node in graph}}
    for node in graph:
        for nxt in graph[node]:
            indegree[nxt] += 1
    q = [node for node in indegree if indegree[node] == 0]
    order = []
    while q:
        node = q.pop(0)
        order.append(node)
    return order
"""
        if function_name == "shortest_path_bfs":
            return """
def shortest_path_bfs(graph, start, target):
    seen, q, dist = {start}, [start], 0
    while q:
        for _ in range(len(q)):
            node = q.pop(0)
            if node == target:
                return dist
            for nxt in graph[node]:
                if nxt not in seen:
                    seen.add(nxt)
                    q.append(nxt)
        dist += 1
    return -1
"""
        return f"""
def {function_name}(graph, start):
    seen, q, out = {{start}}, [start], []
    while q:
        node = q.pop(0)
        out.append(node)
        for nxt in graph[node]:
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)
    return out
"""
    if family == "dfs-bfs":
        return f"""
def {function_name}(graph, start):
    seen, queue, out = {{start}}, [start], []
    while queue:
        node = queue.pop(0)
        out.append(node)
        for nxt in graph[node]:
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return out
"""
    if family == "backtracking":
        return f"""
def {function_name}(items):
    path, result = [], []

    def dfs(i):
        if i == len(items):
            result.append(path[:])
            return
        dfs(i + 1)
        path.append(items[i])
        dfs(i + 1)
        path.pop()

    dfs(0)
    return result
"""
    if family == "heap":
        return f"""
def {function_name}(nums, k):
    heap = []
    for val in nums:
        heappush(heap, val)
        if len(heap) > k:
            heappop(heap)
    return heap
"""
    if family == "union-find":
        return f"""
def {function_name}(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        parent[find(a)] = find(b)
    return parent
"""
    if family in {"dynamic-programming", "dp"}:
        return f"""
def {function_name}(nums):
    take = 0
    skip = 0
    for val in nums:
        take, skip = skip + val, max(take, skip)
    return max(take, skip)
"""
    if family == "intervals":
        return f"""
def {function_name}(intervals):
    intervals.sort()
    out = []
    for start, end in intervals:
        if not out or start > out[-1][1]:
            out.append([start, end])
        else:
            out[-1][1] = max(out[-1][1], end)
    return out
"""
    if family == "prefix-sums":
        return f"""
def {function_name}(nums, target):
    seen, total, count = {{0: 1}}, 0, 0
    for val in nums:
        total += val
        count += seen.get(total - target, 0)
        seen[total] = seen.get(total, 0) + 1
    return count
"""
    if family == "monotonic-stack":
        return f"""
def {function_name}(nums):
    ans = [-1] * len(nums)
    stack = []
    for i, val in enumerate(nums):
        while stack and nums[stack[-1]] < val:
            ans[stack.pop()] = val
        stack.append(i)
    return ans
"""
    return f"""
def {function_name}(items):
    state = None
    for item in items:
        state = item
    return state
"""


def _generic_profile(family: str, method: str) -> dict[str, Any]:
    catalog = METHOD_PROFILE_CATALOG.get((family, method_slug(method)))
    if catalog:
        function_name = catalog["function"]
        return _entry(
            catalog["title"],
            catalog["prompt"],
            catalog.get("hint", f"Practice the {method.lower()} move."),
            catalog["plain"],
            catalog["question"],
            catalog["example_in"],
            catalog["example_out"],
            f"This card isolates {method.lower()} so the moving parts stay visible.",
            catalog["brass"],
            pattern_examples(family)[:3],
            (function_name,),
            _core_algorithm_skeleton(family, method, function_name),
        )
    title = {
        "binary-search": "Search Insert Position",
        "dfs-bfs": "Number of Islands",
        "graph-traversal": "Course Schedule",
        "backtracking": "Subsets",
        "heap": "Kth Largest Element in an Array",
        "union-find": "Number of Connected Components",
        "dynamic-programming": "House Robber",
        "dp": "House Robber",
        "intervals": "Merge Intervals",
        "prefix-sums": "Subarray Sum Equals K",
        "monotonic-stack": "Daily Temperatures",
    }.get(family, "Pattern Drill")
    method_label = str(method or "core method")
    func = pattern_slug(f"{family} {method_label}").replace("-", "_")[:48] or "pattern_skeleton"
    return _entry(
        title,
        f"{method_label.title()} Skeleton",
        f"Practice the {method_label.lower()} move.",
        f"What is the {method_label.lower()} move?",
        f"Use the {method_label.lower()} technique in a reusable interview skeleton.",
        f"items = [1, 2, 3]\n\n{func}(items)",
        "the skeleton result",
        f"This card isolates {method_label.lower()} so the moving parts stay visible.",
        f"Name the state, update it, and preserve the method's invariant.",
        pattern_examples(family)[:3],
        (func,),
        f"""
def {func}(items):
    state = None
    for item in items:
        state = item
    return state
""",
    )


def focused_profile(pattern: str, method: str) -> dict[str, Any]:
    family = pattern_family_slug(pattern)
    slug = method_slug(method)
    profile = FOCUSED_CARD_CATALOG.get((family, slug))
    if profile:
        return {
            **profile,
            "difficulty": STATIC_DIFFICULTY_CATALOG.get((family, slug), profile.get("difficulty", "Med.")),
        }
    generic_profile = _generic_profile(family, method)
    return {
        **generic_profile,
        "difficulty": STATIC_DIFFICULTY_CATALOG.get((family, slug), generic_profile.get("difficulty", "Med.")),
    }


def focused_difficulty(pattern: str, method: str) -> str:
    difficulty = str(focused_profile(pattern, method).get("difficulty", "Med.")).strip()
    return difficulty if difficulty in {"Easy", "Med.", "Hard"} else "Med."


def focused_prompt(pattern: str, method: str) -> str:
    return _limit_words(str(focused_profile(pattern, method).get("prompt", "")), 8)


def focused_title(pattern: str, method: str) -> str:
    return str(focused_profile(pattern, method).get("title") or "Pattern Drill")


def focused_hint(pattern: str, method: str) -> str:
    return _limit_words(str(focused_profile(pattern, method).get("hint", "")), 12)


def focused_target_terms(pattern: str, method: str) -> tuple[str, ...]:
    terms = focused_profile(pattern, method).get("targetTerms", ())
    return tuple(str(term) for term in terms)


def focused_skeleton_for_method(pattern: str, method: str) -> str:
    return str(focused_profile(pattern, method).get("skeleton", "")).strip()


def pattern_examples(pattern_or_slug: str) -> list[str]:
    family = pattern_family_slug(pattern_or_slug)
    return {
        "sliding-window": [
            "Maximum Average Subarray I: fixed window scoring.",
            "Permutation in String: window counts.",
            "Longest Substring Without Repeating Characters: valid window.",
        ],
        "two-pointers": [
            "Two Sum II: opposing pointers.",
            "Remove Duplicates from Sorted Array: same-direction scan.",
            "Container With Most Water: inward pointer choice.",
        ],
        "binary-search": [
            "Search Insert Position: lower-bound search.",
            "Find First and Last Position: boundary search.",
            "Koko Eating Bananas: search the answer.",
        ],
        "dfs-bfs": [
            "Number of Islands: visited traversal.",
            "Binary Tree Level Order Traversal: frontier expansion.",
            "Clone Graph: visit each node once.",
        ],
        "graph-traversal": [
            "Course Schedule: graph ordering.",
            "Number of Islands: visited traversal.",
            "Network Delay Time: frontier processing.",
        ],
        "backtracking": [
            "Subsets: choose or skip.",
            "Combination Sum: choose, recurse, undo.",
            "Permutations: path state.",
        ],
        "heap": [
            "Kth Largest Element: top-k heap.",
            "Merge K Sorted Lists: heap frontier.",
            "Top K Frequent Elements: priority queue.",
        ],
        "union-find": [
            "Number of Connected Components: merge roots.",
            "Redundant Connection: cycle detection.",
            "Accounts Merge: shared component roots.",
        ],
        "dynamic-programming": [
            "House Robber: take or skip.",
            "Climbing Stairs: transition from solved states.",
            "Coin Change: minimum state recurrence.",
        ],
        "dp": [
            "House Robber: take or skip.",
            "Climbing Stairs: transition from solved states.",
            "Coin Change: minimum state recurrence.",
        ],
        "intervals": [
            "Merge Intervals: overlap sweep.",
            "Meeting Rooms II: resource counting.",
            "Insert Interval: local merge.",
        ],
        "prefix-sums": [
            "Subarray Sum Equals K: previous prefixes.",
            "Range Sum Query: constant-time range sums.",
            "Continuous Subarray Sum: remainder buckets.",
        ],
        "monotonic-stack": [
            "Daily Temperatures: next warmer day.",
            "Next Greater Element: resolve smaller stack entries.",
            "Largest Rectangle in Histogram: pop trigger.",
        ],
    }.get(family, ["Pattern recall: reusable interview move."])
