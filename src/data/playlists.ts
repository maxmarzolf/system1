import type { SkillMapNode } from './skill-map'

export type PlaylistQuestion = {
  title: string
  coreShape: string
  methods: string[]
}

export type PracticePlaylist = {
  slug: string
  title: string
  description: string
  showOnSkillMap?: boolean
  staticDeck?: boolean
  questions: PlaylistQuestion[]
}

export const practicePlaylists: PracticePlaylist[] = [
  {
    slug: 'algorithm-shapes',
    title: 'Algorithm Shapes',
    description: 'Question titles paired with the reusable core shape to rehearse.',
    questions: [
      { title: 'CGRect Fun', coreShape: 'Geometry', methods: ['rectangle intersection', 'coordinate bounds', 'area math'] },
      { title: 'CD command', coreShape: 'Stack', methods: ['path normalization', 'push / pop folders', 'root boundary'] },
      { title: 'Multiset', coreShape: 'Hash Map', methods: ['frequency counts', 'add / remove bookkeeping', 'membership queries'] },
      { title: 'Arithmetic Expression (Eval)', coreShape: 'Stack', methods: ['operator precedence', 'number parsing', 'deferred evaluation'] },
      { title: 'Super Enumerator', coreShape: 'Backtracking', methods: ['choice / explore / undo', 'iterator state', 'result emission'] },
      { title: 'Find the kth largest value in an array', coreShape: 'Heap / Priority Queue', methods: ['top-k maintenance', 'min-heap of size k', 'candidate pruning'] },
      { title: 'Depth Sum', coreShape: 'DFS / BFS', methods: ['nested traversal', 'depth tracking', 'weighted accumulation'] },
      { title: 'Unique word abbreviation (I18n)', coreShape: 'Hash Map', methods: ['string encoding', 'collision detection', 'uniqueness lookup'] },
      { title: 'Merge Two Sorted Interval Arrays', coreShape: 'Intervals', methods: ['two sorted scans', 'merge overlap logic', 'boundary comparisons'] },
      { title: 'Arithmetic Powerf', coreShape: 'Binary Exponentiation', methods: ['exponent halving', 'accumulator updates', 'negative power handling'] },
      { title: 'Graph Clone', coreShape: 'DFS / BFS', methods: ['visited map', 'node copying', 'neighbor wiring'] },
      { title: 'Almost Palindrome', coreShape: 'Two Pointers', methods: ['opposing pointers', 'single deletion branch', 'mirror comparison'] },
      { title: 'Stock Price Fluctuation', coreShape: 'Heap / Priority Queue', methods: ['timestamp map', 'lazy heap cleanup', 'min / max tracking'] },
      { title: 'City Generator', coreShape: 'Hash Map', methods: ['weighted lookup', 'random selection', 'prefix buckets'] },
      { title: 'Server Autocomplete', coreShape: 'Trie', methods: ['prefix traversal', 'candidate collection', 'ranked suggestions'] },
      { title: 'Add range sum in a binary search tree', coreShape: 'DFS / BFS', methods: ['BST pruning', 'range bounds', 'recursive accumulation'] },
      { title: 'Find the lowest common ancestor of two tree nodes(with parent pointer)', coreShape: 'Tree Traversal', methods: ['ancestor set', 'parent pointers', 'first shared node'] },
      { title: 'Maze Walking', coreShape: 'Graph Traversal', methods: ['grid neighbors', 'visited tracking', 'frontier expansion'] },
      { title: 'Parent chain without known root and backlinks', coreShape: 'Tree Traversal', methods: ['parent traversal', 'seen ancestors', 'meeting point'] },
      { title: 'Binary Tree Playground', coreShape: 'DFS / BFS', methods: ['tree traversal', 'base-case guards', 'node aggregation'] },
      { title: 'Copy single linked list of nodes with other pointer', coreShape: 'Linked List', methods: ['old-to-new map', 'two-pass linking', 'random pointer copy'] },
      { title: 'Print Tree by Columns', coreShape: 'DFS / BFS', methods: ['column indexing', 'level-order traversal', 'ordered grouping'] },
      { title: 'Local Minimum', coreShape: 'Binary Search', methods: ['neighbor comparison', 'slope direction', 'boundary rule handling'] },
      { title: 'Moving average', coreShape: 'Sliding Window', methods: ['fixed window queue', 'running sum', 'evict old values'] },
      { title: 'Next Permutation', coreShape: 'Two Pointers', methods: ['pivot search', 'suffix reversal', 'next greater swap'] },
      { title: 'Sort Using Custom Alphabet', coreShape: 'Hash Map', methods: ['rank map', 'custom comparator', 'stable ordering'] },
      { title: 'Top K frequent elements', coreShape: 'Heap / Priority Queue', methods: ['frequency map', 'top-k maintenance', 'bucket alternative'] },
      { title: 'Binary Tree Lowest Common Ancestor', coreShape: 'DFS / BFS', methods: ['post-order search', 'split detection', 'ancestor return'] },
      { title: 'Balance Parentheses', coreShape: 'Stack', methods: ['open stack', 'matching pairs', 'invalid close detection'] },
    ],
  },
  {
    slug: 'google',
    title: 'Google',
    description: 'Google-focused LeetCode playlist organized by tier and algorithm family.',
    showOnSkillMap: true,
    staticDeck: true,
    questions: [
      { title: '1. Two Sum', coreShape: 'Arrays / Hash Maps', methods: ['Tier 1: Must Know', 'pair lookup', 'complement map'] },
      { title: '49. Group Anagrams', coreShape: 'Arrays / Hash Maps', methods: ['Tier 1: Must Know', 'canonical key', 'frequency signature'] },
      { title: '128. Longest Consecutive Sequence', coreShape: 'Arrays / Hash Maps', methods: ['Tier 1: Must Know', 'set membership', 'sequence starts'] },
      { title: '347. Top K Frequent Elements', coreShape: 'Arrays / Hash Maps', methods: ['Tier 1: Must Know', 'frequency map', 'top-k selection'] },
      { title: '238. Product of Array Except Self', coreShape: 'Arrays / Hash Maps', methods: ['Tier 1: Must Know', 'prefix products', 'suffix products'] },

      { title: '3. Longest Substring Without Repeating Characters', coreShape: 'Sliding Window', methods: ['Tier 1: Must Know', 'variable window', 'last-seen index'] },
      { title: '424. Longest Repeating Character Replacement', coreShape: 'Sliding Window', methods: ['Tier 1: Must Know', 'frequency counts', 'valid window rule'] },
      { title: '567. Permutation in String', coreShape: 'Sliding Window', methods: ['Tier 1: Must Know', 'fixed window', 'frequency match'] },
      { title: '76. Minimum Window Substring', coreShape: 'Sliding Window', methods: ['Tier 1: Must Know', 'required counts', 'shrink timing'] },
      { title: '209. Minimum Size Subarray Sum', coreShape: 'Sliding Window', methods: ['Tier 1: Must Know', 'running sum', 'minimal valid window'] },

      { title: '11. Container With Most Water', coreShape: 'Two Pointers', methods: ['Tier 1: Must Know', 'opposing pointers', 'area optimization'] },
      { title: '15. 3Sum', coreShape: 'Two Pointers', methods: ['Tier 1: Must Know', 'sorted-array leverage', 'dedupe rules'] },
      { title: '42. Trapping Rain Water', coreShape: 'Two Pointers', methods: ['Tier 1: Must Know', 'left and right maxima', 'water contribution'] },
      { title: '125. Valid Palindrome', coreShape: 'Two Pointers', methods: ['Tier 1: Must Know', 'opposing pointers', 'character filtering'] },

      { title: '33. Search in Rotated Sorted Array', coreShape: 'Binary Search', methods: ['Tier 1: Must Know', 'rotated halves', 'boundary rule handling'] },
      { title: '153. Find Minimum in Rotated Sorted Array', coreShape: 'Binary Search', methods: ['Tier 1: Must Know', 'pivot search', 'right-bound comparison'] },
      { title: '875. Koko Eating Bananas', coreShape: 'Binary Search', methods: ['Tier 1: Must Know', 'search on answer', 'feasibility predicate'] },
      { title: '981. Time Based Key-Value Store', coreShape: 'Binary Search', methods: ['Tier 1: Must Know', 'timestamp lookup', 'floor search'] },

      { title: '98. Validate BST', coreShape: 'Trees', methods: ['Tier 2: Google Favorites', 'range bounds', 'DFS validation'] },
      { title: '102. Binary Tree Level Order Traversal', coreShape: 'Trees', methods: ['Tier 2: Google Favorites', 'BFS queue', 'level-by-level expansion'] },
      { title: '236. Lowest Common Ancestor', coreShape: 'Trees', methods: ['Tier 2: Google Favorites', 'post-order search', 'split detection'] },
      { title: '543. Diameter of Binary Tree', coreShape: 'Trees', methods: ['Tier 2: Google Favorites', 'height recursion', 'global best path'] },
      { title: '124. Binary Tree Maximum Path Sum', coreShape: 'Trees', methods: ['Tier 2: Google Favorites', 'path gain', 'global max update'] },

      { title: '200. Number of Islands', coreShape: 'Graphs', methods: ['Tier 2: Google Favorites', 'grid DFS', 'visited marking'] },
      { title: '133. Clone Graph', coreShape: 'Graphs', methods: ['Tier 2: Google Favorites', 'visited map', 'neighbor cloning'] },
      { title: '207. Course Schedule', coreShape: 'Graphs', methods: ['Tier 2: Google Favorites', 'cycle detection', 'topological ordering'] },
      { title: '210. Course Schedule II', coreShape: 'Graphs', methods: ['Tier 2: Google Favorites', 'indegree bookkeeping', 'topological ordering'] },
      { title: '994. Rotting Oranges', coreShape: 'Graphs', methods: ['Tier 2: Google Favorites', 'multi-source BFS', 'minute layers'] },
      { title: '417. Pacific Atlantic Water Flow', coreShape: 'Graphs', methods: ['Tier 2: Google Favorites', 'reverse DFS', 'reachability intersection'] },

      { title: '215. Kth Largest Element', coreShape: 'Heap / Priority Queue', methods: ['Tier 2: Google Favorites', 'top-k maintenance', 'quickselect alternative'] },
      { title: '295. Find Median from Data Stream', coreShape: 'Heap / Priority Queue', methods: ['Tier 2: Google Favorites', 'two-heap balancing', 'stream processing'] },
      { title: '973. K Closest Points', coreShape: 'Heap / Priority Queue', methods: ['Tier 2: Google Favorites', 'distance ordering', 'top-k selection'] },

      { title: '39. Combination Sum', coreShape: 'Backtracking', methods: ['Tier 3: Often Asked', 'choice / explore / undo', 'start index control'] },
      { title: '46. Permutations', coreShape: 'Backtracking', methods: ['Tier 3: Often Asked', 'path state', 'used set'] },
      { title: '79. Word Search', coreShape: 'Backtracking', methods: ['Tier 3: Often Asked', 'grid backtracking', 'visited restoration'] },
      { title: '51. N-Queens', coreShape: 'Backtracking', methods: ['Tier 3: Often Asked', 'constraint tracking', 'diagonal pruning'] },

      { title: '70. Climbing Stairs', coreShape: 'Dynamic Programming', methods: ['Tier 3: Often Asked', 'state definition', 'Fibonacci recurrence'] },
      { title: '198. House Robber', coreShape: 'Dynamic Programming', methods: ['Tier 3: Often Asked', 'include / exclude transition', 'rolling state'] },
      { title: '322. Coin Change', coreShape: 'Dynamic Programming', methods: ['Tier 3: Often Asked', 'min transition', 'bottom-up tabulation'] },
      { title: '300. Longest Increasing Subsequence', coreShape: 'Dynamic Programming', methods: ['Tier 3: Often Asked', 'subsequence DP', 'patience sorting alternative'] },
      { title: '1143. Longest Common Subsequence', coreShape: 'Dynamic Programming', methods: ['Tier 3: Often Asked', 'two-dimensional state', 'match / skip transition'] },

      { title: '56. Merge Intervals', coreShape: 'Intervals', methods: ['Tier 3: Often Asked', 'sort by start', 'merge overlap logic'] },
      { title: '57. Insert Interval', coreShape: 'Intervals', methods: ['Tier 3: Often Asked', 'interval insertion', 'overlap sweep'] },
      { title: '435. Non-overlapping Intervals', coreShape: 'Intervals', methods: ['Tier 3: Often Asked', 'greedy interval selection', 'end-time sorting'] },

      { title: '84. Largest Rectangle in Histogram', coreShape: 'Monotonic Stack', methods: ['Tier 4: Hard but Worth It', 'increasing stack', 'area boundaries'] },
      { title: '239. Sliding Window Maximum', coreShape: 'Sliding Window', methods: ['Tier 4: Hard but Worth It', 'monotonic deque', 'window maximum'] },
      { title: '297. Serialize and Deserialize Binary Tree', coreShape: 'Trees', methods: ['Tier 4: Hard but Worth It', 'tree encoding', 'preorder reconstruction'] },
      { title: '23. Merge k Sorted Lists', coreShape: 'Heap / Priority Queue', methods: ['Tier 4: Hard but Worth It', 'k-way frontier merging', 'linked-list merge'] },
      { title: '269. Alien Dictionary', coreShape: 'Graphs', methods: ['Tier 4: Hard but Worth It', 'character graph', 'topological ordering'] },
      { title: '642. Design Search Autocomplete System', coreShape: 'Trie', methods: ['Tier 4: Hard but Worth It', 'prefix traversal', 'ranked suggestions', 'search-team relevance'] },
    ],
  },
  {
    slug: 'google-skeletons',
    title: 'Google Skeletons',
    description: 'Static Google skeleton drills for reusable interview traversal patterns.',
    showOnSkillMap: true,
    staticDeck: true,
    questions: [
      { title: 'BFS Skeleton', coreShape: 'Graphs', methods: ['BFS queue', 'visited set', 'neighbor expansion'] },
      { title: 'DFS Skeleton', coreShape: 'Graphs', methods: ['recursive DFS', 'visited set', 'neighbor expansion'] },
    ],
  },
]

export const playlistQuestionsToSkillMap = (playlist: PracticePlaylist): SkillMapNode[] =>
  playlist.questions.map((question) => ({
    algorithm: question.coreShape,
    skills: [question.title, ...question.methods],
    questionTitle: question.title,
    playlistSlug: playlist.slug,
  }))
