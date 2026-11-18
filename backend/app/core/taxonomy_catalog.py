from __future__ import annotations


# Top-level algorithm families a core problem belongs to (exactly one each).
# Dict insertion order drives display_order in the database seed.
ALGORITHMS: dict[str, str] = {
    "sliding-window": "Sliding Window",
    "two-pointers": "Two Pointers",
    "binary-search": "Binary Search",
    "trees": "Trees",
    "graphs": "Graphs",
    "backtracking": "Backtracking",
    "dynamic-programming": "Dynamic Programming",
    "heap": "Heap / Priority Queue",
    "union-find": "Union Find",
    "intervals": "Intervals",
    "prefix-sums": "Prefix Sums",
    "monotonic-stack": "Monotonic Stack",
    "stacks-queues": "Stacks / Queues",
    "linked-lists": "Linked Lists",
    "matrix-grid": "Matrix / Grid",
    "trie": "Trie",
    "sorting": "Sorting",
    "meta": "Meta",
}
