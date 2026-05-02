export type RelatedLeetCodeProblem = {
  id: number
  title: string
}

export type RelatedLeetCodeSet = {
  heading: string
  description: string
  problems: RelatedLeetCodeProblem[]
}

type RelatedLeetCodeContext = {
  patternTag: string
  title: string
  prompt: string
  target: string
  tags: string[]
  focusedMethods: string[]
}

const RELATED_LEETCODE_SETS: Record<string, RelatedLeetCodeSet> = {
  'sliding-window-at-most': {
    heading: 'At-most counting window',
    description: 'Expand right, shrink while invalid, then add the number of valid endings from the current window.',
    problems: [
      { id: 713, title: 'Subarray Product Less Than K' },
      { id: 930, title: 'Binary Subarrays With Sum' },
      { id: 992, title: 'Subarrays with K Different Integers' },
      { id: 1248, title: 'Count Number of Nice Subarrays' },
      { id: 2302, title: 'Count Subarrays With Score Less Than K' },
      { id: 2537, title: 'Count the Number of Good Subarrays' },
      { id: 2762, title: 'Continuous Subarrays' },
      { id: 2962, title: 'Count Subarrays Where Max Element Appears at Least K Times' },
      { id: 3258, title: 'Count Substrings That Satisfy K-Constraint I' },
      { id: 3305, title: 'Count of Substrings Containing Every Vowel and K Consonants I' },
      { id: 3306, title: 'Count of Substrings Containing Every Vowel and K Consonants II' },
    ],
  },
  'sliding-window-generic': {
    heading: 'Sliding window engine',
    description: 'Move the right edge, repair the left edge when the window breaks the rule, and score the surviving window.',
    problems: [
      { id: 3, title: 'Longest Substring Without Repeating Characters' },
      { id: 76, title: 'Minimum Window Substring' },
      { id: 209, title: 'Minimum Size Subarray Sum' },
      { id: 424, title: 'Longest Repeating Character Replacement' },
      { id: 567, title: 'Permutation in String' },
      { id: 1004, title: 'Max Consecutive Ones III' },
    ],
  },
  'intervals-merge': {
    heading: 'Merge-overlap interval sweep',
    description: 'Sort intervals, carry a running active interval, and decide whether to extend it or flush it.',
    problems: [
      { id: 56, title: 'Merge Intervals' },
      { id: 57, title: 'Insert Interval' },
      { id: 435, title: 'Non-overlapping Intervals' },
      { id: 452, title: 'Minimum Number of Arrows to Burst Balloons' },
      { id: 986, title: 'Interval List Intersections' },
      { id: 1288, title: 'Remove Covered Intervals' },
    ],
  },
  'intervals-generic': {
    heading: 'Interval sorting and sweep',
    description: 'Sort by one boundary, then sweep through boundary comparisons to merge, count, or schedule.',
    problems: [
      { id: 56, title: 'Merge Intervals' },
      { id: 57, title: 'Insert Interval' },
      { id: 252, title: 'Meeting Rooms' },
      { id: 253, title: 'Meeting Rooms II' },
      { id: 435, title: 'Non-overlapping Intervals' },
      { id: 452, title: 'Minimum Number of Arrows to Burst Balloons' },
    ],
  },
  'two-pointers': {
    heading: 'Two-pointer move rule',
    description: 'Hold an invariant with two indices and move the pointer that cannot improve the current state.',
    problems: [
      { id: 11, title: 'Container With Most Water' },
      { id: 15, title: '3Sum' },
      { id: 42, title: 'Trapping Rain Water' },
      { id: 125, title: 'Valid Palindrome' },
      { id: 167, title: 'Two Sum II - Input Array Is Sorted' },
      { id: 283, title: 'Move Zeroes' },
    ],
  },
  'binary-search': {
    heading: 'Binary search boundary engine',
    description: 'Keep a valid answer range, probe the middle, and discard the half that cannot contain the boundary.',
    problems: [
      { id: 33, title: 'Search in Rotated Sorted Array' },
      { id: 34, title: 'Find First and Last Position of Element in Sorted Array' },
      { id: 153, title: 'Find Minimum in Rotated Sorted Array' },
      { id: 875, title: 'Koko Eating Bananas' },
      { id: 1011, title: 'Capacity To Ship Packages Within D Days' },
      { id: 2187, title: 'Minimum Time to Complete Trips' },
    ],
  },
  'dfs-bfs': {
    heading: 'Frontier traversal shape',
    description: 'Seed a start state, pop from the frontier, and guard revisits while expanding neighbors.',
    problems: [
      { id: 200, title: 'Number of Islands' },
      { id: 733, title: 'Flood Fill' },
      { id: 994, title: 'Rotting Oranges' },
      { id: 102, title: 'Binary Tree Level Order Traversal' },
      { id: 133, title: 'Clone Graph' },
      { id: 417, title: 'Pacific Atlantic Water Flow' },
    ],
  },
  backtracking: {
    heading: 'Choice-explore-undo recursion',
    description: 'Push a choice, recurse, then undo it so the next branch starts from clean state.',
    problems: [
      { id: 39, title: 'Combination Sum' },
      { id: 46, title: 'Permutations' },
      { id: 78, title: 'Subsets' },
      { id: 79, title: 'Word Search' },
      { id: 131, title: 'Palindrome Partitioning' },
      { id: 216, title: 'Combination Sum III' },
    ],
  },
  heap: {
    heading: 'Heap maintenance loop',
    description: 'Push candidates into the heap, pop according to the keep rule, and read the surviving frontier.',
    problems: [
      { id: 215, title: 'Kth Largest Element in an Array' },
      { id: 347, title: 'Top K Frequent Elements' },
      { id: 295, title: 'Find Median from Data Stream' },
      { id: 621, title: 'Task Scheduler' },
      { id: 767, title: 'Reorganize String' },
      { id: 973, title: 'K Closest Points to Origin' },
    ],
  },
  'union-find': {
    heading: 'Union-find connectivity core',
    description: 'Find roots, compress paths, and union components while counting or rejecting cycles.',
    problems: [
      { id: 547, title: 'Number of Provinces' },
      { id: 684, title: 'Redundant Connection' },
      { id: 721, title: 'Accounts Merge' },
      { id: 947, title: 'Most Stones Removed with Same Row or Column' },
      { id: 1319, title: 'Number of Operations to Make Network Connected' },
      { id: 1579, title: 'Remove Max Number of Edges to Keep Graph Fully Traversable' },
    ],
  },
  'dynamic-programming': {
    heading: 'DP state transition table',
    description: 'Define state, fill transitions from solved subproblems, and return the terminal best value.',
    problems: [
      { id: 198, title: 'House Robber' },
      { id: 322, title: 'Coin Change' },
      { id: 300, title: 'Longest Increasing Subsequence' },
      { id: 1143, title: 'Longest Common Subsequence' },
      { id: 139, title: 'Word Break' },
      { id: 516, title: 'Longest Palindromic Subsequence' },
    ],
  },
  'graph-traversal': {
    heading: 'Graph reachability and ordering',
    description: 'Model the graph, track seen state or indegrees, and sweep the structure until no frontier remains.',
    problems: [
      { id: 207, title: 'Course Schedule' },
      { id: 210, title: 'Course Schedule II' },
      { id: 743, title: 'Network Delay Time' },
      { id: 1584, title: 'Min Cost to Connect All Points' },
      { id: 1971, title: 'Find if Path Exists in Graph' },
      { id: 1466, title: 'Reorder Routes to Make All Paths Lead to the City Zero' },
    ],
  },
  'prefix-sums': {
    heading: 'Prefix accumulation and lookup',
    description: 'Accumulate a running prefix value and use past prefixes to detect or count target ranges.',
    problems: [
      { id: 560, title: 'Subarray Sum Equals K' },
      { id: 974, title: 'Subarray Sums Divisible by K' },
      { id: 523, title: 'Continuous Subarray Sum' },
      { id: 525, title: 'Contiguous Array' },
      { id: 1590, title: 'Make Sum Divisible by P' },
      { id: 930, title: 'Binary Subarrays With Sum' },
    ],
  },
  'monotonic-stack': {
    heading: 'Monotonic stack pop rule',
    description: 'Maintain a monotone stack, pop when the next value breaks the invariant, and resolve deferred answers.',
    problems: [
      { id: 739, title: 'Daily Temperatures' },
      { id: 84, title: 'Largest Rectangle in Histogram' },
      { id: 496, title: 'Next Greater Element I' },
      { id: 503, title: 'Next Greater Element II' },
      { id: 907, title: 'Sum of Subarray Minimums' },
      { id: 1019, title: 'Next Greater Node In Linked List' },
    ],
  },
}

