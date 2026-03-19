export type SkillMapNode = {
  pattern: string
  methods: string[]
}

export const skillMap: SkillMapNode[] = [
  {
    pattern: 'Sliding Window',
    methods: ['fixed vs variable window', 'expand / shrink rhythm', 'frequency maps', 'valid window invariant', 'window score updates'],
  },
  {
    pattern: 'Two Pointers',
    methods: ['same-direction scan', 'opposing pointers', 'sorted-array leverage', 'dedupe rules', 'pointer move invariant'],
  },
  {
    pattern: 'Binary Search',
    methods: ['left / right bounds', 'mid calculation', 'search on answer', 'first / last occurrence', 'invariant handling'],
  },
  {
    pattern: 'DFS / BFS',
    methods: ['base-case guards', 'visited tracking', 'pre / post-order thinking', 'queue frontier management', 'level-by-level expansion'],
  },
  {
    pattern: 'Backtracking',
    methods: ['choice / explore / undo', 'path state', 'pruning conditions', 'start index control', 'result collection'],
  },
  {
    pattern: 'Heap / Priority Queue',
    methods: ['top-k maintenance', 'min vs max heap choice', 'push / pop discipline', 'stream processing', 'lazy deletion patterns'],
  },
  {
    pattern: 'Union Find',
    methods: ['parent initialization', 'find with compression', 'union by rank / size', 'component counting', 'cycle detection'],
  },
  {
    pattern: 'Dynamic Programming',
    methods: ['state definition', 'transition equation', 'base cases', 'iteration order', 'space optimization'],
  },
  {
    pattern: 'Graph Traversal',
    methods: ['adjacency representation', 'start state selection', 'topological ordering', 'indegree bookkeeping', 'shortest-path framing'],
  },
  {
    pattern: 'Intervals',
    methods: ['sort by start / end', 'merge overlap logic', 'sweep decisions', 'room / resource counting', 'boundary comparisons'],
  },
  {
    pattern: 'Prefix Sums',
    methods: ['running total setup', 'sum-to-index map', 'subarray difference trick', 'mod remainder buckets', 'constant-time range queries'],
  },
  {
    pattern: 'Monotonic Stack',
    methods: ['increasing vs decreasing stack', 'next greater / smaller', 'pop trigger invariant', 'index storage', 'span / area computation'],
  },
]
