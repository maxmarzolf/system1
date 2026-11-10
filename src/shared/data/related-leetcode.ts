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
  title: string
  examples: string[]
}

const LEETCODE_IDS: Record<string, number> = {
  '3sum': 15,
  'accounts merge': 721,
  'balanced binary tree': 110,
  'binary search': 704,
  'binary tree inorder traversal': 94,
  'binary tree level order traversal': 102,
  'binary tree postorder traversal': 145,
  'binary tree preorder traversal': 144,
  'capacity to ship packages': 1011,
  'climbing stairs': 70,
  'clone graph': 133,
  'coin change': 322,
  'combination sum': 39,
  'combination sum ii': 40,
  'combination sum iii': 216,
  combinations: 77,
  'container with most water': 11,
  'count target occurrences': 34,
  'course schedule': 207,
  'daily temperatures': 739,
  'delete and earn': 740,
  'diameter of binary tree': 543,
  'edit distance': 72,
  'employee free time': 759,
  'fibonacci number': 509,
  'find all anagrams in a string': 438,
  'find first and last position': 34,
  'find first and last position of element in sorted array': 34,
  'find median from data stream': 295,
  'find minimum in rotated sorted array': 153,
  'flood fill': 733,
  'fruit into baskets': 904,
  'grumpy bookstore owner': 1052,
  'house robber': 198,
  'insert interval': 57,
  'k closest points to origin': 973,
  'koko eating bananas': 875,
  'kth largest element': 215,
  'kth largest element in an array': 215,
  'kth largest in a stream': 703,
  'largest rectangle in histogram': 84,
  'last stone weight': 1046,
  'lca of deepest leaves': 1123,
  'longest common subsequence': 1143,
  'longest increasing subsequence': 300,
  'longest repeating character replacement': 424,
  'longest substring with at most k distinct characters': 340,
  'longest substring without repeating characters': 3,
  'lowest common ancestor of a binary search tree': 235,
  'lowest common ancestor of a binary tree': 236,
  'lowest common ancestor of a binary tree iii': 1650,
  'lowest common ancestor of deepest leaves': 1123,
  'max area of island': 695,
  'max consecutive ones iii': 1004,
  'maximum average subarray': 643,
  'maximum average subarray i': 643,
  'maximum depth of binary tree': 104,
  'maximum points from cards': 1423,
  'merge intervals': 56,
  'merge k sorted lists': 23,
  'min cost climbing stairs': 746,
  'minimum path sum': 64,
  'minimum size subarray sum': 209,
  'minimum window substring': 76,
  'move zeroes': 283,
  'next greater element': 496,
  'next greater element i': 496,
  'next permutation': 31,
  'number of connected components': 323,
  'number of islands': 200,
  'number of provinces': 547,
  'open the lock': 752,
  'palindrome partitioning': 131,
  'path sum': 112,
  'path sum ii': 113,
  'perfect squares': 279,
  'permutation in string': 567,
  permutations: 46,
  'permutations ii': 47,
  'range sum of bst': 938,
  'redundant connection': 684,
  'remove duplicates from sorted array': 26,
  'remove element': 27,
  'restore ip addresses': 93,
  'rotting oranges': 994,
  'russian doll envelopes': 354,
  'same tree': 100,
  'search in a bst': 700,
  'search in rotated sorted array': 33,
  'search insert position': 35,
  'shortest path in binary matrix': 1091,
  'sliding window median': 480,
  'smallest range covering elements from k lists': 632,
  'sort colors': 75,
  'subarray product less than k': 713,
  subsets: 78,
  'subsets ii': 90,
  'surrounded regions': 130,
  'task scheduler': 621,
  'top k frequent elements': 347,
  'two sum ii': 167,
  'two sum ii - input array is sorted': 167,
  'unique paths': 62,
  'valid palindrome': 125,
  'valid palindrome ii': 680,
  'walls and gates': 286,
  'word ladder': 127,
}

const normalizeProblemTitle = (value: string) =>
  value
    .split(':', 1)[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

export const resolveRelatedLeetCodeSet = ({
  title,
  examples,
}: RelatedLeetCodeContext): RelatedLeetCodeSet | null => {
  const seenIds = new Set<number>()
  const problems = examples.flatMap((example) => {
    const problemTitle = example.split(':', 1)[0].trim()
    const id = LEETCODE_IDS[normalizeProblemTitle(example)]
    if (!id || seenIds.has(id)) return []
    seenIds.add(id)
    return [{ id, title: problemTitle }]
  })

  if (problems.length === 0) return null

  return {
    heading: title,
    description: `Questions curated specifically for ${title}.`,
    problems,
  }
}