const normalizeText = (...parts: string[]) => parts.join('\n').toLowerCase()

const hasAny = (text: string, needles: string[]) => needles.some((needle) => text.includes(needle))

const looksLikeAtMostSlidingWindow = (text: string) =>
  hasAny(text, ['total += r - l + 1', 'return total', 'distinct > k', 'at_most', 'at most']) &&
  hasAny(text, ['while distinct > k', 'while window_is_invalid', 'l += 1'])

const looksLikeMergeIntervals = (text: string, methods: string[]) =>
  (hasAny(text, ['merge interval', 'merge overlap', 'out = []']) && hasAny(text, ['sort', 'interval'])) ||
  methods.includes('merge overlap logic')

export const resolveRelatedLeetCodeSet = ({
  patternTag,
  title,
  prompt,
  target,
  tags,
  focusedMethods,
}: RelatedLeetCodeContext): RelatedLeetCodeSet | null => {
  const text = normalizeText(title, prompt, target, ...tags, ...focusedMethods)

  if ((patternTag === 'sliding-window' || text.includes('sliding window')) && looksLikeAtMostSlidingWindow(text)) {
    return RELATED_LEETCODE_SETS['sliding-window-at-most']
  }

  if ((patternTag === 'intervals' || text.includes('interval')) && looksLikeMergeIntervals(text, focusedMethods)) {
    return RELATED_LEETCODE_SETS['intervals-merge']
  }

  switch (patternTag) {
    case 'sliding-window':
      return RELATED_LEETCODE_SETS['sliding-window-generic']
    case 'two-pointers':
      return RELATED_LEETCODE_SETS['two-pointers']
    case 'binary-search':
      return RELATED_LEETCODE_SETS['binary-search']
    case 'dfs-bfs':
      return RELATED_LEETCODE_SETS['dfs-bfs']
    case 'backtracking':
      return RELATED_LEETCODE_SETS.backtracking
    case 'heap':
      return RELATED_LEETCODE_SETS.heap
    case 'union-find':
      return RELATED_LEETCODE_SETS['union-find']
    case 'dynamic-programming':
    case 'dp':
      return RELATED_LEETCODE_SETS['dynamic-programming']
    case 'graph-traversal':
      return RELATED_LEETCODE_SETS['graph-traversal']
    case 'prefix-sums':
      return RELATED_LEETCODE_SETS['prefix-sums']
    case 'monotonic-stack':
    case 'stack':
      return RELATED_LEETCODE_SETS['monotonic-stack']
    case 'intervals':
      return RELATED_LEETCODE_SETS['intervals-generic']
    default:
      return null
  }
}