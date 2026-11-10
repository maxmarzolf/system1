import type { TemplateMode } from './types'

export const TEMPLATE_MODE_ORDER: TemplateMode[] = ['algorithm']
export const DEFAULT_TEMPLATE_MODES: TemplateMode[] = ['algorithm']
export const TEMPLATE_MODE_LABELS: Record<TemplateMode, string> = {
  algorithm: 'Algorithm',
}
export const patternToSlug = (pattern: string) =>
  pattern
    .toLowerCase()
    .replace(/\//g, ' ')
    .replace(/&/g, ' ')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\s+/g, '-')

export const patternLabelFromSlug = (slug: string) => {
  const overrides: Record<string, string> = {
    graphs: 'Graphs',
    'dfs-bfs': 'Graphs',
    'graph-traversal': 'Graphs',
    'heap-priority-queue': 'Heap / Priority Queue',
    heap: 'Heap / Priority Queue',
    'dynamic-programming': 'Dynamic Programming',
    'prefix-sums': 'Prefix Sums',
    'monotonic-stack': 'Monotonic Stack',
    'stacks-queues': 'Stacks / Queues',
    'linked-lists': 'Linked Lists',
    'matrix-grid': 'Matrix / Grid',
    'topological-sort': 'Topological Sort',
    'greedy-sorting': 'Sorting',
    sorting: 'Sorting',
    trie: 'Trie',
    trees: 'Trees',
  }
  return overrides[slug] ?? slug.split('-').filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')
}

export const getPrimaryPatternTag = (tags: string[]) => {
  for (const tag of [
    'sliding-window',
    'two-pointers',
    'binary-search',
    'graphs',
    'dfs-bfs',
    'graph-traversal',
    'backtracking',
    'heap-priority-queue',
    'heap',
    'union-find',
    'dynamic-programming',
    'dp',
    'intervals',
    'prefix-sums',
    'monotonic-stack',
    'stacks-queues',
    'linked-lists',
    'matrix-grid',
    'topological-sort',
    'sorting',
    'greedy-sorting',
    'trie',
    'trees',
    'stack',
  ]) {
    if (tags.includes(tag)) return tag
  }
  if (tags.includes('graph') || tags.includes('graph-bfs')) return 'graphs'
  return 'generic'
}
