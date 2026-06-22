from __future__ import annotations


# Canonical backend taxonomy. Labels are stored as slugs in the core-algorithm
# tables and converted to display text by the database seeder.
SKILL_MAP_METHODS: dict[str, tuple[str, ...]] = {
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
    "dfs-bfs": (
        "dfs-vs-bfs-selection", "state-and-neighbor-modeling", "base-case-guards", "visited-tracking",
        "pre-post-order-thinking", "queue-frontier-management", "level-by-level-expansion",
        "recursive-vs-iterative-traversal", "visit-timing-and-cycle-prevention",
        "disconnected-component-handling",
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
    "graph-traversal": (
        "graph-problem-recognition", "adjacency-representation", "directed-vs-undirected-modeling",
        "start-state-selection", "visited-states-and-coloring", "topological-ordering",
        "indegree-bookkeeping", "shortest-path-framing", "weighted-vs-unweighted-traversal",
        "multi-source-traversal", "graph-cycle-detection", "v-e-complexity-analysis",
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


# Methods from the first equal-sized expansion that were intentionally folded
# into stronger, algorithm-specific skills. Startup removes these stale rows
# from databases that already received that expansion.
RETIRED_SKILL_MAP_METHODS: dict[str, tuple[str, ...]] = {
    "sliding-window": (
        "window-pattern-recognition", "monotonic-window-optimization", "window-edge-cases",
        "correctness-reasoning", "complexity-analysis",
    ),
    "two-pointers": (
        "two-pointer-pattern-recognition", "pointer-edge-cases", "correctness-reasoning",
        "complexity-analysis",
    ),
    "binary-search": ("correctness-reasoning", "complexity-analysis"),
    "dfs-bfs": ("traversal-edge-cases", "correctness-reasoning", "complexity-analysis"),
    "backtracking": ("constraint-validation", "correctness-reasoning", "complexity-analysis"),
    "heap": ("heap-size-invariants", "correctness-reasoning", "complexity-analysis"),
    "union-find": ("dynamic-connectivity-queries", "indexing-edge-cases", "correctness-reasoning"),
    "graph-traversal": ("correctness-reasoning", "complexity-analysis"),
    "intervals": ("interval-pattern-recognition", "correctness-reasoning", "complexity-analysis"),
    "prefix-sums": ("prefix-sum-pattern-recognition", "correctness-reasoning", "complexity-analysis"),
    "monotonic-stack": ("answer-update-timing", "correctness-reasoning", "complexity-analysis"),
}
