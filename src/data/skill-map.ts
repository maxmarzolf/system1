export type SkillMapNode = {
  algorithm: string
  skills: string[]
  techniques?: string[]
  questionTitle?: string
  playlistSlug?: string
}

// Mirrors the backend taxonomy seed (backend/app/core/taxonomy_catalog.py):
// algorithm curricula with their atomic skills. The former "DFS / BFS" and
// "Graph Traversal" patterns are merged into the single Graphs algorithm;
// DFS/BFS/greedy/sorting now live as techniques attached to problems.
export const skillMap: SkillMapNode[] = [
  {
    algorithm: 'Sliding Window',
    skills: [
      'fixed vs variable window', 'window boundary initialization',
      'expand / shrink rhythm', 'frequency maps', 'valid window rule', 'window score updates',
      'shrink timing', 'answer update timing', 'amortized linear-time reasoning',
    ],
  },
  {
    algorithm: 'Two Pointers',
    skills: [
      'pointer topology choice', 'same-direction scan',
      'opposing pointers', 'sorted-array leverage', 'dedupe rules', 'pointer move rule',
      'read / write partitioning', 'fast / slow cycle detection', 'convergence and termination',
    ],
  },
  {
    algorithm: 'Binary Search',
    skills: [
      'monotonicity recognition', 'search space definition', 'left / right bounds',
      'mid calculation', 'interval convention', 'boundary rule handling', 'exact-match search',
      'first / last occurrence', 'search on answer', 'feasibility predicate design',
      'termination and off-by-one cases',
    ],
  },
  {
    algorithm: 'Graphs',
    skills: [
      'DFS vs BFS selection', 'state and neighbor modeling', 'base-case guards',
      'visited tracking', 'pre / post-order thinking', 'queue frontier management',
      'level-by-level expansion', 'recursive vs iterative traversal', 'visit timing and cycle prevention',
      'disconnected component handling',
      'graph problem recognition', 'adjacency representation', 'directed vs undirected modeling',
      'start state selection', 'visited states and coloring', 'topological ordering',
      'indegree bookkeeping', 'shortest-path framing', 'weighted vs unweighted traversal',
      'multi-source traversal', 'graph cycle detection', 'V + E complexity analysis',
    ],
    techniques: ['DFS', 'BFS', 'Topological Sort'],
  },
  {
    algorithm: 'Backtracking',
    skills: [
      'decision-tree recognition', 'choice / explore / undo', 'path state',
      'candidate generation', 'start index control', 'duplicate choice handling',
      'pruning conditions', 'base cases and termination', 'result collection',
      'mutable state restoration',
    ],
  },
  {
    algorithm: 'Heap / Priority Queue',
    skills: [
      'priority-queue pattern recognition', 'min vs max heap choice', 'heap construction',
      'push / pop discipline', 'top-k maintenance', 'stream processing',
      'k-way frontier merging', 'two-heap balancing', 'lazy deletion patterns',
      'tie-breaking and stale entries',
    ],
  },
  {
    algorithm: 'Union Find',
    skills: [
      'connectivity pattern recognition', 'parent initialization', 'find with compression',
      'union by rank / size', 'representative invariants', 'rank / size updates',
      'component counting', 'cycle detection', 'redundant union handling',
      'amortized complexity analysis',
    ],
  },
  {
    algorithm: 'Dynamic Programming',
    skills: [
      'overlapping subproblem recognition',
      'optimal substructure recognition',
      'state definition',
      'transition equation',
      'base cases',
      'top-down memoization',
      'bottom-up tabulation',
      'iteration order',
      'state dimensions and boundaries',
      'solution reconstruction',
      'time and space optimization',
      'correctness reasoning',
      'complexity analysis',
    ],
    techniques: ['Greedy'],
  },
  {
    algorithm: 'Intervals',
    skills: [
      'interval normalization', 'sort by start / end',
      'boundary comparisons', 'merge overlap logic', 'sweep decisions',
      'open vs closed endpoints', 'room / resource counting', 'event tie ordering',
      'interval insertion and intersection', 'greedy interval selection',
    ],
    techniques: ['Greedy', 'Sorting'],
  },
  {
    algorithm: 'Prefix Sums',
    skills: [
      'running total setup', 'sentinel and index convention',
      'constant-time range queries', 'sum-to-index map', 'subarray difference trick',
      'mod remainder buckets', 'negative-value handling', 'two-dimensional prefix sums',
      'difference arrays', 'counting vs existence queries',
    ],
  },
  {
    algorithm: 'Monotonic Stack',
    skills: [
      'monotonic-stack pattern recognition', 'increasing vs decreasing stack', 'next greater / smaller',
      'index storage', 'pop trigger rule', 'equal-value policy',
      'left and right contribution boundaries', 'span / area computation', 'sentinel flushing',
      'circular array handling',
    ],
  },
]
