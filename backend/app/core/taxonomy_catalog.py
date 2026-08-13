from __future__ import annotations


# Canonical taxonomy for the algorithm -> problem -> [skill, technique] hierarchy.
# Slugs are stored in the taxonomy tables and converted to display text by the
# database seeder. Dict insertion order drives display_order.

# Top-level algorithm families a leetcode problem belongs to (exactly one each).
ALGORITHMS: dict[str, str] = {
    "arrays-hash-maps": "Arrays / Hash Maps",
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


# Broad, cross-cutting techniques a problem can apply regardless of its
# algorithm family. A slug may exist both as an algorithm and a technique
# (e.g. sorting); they live in separate tables.
TECHNIQUES: dict[str, str] = {
    "dfs": "DFS",
    "bfs": "BFS",
    "greedy": "Greedy",
    "sorting": "Sorting",
    "topological-sort": "Topological Sort",
    "two-pointers": "Two Pointers",
    "binary-search": "Binary Search",
    "sliding-window": "Sliding Window",
    "stack": "Stack",
    "queue": "Queue",
    "grid-modeling": "Grid Modeling",
}


# Curriculum skills per algorithm family. This is the study-plan grouping used
# to seed the global skill table and to generate the frontend skill map; the
# database-level algorithm -> skill relationship is derived through problems.
ALGORITHM_SKILLS: dict[str, tuple[str, ...]] = {
    "sliding-window": (
        "fixed-vs-variable-window", "window-boundary-initialization",
        "expand-shrink-rhythm", "frequency-maps", "valid-window-rule", "window-score-updates",
        "shrink-timing", "answer-update-timing", "amortized-linear-time-reasoning",
    ),
    "two-pointers": (
        "pointer-topology-choice", "same-direction-scan",
        "opposing-pointers", "sorted-array-leverage", "dedupe-rules", "pointer-move-rule",
        "read-write-partitioning", "fast-slow-cycle-detection", "convergence-and-termination",
    ),
    "binary-search": (
        "monotonicity-recognition", "search-space-definition", "left-right-bounds", "mid-calculation",
        "interval-convention", "boundary-rule-handling", "exact-match-search", "first-last-occurrence",
        "search-on-answer", "feasibility-predicate-design", "termination-and-off-by-one-cases",
    ),
    # Merged curriculum of the former dfs-bfs and graph-traversal patterns.
    "graphs": (
        "dfs-vs-bfs-selection", "state-and-neighbor-modeling", "base-case-guards", "visited-tracking",
        "pre-post-order-thinking", "queue-frontier-management", "level-by-level-expansion",
        "recursive-vs-iterative-traversal", "visit-timing-and-cycle-prevention",
        "disconnected-component-handling",
        "graph-problem-recognition", "adjacency-representation", "directed-vs-undirected-modeling",
        "start-state-selection", "visited-states-and-coloring", "topological-ordering",
        "indegree-bookkeeping", "shortest-path-framing", "weighted-vs-unweighted-traversal",
        "multi-source-traversal", "graph-cycle-detection", "v-e-complexity-analysis",
    ),
    "backtracking": (
        "decision-tree-recognition", "choice-explore-undo", "path-state", "candidate-generation",
        "start-index-control", "duplicate-choice-handling", "pruning-conditions",
        "base-cases-and-termination", "result-collection", "mutable-state-restoration",
    ),
    "heap": (
        "priority-queue-pattern-recognition", "min-vs-max-heap-choice", "heap-construction",
        "push-pop-discipline", "top-k-maintenance", "stream-processing", "k-way-frontier-merging",
        "two-heap-balancing", "lazy-deletion-patterns", "tie-breaking-and-stale-entries",
    ),
    "union-find": (
        "connectivity-pattern-recognition", "parent-initialization", "find-with-compression",
        "union-by-rank-size", "representative-invariants", "rank-size-updates", "component-counting",
        "cycle-detection", "redundant-union-handling", "amortized-complexity-analysis",
    ),
    "dynamic-programming": (
        "overlapping-subproblem-recognition", "optimal-substructure-recognition", "state-definition",
        "transition-equation", "base-cases", "top-down-memoization", "bottom-up-tabulation",
        "iteration-order", "state-dimensions-and-boundaries", "solution-reconstruction",
        "time-and-space-optimization", "correctness-reasoning", "complexity-analysis",
    ),
    "intervals": (
        "interval-normalization", "sort-by-start-end",
        "boundary-comparisons", "merge-overlap-logic", "sweep-decisions", "open-vs-closed-endpoints",
        "room-resource-counting", "event-tie-ordering", "interval-insertion-and-intersection",
        "greedy-interval-selection",
    ),
    "prefix-sums": (
        "running-total-setup", "sentinel-and-index-convention",
        "constant-time-range-queries", "sum-to-index-map", "subarray-difference-trick",
        "mod-remainder-buckets", "negative-value-handling", "two-dimensional-prefix-sums",
        "difference-arrays", "counting-vs-existence-queries",
    ),
    "monotonic-stack": (
        "monotonic-stack-pattern-recognition", "increasing-vs-decreasing-stack",
        "next-greater-smaller", "index-storage", "pop-trigger-rule", "equal-value-policy",
        "left-and-right-contribution-boundaries", "span-area-computation", "sentinel-flushing",
        "circular-array-handling",
    ),
}


CANONICAL_SKILLS: tuple[str, ...] = tuple(
    dict.fromkeys(slug for skills in ALGORITHM_SKILLS.values() for slug in skills)
)


# Skills folded into stronger, algorithm-specific skills by earlier taxonomy
# passes. Startup deletes these rows; slugs still active in the curriculum are
# excluded so a slug retired under one family never deletes a live skill.
_RETIRED_SKILL_CANDIDATES: tuple[str, ...] = (
    "window-pattern-recognition", "monotonic-window-optimization", "window-edge-cases",
    "correctness-reasoning", "complexity-analysis",
    "two-pointer-pattern-recognition", "pointer-edge-cases",
    "traversal-edge-cases",
    "constraint-validation",
    "heap-size-invariants",
    "dynamic-connectivity-queries", "indexing-edge-cases",
    "interval-pattern-recognition",
    "prefix-sum-pattern-recognition",
    "answer-update-timing",
    "space-optimization",
)

RETIRED_SKILLS: tuple[str, ...] = tuple(
    slug for slug in dict.fromkeys(_RETIRED_SKILL_CANDIDATES) if slug not in CANONICAL_SKILLS
)


# Legacy pattern slug -> new taxonomy, used by the startup history remap and by
# any consumer that still sees pre-rework slugs (e.g. cached cards).
PATTERN_TO_ALGORITHM: dict[str, str] = {
    **{slug: slug for slug in ALGORITHMS},
    "dfs-bfs": "graphs",
    "graph-traversal": "graphs",
    "topological-sort": "graphs",
    "greedy-sorting": "sorting",
}

PATTERN_TO_TECHNIQUES: dict[str, tuple[str, ...]] = {
    "dfs-bfs": ("dfs", "bfs"),
    "graph-traversal": (),
    "topological-sort": ("topological-sort",),
    "greedy-sorting": ("greedy", "sorting"),
}
