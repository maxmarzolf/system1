-- ============================================================================
-- Insert Method Data
-- ============================================================================

-- Sliding Window Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'fixed vs variable window'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'expand / shrink rhythm'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'frequency maps'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'valid window invariant'),
    ((SELECT id FROM patterns WHERE name = 'Sliding Window'), 'window score updates');

-- Two Pointers Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'same-direction scan'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'opposing pointers'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'sorted-array leverage'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'dedupe rules'),
    ((SELECT id FROM patterns WHERE name = 'Two Pointers'), 'pointer move invariant');

-- Binary Search Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'left / right bounds'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'mid calculation'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'search on answer'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'first / last occurrence'),
    ((SELECT id FROM patterns WHERE name = 'Binary Search'), 'invariant handling');

-- DFS / BFS Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'base-case guards'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'visited tracking'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'pre / post-order thinking'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'queue frontier management'),
    ((SELECT id FROM patterns WHERE name = 'DFS / BFS'), 'level-by-level expansion');

-- Backtracking Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'choice / explore / undo'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'path state'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'pruning conditions'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'start index control'),
    ((SELECT id FROM patterns WHERE name = 'Backtracking'), 'result collection');

-- Heap / Priority Queue Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'top-k maintenance'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'min vs max heap choice'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'push / pop discipline'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'stream processing'),
    ((SELECT id FROM patterns WHERE name = 'Heap / Priority Queue'), 'lazy deletion patterns');

-- Union Find Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'parent initialization'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'find with compression'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'union by rank / size'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'component counting'),
    ((SELECT id FROM patterns WHERE name = 'Union Find'), 'cycle detection');

-- Dynamic Programming Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'state definition'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'transition equation'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'base cases'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'iteration order'),
    ((SELECT id FROM patterns WHERE name = 'Dynamic Programming'), 'space optimization');

-- Graph Traversal Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'adjacency representation'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'start state selection'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'topological ordering'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'indegree bookkeeping'),
    ((SELECT id FROM patterns WHERE name = 'Graph Traversal'), 'shortest-path framing');

-- Intervals Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'sort by start / end'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'merge overlap logic'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'sweep decisions'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'room / resource counting'),
    ((SELECT id FROM patterns WHERE name = 'Intervals'), 'boundary comparisons');

-- Prefix Sums Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'running total setup'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'sum-to-index map'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'subarray difference trick'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'mod remainder buckets'),
    ((SELECT id FROM patterns WHERE name = 'Prefix Sums'), 'constant-time range queries');

-- Monotonic Stack Methods
INSERT INTO methods (pattern_id, name) VALUES
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'increasing vs decreasing stack'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'next greater / smaller'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'pop trigger invariant'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'index storage'),
    ((SELECT id FROM patterns WHERE name = 'Monotonic Stack'), 'span / area computation');
