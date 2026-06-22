-- ============================================================================
-- Insert Method Data
-- ============================================================================

-- Sliding Window Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'fixed vs variable window'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'window boundary initialization'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'expand / shrink rhythm'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'frequency maps'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'valid window rule'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'window score updates'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'shrink timing'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'answer update timing'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'amortized linear-time reasoning');

-- Two Pointers Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'pointer topology choice'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'same-direction scan'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'opposing pointers'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'sorted-array leverage'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'dedupe rules'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'pointer move rule'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'read / write partitioning'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'fast / slow cycle detection'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'convergence and termination');

-- Binary Search Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'monotonicity recognition'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'search space definition'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'left / right bounds'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'mid calculation'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'interval convention'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'boundary rule handling'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'exact-match search'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'first / last occurrence'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'search on answer'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'feasibility predicate design'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'termination and off-by-one cases');

-- DFS / BFS Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'DFS vs BFS selection'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'state and neighbor modeling'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'base-case guards'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'visited tracking'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'pre / post-order thinking'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'queue frontier management'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'level-by-level expansion'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'recursive vs iterative traversal'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'visit timing and cycle prevention'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'disconnected component handling');

-- Backtracking Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'decision-tree recognition'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'choice / explore / undo'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'path state'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'pruning conditions'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'start index control'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'result collection'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'candidate generation'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'duplicate choice handling'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'base cases and termination'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'mutable state restoration');

-- Heap / Priority Queue Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'priority-queue pattern recognition'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'heap construction'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'top-k maintenance'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'min vs max heap choice'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'push / pop discipline'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'stream processing'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'lazy deletion patterns'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'k-way frontier merging'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'two-heap balancing'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'tie-breaking and stale entries');

-- Union Find Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'connectivity pattern recognition'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'parent initialization'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'find with compression'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'union by rank / size'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'component counting'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'cycle detection'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'representative invariants'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'rank / size updates'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'redundant union handling'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'amortized complexity analysis');

-- Dynamic Programming Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'overlapping subproblem recognition'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'optimal substructure recognition'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'state definition'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'transition equation'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'base cases'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'top-down memoization'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'bottom-up tabulation'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'iteration order'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'state dimensions and boundaries'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'solution reconstruction'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'time and space optimization'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'correctness reasoning'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'complexity analysis');

-- Graph Traversal Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'graph problem recognition'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'adjacency representation'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'directed vs undirected modeling'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'start state selection'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'topological ordering'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'indegree bookkeeping'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'shortest-path framing'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'visited states and coloring'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'weighted vs unweighted traversal'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'multi-source traversal'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'graph cycle detection'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'V + E complexity analysis');

-- Intervals Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'interval normalization'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'sort by start / end'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'merge overlap logic'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'sweep decisions'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'room / resource counting'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'boundary comparisons'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'open vs closed endpoints'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'event tie ordering'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'interval insertion and intersection'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'greedy interval selection');

-- Prefix Sums Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'running total setup'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'sentinel and index convention'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'sum-to-index map'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'subarray difference trick'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'mod remainder buckets'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'constant-time range queries'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'negative-value handling'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'two-dimensional prefix sums'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'difference arrays'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'counting vs existence queries');

-- Monotonic Stack Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'monotonic-stack pattern recognition'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'increasing vs decreasing stack'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'next greater / smaller'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'pop trigger rule'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'index storage'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'span / area computation'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'equal-value policy'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'left and right contribution boundaries'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'sentinel flushing'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'circular array handling');
