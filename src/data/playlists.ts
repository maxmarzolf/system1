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
]

export const playlistQuestionsToSkillMap = (playlist: PracticePlaylist): SkillMapNode[] =>
  playlist.questions.map((question) => ({
    algorithm: question.coreShape,
    skills: [question.title, ...question.methods],
    questionTitle: question.title,
    playlistSlug: playlist.slug,
  }))
