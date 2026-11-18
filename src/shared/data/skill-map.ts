export type SkillMapNode = {
  algorithm: string
  skills: string[]
  questionTitle?: string
  playlistSlug?: string
}

// Algorithm-only fallback for when the catalog API is unavailable.
// Fine-grained curriculum labels are no longer seeded here.
export const skillMap: SkillMapNode[] = [
  { algorithm: 'Sliding Window', skills: [] },
  { algorithm: 'Two Pointers', skills: [] },
  { algorithm: 'Binary Search', skills: [] },
  { algorithm: 'Trees', skills: [] },
  { algorithm: 'Graphs', skills: [] },
  { algorithm: 'Backtracking', skills: [] },
  { algorithm: 'Dynamic Programming', skills: [] },
  { algorithm: 'Heap / Priority Queue', skills: [] },
  { algorithm: 'Union Find', skills: [] },
  { algorithm: 'Intervals', skills: [] },
  { algorithm: 'Prefix Sums', skills: [] },
  { algorithm: 'Monotonic Stack', skills: [] },
  { algorithm: 'Stacks / Queues', skills: [] },
  { algorithm: 'Linked Lists', skills: [] },
  { algorithm: 'Matrix / Grid', skills: [] },
  { algorithm: 'Trie', skills: [] },
  { algorithm: 'Sorting', skills: [] },
  { algorithm: 'Meta', skills: [] },
]
