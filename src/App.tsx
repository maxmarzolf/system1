import { type CSSProperties, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSearchParams } from 'react-router-dom'
import RelatedLeetCodeDrawer from './RelatedLeetCodeDrawer'
import { skillMap, type SkillMapNode } from './data/skill-map'
import { playlistQuestionsToSkillMap, practicePlaylists } from './data/playlists'
import { resolveRelatedLeetCodeSet } from './data/related-leetcode'
import { getLiveCoachFrequencyProfile, loadStoredLiveCoachTuning, saveStoredLiveCoachTuning } from './liveCoachTuning'
import { loadStoredSubmissionTuning } from './submissionTuning'
import { loadStoredSpecimenTuning } from './specimenTuning'
import type { SpecimenTuning } from './specimenTuning'
import { apiUrl } from './api'
import { providerDisplayLabel, useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'
import { useTheme } from './theme'

type Flashcard = {
  id: string
  title: string
  difficulty: 'Easy' | 'Med.' | 'Hard'
  prompt: string
  templatePrompts?: Partial<Record<TemplateMode | HelperLayer | CoreShapeLayer, string>>
  templateTargets?: Partial<Record<TemplateMode | HelperLayer | CoreShapeLayer, string>>
  solution: string
  missing: string
  hint: string
  tags: string[]
  plainEnglishPromptDetail?: PlainEnglishPromptDetail
}

type PracticeMode = 'recall' | 'multiple-choice'
type MultipleChoiceDifficulty = 'Med.' | 'Hard'

type MultipleChoiceChoice = {
  id: string
  text: string
}

type MultipleChoiceCard = {
  id: string
  title: string
  pattern: string
  difficulty: MultipleChoiceDifficulty
  question: string
  choices: MultipleChoiceChoice[]
  correctChoiceId: string
  explanation: string
  tags: string[]
}

const emptySkillMapCard: Flashcard = {
  id: 'skill-map-loading',
  title: 'Skill Map Card',
  difficulty: 'Easy',
  prompt: 'Generate a fresh skill-map practice deck from the layered map.',
  solution: 'def solve():\n    {{missing}}',
  missing: 'pass',
  hint: '',
  tags: ['skill-map'],
}

type TemplateMode = 'algorithm'
type HelperLayer = 'inline'
type CoreShapeLayer = 'coreShape'
type RecallTargetMode = TemplateMode | CoreShapeLayer
type SupportLayer = 'none' | 'ghost-reps'
type InlineLens = 'pattern' | 'plainEnglish' | 'why' | 'transfer' | 'debug'

type AttemptPayload = {
  mode: 'main-recall'
  correct: boolean
  correctAnswer: string
  userAnswer: string
  accuracy: number
  exact: boolean
  elapsedMs: number
  interactionId: string
  templateMode: TemplateMode
  supportLayer: SupportLayer
  liveCoachUsed: boolean
  coachFeedback?: CoachAttemptFeedback | null
  submissionRubric?: Record<string, unknown> | null
}

type CoachAttemptFeedback = {
  diagnosis: string
  primaryFocus: string
  immediateCorrection: string
  affirmation?: string
  nextMove?: string
  why?: string
  keepInMind?: string
  microDrill: string
  nextRepTarget: string
  strengths: string[]
  errorTags: string[]
  fullFeedback?: string
  correctedVersion?: string
  submissionRubric?: Record<string, unknown>
  llmUsed: boolean
  llmProvider?: string
}

type SubmissionFailureModalState = {
  providerLabel: string
  message: string
}

type CoachSessionPlan = {
  headline: string
  focusTheme: string
  warmup: string
  mainSet: string
  cooldown: string
  note: string
  llmUsed: boolean
}

type SkillMapDrillsResponse = {
  drills: Flashcard[]
  llmUsed: boolean
}

type MultipleChoiceDrillsResponse = {
  drills: MultipleChoiceCard[]
  llmUsed: boolean
}

type ApiErrorDetail = {
  code?: string
  message?: string
  provider?: string
  providerLabel?: string
  apiErrorCode?: string
}

type SkillMapDrillsRequest = {
  questionType: string
  count: number
  skillMap: SkillMapNode[]
  templateMode: TemplateMode
  templateTargets: Record<string, Partial<Record<TemplateMode | HelperLayer | CoreShapeLayer, string>>>
  specimenTuning: SpecimenTuning
  llmProvider: string
}

type MultipleChoiceDrillsRequest = {
  questionType: string
  count: number
  skillMap: SkillMapNode[]
  difficulty: MultipleChoiceDifficulty
  llmProvider: string
}

type PromptToggleExplanationRequest = {
  cardId: string
  cardTitle: string
  prompt: string
  target: string
  tags: string[]
  llmProvider: string
}

type PromptToggleExplanationResponse = {
  plainEnglish: string
  inputExample: string
  outputExample: string
  llmUsed: boolean
}

type AdaptiveVariationResponse = {
  drill: Flashcard
  targetDimension: string
  variationReason: string
  llmUsed: boolean
}

type SequentialVariationResponse = {
  drill: Flashcard
  progressionReason: string
  llmUsed: boolean
}

type AttemptEvaluationResponse = {
  accuracy: number
  sound: boolean
  syntaxValid: boolean
}

type PlainEnglishPromptDetail = {
  plainEnglish: string
  interviewQuestion: string
  inputExample: string
  outputExample: string
  explanation: string
  brassTacks: string
  leetcodeExamples: string[]
}

type LineReviewStatus = 'match' | 'mismatch' | 'missing' | 'extra'

type LineReview = {
  lineNumber: number
  status: LineReviewStatus
  expected: string
  actual: string
}

type AnnotatedDisplayLine = {
  text: string
  sourceLineNumber: number | null
  liveTone?: LiveInlineTone | null
}

type LiveInlineTone = 'positive' | 'negative' | 'neutral'

type LiveInlineNote = {
  text: string
  sourceLineNumber: number | null
  tone: LiveInlineTone
}

type LiveLineAnnotation = {
  note: string
  tone: LiveInlineTone
}

const findNearestWrittenLineIndex = (lines: string[], preferredIndex: number) => {
  if (lines.length === 0) return -1

  const boundedIndex = Math.max(0, Math.min(preferredIndex, lines.length - 1))
  for (let index = boundedIndex; index >= 0; index -= 1) {
    if (lines[index]?.trim()) return index
  }
  for (let index = boundedIndex + 1; index < lines.length; index += 1) {
    if (lines[index]?.trim()) return index
  }
  return -1
}

type RecallAttemptSnapshot = {
  attemptNumber: number
  accuracy: number
  exact: boolean
  elapsedMs: number
  supportLayer: SupportLayer
  usedPlaceholder: boolean
  hasGuard: boolean
  hasBookkeeping: boolean
  hasTraversal: boolean
  hasLoop: boolean
}

type LiveStructure = {
  nonEmptyLines: number
  hasSignature: boolean
  hasGuard: boolean
  traversalKind: 'dfs' | 'bfs' | 'queue' | 'stack' | null
  hasLoop: boolean
  hasPlaceholder: boolean
  hasBookkeeping: boolean
  milestoneKey: string
}

type LiveCoachSnapshot = {
  text: string
  progressKey: string
  accuracy: number
  nonEmptyLines: number
  changedLine: number
  sameLineEditCount: number
  lastMeaningfulProgressAt: number
}

type LiveCoachTimingDecision = {
  reason: 'milestone' | 'stall' | 'churn' | 'drift'
  delayMs: number
}

type FlowMode = 'sequential' | 'adaptive'

type LlmProvider = 'openai' | 'claude' | 'gemma'
type LlmProviderSelection = 'auto' | LlmProvider

const skillMapDeckRequestCache = new Map<string, Promise<SkillMapDrillsResponse>>()
const multipleChoiceDeckRequestCache = new Map<string, Promise<MultipleChoiceDrillsResponse>>()
const promptToggleExplanationRequestCache = new Map<string, Promise<PromptToggleExplanationResponse>>()
const MULTIPLE_CHOICE_MIN_COUNT = 1
const MULTIPLE_CHOICE_MAX_COUNT = 30
const DEFAULT_MULTIPLE_CHOICE_COUNT = 5
const MCQ_CORE_ALGORITHM_ANCHORS: SkillMapNode[] = [
  { pattern: 'Sliding Window', methods: ['fixed vs variable window', 'expand / shrink rhythm', 'frequency maps'] },
  { pattern: 'Two Pointers', methods: ['same-direction scan', 'opposing pointers', 'sorted-array leverage'] },
  { pattern: 'Binary Search', methods: ['bounds invariant', 'search on answer', 'first / last occurrence'] },
  { pattern: 'Trees', methods: ['recursive traversal', 'path state', 'subtree return values'] },
  { pattern: 'Graph Traversal', methods: ['visited tracking', 'BFS frontier', 'DFS recursion'] },
  { pattern: 'Dynamic Programming', methods: ['state definition', 'transition equation', 'iteration order'] },
  { pattern: 'Backtracking', methods: ['choice / explore / undo', 'path state', 'pruning'] },
  { pattern: 'Tries', methods: ['prefix tree nodes', 'word markers', 'character transitions'] },
  { pattern: 'Heap / Priority Queue', methods: ['top-k maintenance', 'min vs max heap', 'stream processing'] },
  { pattern: 'Union Find', methods: ['find with compression', 'union by size', 'component counting'] },
  { pattern: 'Intervals', methods: ['sort by boundary', 'merge overlaps', 'sweep decisions'] },
  { pattern: 'Prefix Sums', methods: ['running total', 'difference trick', 'remainder buckets'] },
  { pattern: 'Monotonic Stack', methods: ['pop trigger invariant', 'next greater / smaller', 'index storage'] },
  { pattern: 'Stacks / Queues', methods: ['LIFO/FIFO state', 'simulation', 'monotonic queues'] },
  { pattern: 'Linked Lists', methods: ['fast / slow pointers', 'pointer rewiring', 'dummy node'] },
  { pattern: 'Matrix / Grid', methods: ['direction vectors', 'bounds checks', 'multi-source BFS'] },
  { pattern: 'Greedy', methods: ['local choice rule', 'exchange argument', 'sorted decisions'] },
  { pattern: 'Topological Sort', methods: ['indegree bookkeeping', 'DAG ordering', 'cycle detection'] },
]

const requestSkillMapDrills = (body: SkillMapDrillsRequest) => {
  const requestKey = JSON.stringify(body)
  const existingRequest = skillMapDeckRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const request = fetch(apiUrl('/api/coach/skill-map-drills'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestKey,
  })
    .then(async (response) => {
      if (!response.ok) {
        let parsedError: unknown = null
        try {
          parsedError = await response.json()
        } catch {
          parsedError = null
        }

        const detail =
          parsedError &&
          typeof parsedError === 'object' &&
          parsedError !== null &&
          'detail' in parsedError &&
          typeof (parsedError as { detail?: unknown }).detail === 'object' &&
          (parsedError as { detail?: unknown }).detail !== null
            ? ((parsedError as { detail: ApiErrorDetail }).detail)
            : null

        throw new Error(
          detail?.message?.trim() || 'Unable to generate skill map drills'
        )
      }
      return (await response.json()) as SkillMapDrillsResponse
    })
    .finally(() => {
      if (skillMapDeckRequestCache.get(requestKey) === request) {
        skillMapDeckRequestCache.delete(requestKey)
      }
    })

  skillMapDeckRequestCache.set(requestKey, request)
  return request
}

const requestCoreAlgorithmDrills = (patternSlug: string) => {
  const requestKey = `core-algorithm:${patternSlug}`
  const existingRequest = skillMapDeckRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const request = fetch(apiUrl(`/api/coach/core-algorithm-drills/${encodeURIComponent(patternSlug)}`))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Unable to load core algorithms')
      }
      return (await response.json()) as SkillMapDrillsResponse
    })
    .finally(() => {
      if (skillMapDeckRequestCache.get(requestKey) === request) {
        skillMapDeckRequestCache.delete(requestKey)
      }
    })

  skillMapDeckRequestCache.set(requestKey, request)
  return request
}

const requestRandomCoreAlgorithmDrills = (count = 10) => {
  const requestKey = `core-algorithm-random:${count}`
  const existingRequest = skillMapDeckRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const request = fetch(apiUrl(`/api/coach/core-algorithm-drills?count=${count}`))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Unable to load core algorithms')
      }
      return (await response.json()) as SkillMapDrillsResponse
    })
    .finally(() => {
      if (skillMapDeckRequestCache.get(requestKey) === request) {
        skillMapDeckRequestCache.delete(requestKey)
      }
    })

  skillMapDeckRequestCache.set(requestKey, request)
  return request
}

const requestCoreAlgorithmDrillsByTag = (tagSlug: string, count = 10) => {
  const requestKey = `core-algorithm-tag:${tagSlug}:${count}`
  const existingRequest = skillMapDeckRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const request = fetch(apiUrl(`/api/coach/core-algorithm-drills?tag=${encodeURIComponent(tagSlug)}&count=${count}`))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Unable to load tagged core algorithms')
      }
      return (await response.json()) as SkillMapDrillsResponse
    })
    .finally(() => {
      if (skillMapDeckRequestCache.get(requestKey) === request) {
        skillMapDeckRequestCache.delete(requestKey)
      }
    })

  skillMapDeckRequestCache.set(requestKey, request)
  return request
}

const requestPromptToggleExplanation = (body: PromptToggleExplanationRequest) => {
  const requestKey = JSON.stringify(body)
  const existingRequest = promptToggleExplanationRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const request = fetch(apiUrl('/api/coach/prompt-toggle-explanation'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestKey,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Unable to generate plain English explanation')
      }
      return (await response.json()) as PromptToggleExplanationResponse
    })
    .finally(() => {
      if (promptToggleExplanationRequestCache.get(requestKey) === request) {
        promptToggleExplanationRequestCache.delete(requestKey)
      }
    })

  promptToggleExplanationRequestCache.set(requestKey, request)
  return request
}

const requestMultipleChoiceDrills = (body: MultipleChoiceDrillsRequest) => {
  const requestKey = JSON.stringify(body)
  const existingRequest = multipleChoiceDeckRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const request = fetch(apiUrl('/api/coach/multiple-choice-drills'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestKey,
  })
    .then(async (response) => {
      if (!response.ok) {
        let parsedError: unknown = null
        try {
          parsedError = await response.json()
        } catch {
          parsedError = null
        }

        const detail =
          parsedError &&
          typeof parsedError === 'object' &&
          parsedError !== null &&
          'detail' in parsedError &&
          typeof (parsedError as { detail?: unknown }).detail === 'object' &&
          (parsedError as { detail?: unknown }).detail !== null
            ? ((parsedError as { detail: ApiErrorDetail }).detail)
            : null

        throw new Error(
          detail?.message?.trim() || 'Unable to generate multiple choice questions'
        )
      }
      return (await response.json()) as MultipleChoiceDrillsResponse
    })
    .finally(() => {
      if (multipleChoiceDeckRequestCache.get(requestKey) === request) {
        multipleChoiceDeckRequestCache.delete(requestKey)
      }
    })

  multipleChoiceDeckRequestCache.set(requestKey, request)
  return request
}

const requestSkillMapDrillsStream = async (
  body: SkillMapDrillsRequest,
  onDrill: (drill: Flashcard, index: number, total: number) => void,
): Promise<SkillMapDrillsResponse> => {
  const response = await fetch(apiUrl('/api/coach/skill-map-drills-stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok || !response.body) throw new Error('Streaming unavailable')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const drills: Flashcard[] = []

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    let eventType = ''
    let eventData = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        eventData = line.slice(6)
      } else if (line === '' && eventType && eventData) {
        const parsed = JSON.parse(eventData)
        if (eventType === 'drill') {
          drills.push(parsed.drill as Flashcard)
          onDrill(parsed.drill as Flashcard, parsed.index as number, parsed.total as number)
        } else if (eventType === 'error') {
          throw new Error(parsed.message || 'Stream error')
        }
        eventType = ''
        eventData = ''
      }
    }
  }
  if (drills.length === 0) throw new Error('No drills received')
  return { drills, llmUsed: true }
}

const TEMPLATE_MODE_ORDER: TemplateMode[] = ['algorithm']
const DEFAULT_TEMPLATE_MODES: TemplateMode[] = ['algorithm']
const TEMPLATE_MODE_LABELS: Record<TemplateMode, string> = {
  algorithm: 'Algorithm',
}
const INLINE_LENS_OPTIONS: Array<{ value: InlineLens; label: string; title: string }> = [
  { value: 'pattern', label: 'Pattern', title: 'Pattern' },
  { value: 'plainEnglish', label: 'Plain English', title: 'Plain English' },
  { value: 'why', label: 'Why', title: 'Why' },
  { value: 'transfer', label: 'Transfer', title: 'Transfer' },
  { value: 'debug', label: 'Debug My Understanding', title: 'Debug My Understanding' },
]
const patternToSlug = (pattern: string) =>
  pattern
    .toLowerCase()
    .replace(/\//g, ' ')
    .replace(/&/g, ' ')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\s+/g, '-')

const patternLabelFromSlug = (slug: string) => {
  const overrides: Record<string, string> = {
    'dfs-bfs': 'DFS / BFS',
    heap: 'Heap / Priority Queue',
    'dynamic-programming': 'Dynamic Programming',
    'prefix-sums': 'Prefix Sums',
    'monotonic-stack': 'Monotonic Stack',
    'stacks-queues': 'Stacks / Queues',
    'linked-lists': 'Linked Lists',
    'matrix-grid': 'Matrix / Grid',
    'topological-sort': 'Topological Sort',
    'greedy-sorting': 'Greedy / Sorting',
    trie: 'Trie',
    trees: 'Trees',
  }
  return overrides[slug] ?? slug.split('-').filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')
}

const clampMultipleChoiceQuestionCount = (count: number) =>
  Math.min(MULTIPLE_CHOICE_MAX_COUNT, Math.max(MULTIPLE_CHOICE_MIN_COUNT, count))

const ensureTemplateModes = (modes: TemplateMode[]) => {
  const next = TEMPLATE_MODE_ORDER.filter((mode) => modes.includes(mode))
  return next.length > 0 ? next : [...DEFAULT_TEMPLATE_MODES]
}

const getPrimaryPatternTag = (tags: string[]) => {
  for (const tag of [
    'sliding-window',
    'two-pointers',
    'binary-search',
    'dfs-bfs',
    'graph-traversal',
    'backtracking',
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
    'greedy-sorting',
    'trie',
    'trees',
    'stack',
  ]) {
    if (tags.includes(tag)) return tag
  }
  if (tags.includes('graph') || tags.includes('graph-bfs')) return 'graph-traversal'
  return 'generic'
}

const normalizePromptLookup = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

const fallbackPlainEnglishPromptDetails: Record<string, PlainEnglishPromptDetail> = {
  'sliding-window': {
    plainEnglish: 'What can I learn from a small moving slice of the input?',
    interviewQuestion:
      'Given an array and a window size, compute the best value you can get from any contiguous window.',
    inputExample: 'nums = [1, 4, 2, 10, 3]\nk = 3\n\nmax_window_sum(nums, k)',
    outputExample: '16',
    explanation: 'The best window is [4, 2, 10], whose sum is 16.',
    brassTacks:
      'Sliding window answers: "What changes when I move the left or right edge one step?"',
    leetcodeExamples: [
      'Maximum Average Subarray: keep the best fixed-size window score.',
      'Longest Substring Without Repeating Characters: expand and shrink until valid.',
      'Minimum Window Substring: keep the smallest window that satisfies counts.',
    ],
  },
  'two-pointers': {
    plainEnglish: 'Which side should move so the search space gets smaller?',
    interviewQuestion:
      'Given a sorted array and a target, decide whether two values add up to the target.',
    inputExample: 'nums = [1, 2, 4, 7, 11]\ntarget = 9\n\ntwo_sum_sorted(nums, target)',
    outputExample: 'true',
    explanation: 'The values 2 and 7 add up to 9.',
    brassTacks:
      'Two pointers answers: "What can I rule out by moving one pointer inward?"',
    leetcodeExamples: [
      'Two Sum II: move inward based on the current sum.',
      'Container With Most Water: move the shorter wall.',
      'Valid Palindrome: compare mirrored characters.',
    ],
  },
  'binary-search': {
    plainEnglish: 'Can I discard half of the remaining choices?',
    interviewQuestion:
      'Given a sorted array and a target, return the index of the target or -1 if it is missing.',
    inputExample: 'nums = [1, 3, 5, 7, 9]\ntarget = 7\n\nbinary_search(nums, target)',
    outputExample: '3',
    explanation: 'The value 7 is at index 3.',
    brassTacks:
      'Binary search answers: "Which half can no longer contain the answer?"',
    leetcodeExamples: [
      'Search Insert Position: find the first valid slot.',
      'Find First and Last Position: search for boundaries.',
      'Koko Eating Bananas: binary search the answer.',
    ],
  },
  'dfs-bfs': {
    plainEnglish: 'What nodes are reachable from this starting node?',
    interviewQuestion:
      'Given a graph represented as an adjacency list and a starting node, return all nodes that can be reached from the starting node.',
    inputExample: `graph = {
    "A": ["B", "C"],
    "B": ["D"],
    "C": ["E"],
    "D": [],
    "E": [],
    "F": ["G"]
}

bfs("A", graph)`,
    outputExample: '{"A", "B", "C", "D", "E"}',
    explanation:
      'Because starting at "A", you can reach B, C, D, and E, but not F or G.',
    brassTacks:
      'BFS answers: "Starting here, what can I get to if I move one edge at a time?"',
    leetcodeExamples: [
      'Number of Islands: starting from one land cell, what connected land cells can I reach?',
      'Clone Graph: starting from one graph node, what whole connected component can I visit/copy?',
      'Course / prerequisite graphs: from this course, what downstream courses are reachable?',
      'Rotting Oranges: from rotten oranges, what fresh oranges can be reached over time?',
    ],
  },
  'graph-traversal': {
    plainEnglish: 'What order or reachability fact does this graph structure force?',
    interviewQuestion:
      'Given a directed graph, process nodes in an order that respects the edges.',
    inputExample: 'courses = 4\nprereqs = [[1, 0], [2, 0], [3, 1], [3, 2]]\n\ncourse_order(courses, prereqs)',
    outputExample: '[0, 1, 2, 3]',
    explanation: 'Course 0 unlocks 1 and 2, and both must come before 3.',
    brassTacks:
      'Graph traversal answers: "What can I visit next, and what must wait?"',
    leetcodeExamples: [
      'Course Schedule: track prerequisites with indegrees.',
      'Pacific Atlantic Water Flow: traverse reachable cells from borders.',
      'Network Delay Time: expand shortest known paths.',
    ],
  },
  backtracking: {
    plainEnglish: 'What choices can I try, and how do I undo one cleanly?',
    interviewQuestion:
      'Given a set of numbers, return every subset that can be formed.',
    inputExample: 'nums = [1, 2]\n\nsubsets(nums)',
    outputExample: '[[], [1], [1, 2], [2]]',
    explanation: 'Each number can be included or skipped, producing every possible subset.',
    brassTacks:
      'Backtracking answers: "Choose, explore, undo, then try the next choice."',
    leetcodeExamples: [
      'Subsets: include or skip each item.',
      'Combination Sum: explore choices while the target remains possible.',
      'Permutations: choose from remaining unused values.',
    ],
  },
  heap: {
    plainEnglish: 'Which item should come out next if I only care about priority?',
    interviewQuestion:
      'Given a stream of numbers, keep track of the k largest values seen so far.',
    inputExample: 'nums = [5, 1, 3, 9, 2]\nk = 2\n\ntop_k(nums, k)',
    outputExample: '[9, 5]',
    explanation: 'The two largest values are 9 and 5.',
    brassTacks:
      'Heap answers: "What should be easiest to remove: smallest, largest, or next best?"',
    leetcodeExamples: [
      'Kth Largest Element: maintain the best k candidates.',
      'Merge K Sorted Lists: repeatedly take the smallest head.',
      'Task Scheduler: prioritize the most constrained tasks.',
    ],
  },
  'union-find': {
    plainEnglish: 'Are these things in the same connected group?',
    interviewQuestion:
      'Given connections between nodes, count how many connected components remain.',
    inputExample: 'n = 5\nedges = [[0, 1], [1, 2], [3, 4]]\n\ncount_components(n, edges)',
    outputExample: '2',
    explanation: 'Nodes 0, 1, and 2 form one group; nodes 3 and 4 form another.',
    brassTacks:
      'Union Find answers: "Who is your group leader after these connections?"',
    leetcodeExamples: [
      'Number of Connected Components: merge endpoints of each edge.',
      'Redundant Connection: detect the edge that closes a cycle.',
      'Accounts Merge: union emails that belong together.',
    ],
  },
  'dynamic-programming': {
    plainEnglish: 'What smaller answers do I need before I can answer this one?',
    interviewQuestion:
      'Given n steps, count how many ways you can climb if you take 1 or 2 steps at a time.',
    inputExample: 'n = 5\n\nclimb_stairs(n)',
    outputExample: '8',
    explanation: 'The answer builds from the number of ways to reach the previous two steps.',
    brassTacks:
      'Dynamic programming answers: "What state summarizes everything I need so far?"',
    leetcodeExamples: [
      'Climbing Stairs: combine the previous two states.',
      'House Robber: choose take or skip for each house.',
      'Coin Change: build best answers from smaller amounts.',
    ],
  },
  dp: {
    plainEnglish: 'What smaller answers do I need before I can answer this one?',
    interviewQuestion:
      'Given n steps, count how many ways you can climb if you take 1 or 2 steps at a time.',
    inputExample: 'n = 5\n\nclimb_stairs(n)',
    outputExample: '8',
    explanation: 'The answer builds from the number of ways to reach the previous two steps.',
    brassTacks:
      'Dynamic programming answers: "What state summarizes everything I need so far?"',
    leetcodeExamples: [
      'Climbing Stairs: combine the previous two states.',
      'House Robber: choose take or skip for each house.',
      'Coin Change: build best answers from smaller amounts.',
    ],
  },
  intervals: {
    plainEnglish: 'Do these ranges overlap, touch, or need to stay separate?',
    interviewQuestion:
      'Given a list of intervals, merge all overlapping intervals.',
    inputExample: 'intervals = [[1, 3], [2, 6], [8, 10]]\n\nmerge(intervals)',
    outputExample: '[[1, 6], [8, 10]]',
    explanation: '[1, 3] and [2, 6] overlap, so they combine into [1, 6].',
    brassTacks:
      'Intervals answers: "After sorting, does the next range extend the current one?"',
    leetcodeExamples: [
      'Merge Intervals: combine overlapping ranges.',
      'Meeting Rooms II: count simultaneous active intervals.',
      'Insert Interval: place one range and merge neighbors.',
    ],
  },
  'prefix-sums': {
    plainEnglish: 'Can I answer a range question with two stored totals?',
    interviewQuestion:
      'Given an array, quickly return the sum between two indexes.',
    inputExample: 'nums = [2, 1, 3, 4]\nleft = 1\nright = 3\n\nrange_sum(nums, left, right)',
    outputExample: '8',
    explanation: 'The values from index 1 through 3 are 1, 3, and 4, which sum to 8.',
    brassTacks:
      'Prefix sums answer: "What changed between the total before and the total after?"',
    leetcodeExamples: [
      'Range Sum Query: subtract two prefix totals.',
      'Subarray Sum Equals K: remember earlier running totals.',
      'Continuous Subarray Sum: group prefix remainders.',
    ],
  },
  'monotonic-stack': {
    plainEnglish: 'What earlier items are resolved by this new item?',
    interviewQuestion:
      'Given daily temperatures, return how many days each day waits for a warmer temperature.',
    inputExample: 'temps = [73, 74, 75, 71]\n\ndaily_temperatures(temps)',
    outputExample: '[1, 1, 0, 0]',
    explanation: '73 waits one day for 74, and 74 waits one day for 75.',
    brassTacks:
      'Monotonic stack answers: "Which unresolved previous values does this value finally beat?"',
    leetcodeExamples: [
      'Daily Temperatures: resolve colder days when a warmer day appears.',
      'Next Greater Element: pop everything beaten by the current value.',
      'Largest Rectangle in Histogram: resolve bars when height drops.',
    ],
  },
  stack: {
    plainEnglish: 'What earlier items are resolved by this new item?',
    interviewQuestion:
      'Given daily temperatures, return how many days each day waits for a warmer temperature.',
    inputExample: 'temps = [73, 74, 75, 71]\n\ndaily_temperatures(temps)',
    outputExample: '[1, 1, 0, 0]',
    explanation: '73 waits one day for 74, and 74 waits one day for 75.',
    brassTacks:
      'Monotonic stack answers: "Which unresolved previous values does this value finally beat?"',
    leetcodeExamples: [
      'Daily Temperatures: resolve colder days when a warmer day appears.',
      'Next Greater Element: pop everything beaten by the current value.',
      'Largest Rectangle in Histogram: resolve bars when height drops.',
    ],
  },
  generic: {
    plainEnglish: 'What reusable interview move is this card asking me to practice?',
    interviewQuestion:
      'Given an input with a recognizable structure, apply the matching pattern and return the requested result.',
    inputExample: 'input = ...\n\nsolve(input)',
    outputExample: 'expected result',
    explanation: 'The concise prompt names the core move; the code target shows how that move is written.',
    brassTacks:
      'The goal is to translate the short pattern reminder into a working interview solution.',
    leetcodeExamples: [
      'Identify the pattern from the input shape.',
      'Maintain the key invariant while scanning or recursing.',
      'Return the result once the structure has been fully processed.',
    ],
  },
}

const patternDisplayLabel = (patternTag: string) =>
  patternTag
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Algorithm'

const extractFunctionSignature = (target: string) => {
  const firstDef = target.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\):/m)
  if (!firstDef) return { name: 'solve', params: '', call: 'solve(...)', signature: 'solve(...)' }
  const params = firstDef[2].trim()
  return {
    name: firstDef[1],
    params,
    call: `${firstDef[1]}(${params})`,
    signature: `${firstDef[1]}(${params})`,
  }
}

const functionWords = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/)
    .filter(Boolean)
    .join(' ')

const sampleValueForParam = (param: string) => {
  const name = param.split('=', 1)[0].replace(/[*:\s].*$/g, '').trim().toLowerCase()
  if (!name) return 'value'
  if (/^(s|str|string|expr|expression)$/.test(name) || name.includes('text')) return '"3+2*2"'
  if (name.includes('graph') || name.includes('adj')) return '{"A": ["B"], "B": []}'
  if (name.includes('interval')) return '[[1, 3], [2, 6]]'
  if (name.includes('edge')) return '[[0, 1], [1, 2]]'
  if (name.includes('grid') || name.includes('matrix')) return '[[1, 0], [1, 1]]'
  if (name.includes('target')) return '5'
  if (name === 'k') return '2'
  if (name === 'n') return '5'
  if (name.includes('num') || name.includes('arr') || name.includes('item') || name.includes('value')) return '[1, 2, 3]'
  return '...'
}

const getSignatureParamNames = (signature: ReturnType<typeof extractFunctionSignature>) =>
  signature.params
    .split(',')
    .map((param) => param.trim())
    .filter(Boolean)
    .map((param) => param.split(':', 1)[0].split('=', 1)[0].trim())
    .filter(Boolean)

const buildInputExampleFromSignature = (signature: ReturnType<typeof extractFunctionSignature>) => {
  const params = signature.params
    .split(',')
    .map((param) => param.trim())
    .filter(Boolean)
    .map((param) => param.split(':', 1)[0].split('=', 1)[0].trim())
    .filter(Boolean)

  if (params.length === 0) return `${signature.name}()`

  const assignments = params.map((param) => `${param} = ${sampleValueForParam(param)}`)
  return `${assignments.join('\n')}\n\n${signature.name}(${params.join(', ')})`
}

const extractReturnSummary = (target: string) => {
  const returns = [...target.matchAll(/^\s*return\s+(.+)$/gm)].map((match) => match[1].trim())
  if (returns.length === 0) return 'the value produced by the generated target'
  return `the expression \`${returns[returns.length - 1]}\``
}

const inferPlainEnglishProblem = (
  prompt: string,
  tags: string[],
  cardTitle: string,
  target: string,
  signature: ReturnType<typeof extractFunctionSignature>,
): PlainEnglishPromptDetail => {
  const name = signature.name.toLowerCase()
  const loweredTarget = target.toLowerCase()
  const primaryPattern = getPrimaryPatternTag(tags)
  const patternLabel = patternDisplayLabel(primaryPattern)
  const fallbackDetail = fallbackPlainEnglishPromptDetails[primaryPattern] ?? fallbackPlainEnglishPromptDetails.generic
  const readablePrompt = normalizePromptLookup(prompt).replace(/\.$/, '')
  const returnSummary = extractReturnSummary(target)
  const params = getSignatureParamNames(signature)

  if (
    primaryPattern === 'sliding-window' &&
    ((name.includes('window') && name.includes('max') && name.includes('sum')) ||
      /window_sum\s*=\s*sum\([^)]*\[:k\]\)/.test(target) ||
      /nums\[right\]\s*-\s*nums\[right\s*-\s*k\]/.test(target))
  ) {
    return {
      plainEnglish: 'What is the largest sum of any contiguous window of length k?',
      interviewQuestion:
        'Given an array of numbers and an integer k, return the maximum sum of any contiguous subarray of length k.',
      inputExample: `nums = [1, 4, 2, 10, 3]\nk = 3\n\n${signature.name}(nums, k)`,
      outputExample: '16',
      explanation: 'The best length-3 window is [4, 2, 10], whose sum is 16.',
      brassTacks: 'Keep the current k-sized window sum, slide one step, and remember the best sum seen.',
      leetcodeExamples: [
        'Maximum Average Subarray I: fixed-size window scoring.',
        'Subarray Product Less Than K: window score changes as edges move.',
        'Permutation in String: fixed-size window with counts.',
      ],
    }
  }

  if (name.includes('eval') && (name.includes('expr') || loweredTarget.includes("op = '+'"))) {
    return {
      plainEnglish: 'What number does this arithmetic expression evaluate to?',
      interviewQuestion:
        'Given a string expression containing non-negative integers and +, -, *, and /, evaluate it with normal operator precedence.',
      inputExample: `s = "3+2*2"\n\n${signature.name}(s)`,
      outputExample: '7',
      explanation: 'Multiplication is applied before addition, so the expression is 3 + 4.',
      brassTacks: 'Accumulate the current number, push signed terms, collapse multiply/divide immediately, then sum the stack.',
      leetcodeExamples: [
        'Basic Calculator II: evaluate +, -, *, and /.',
        'Basic Calculator: parse signs and nested structure.',
        'Evaluate Reverse Polish Notation: use a stack for pending values.',
      ],
    }
  }

  if (primaryPattern === 'backtracking' && (name.includes('subset') || name.includes('enumerate') || loweredTarget.includes('path.append'))) {
    const itemParam = params[0] || 'items'
    return {
      plainEnglish: `What are all the take/skip combinations from ${itemParam}?`,
      interviewQuestion:
        `Given ${itemParam}, return every subset that can be formed by choosing or skipping each item.`,
      inputExample: `${itemParam} = [1, 2]\n\n${signature.name}(${itemParam})`,
      outputExample: '[[], [2], [1], [1, 2]]',
      explanation: 'Each item has two choices: leave it out or include it in the current path.',
      brassTacks: 'At each index, recurse once without the item, then choose it, recurse, and undo the choice.',
      leetcodeExamples: [
        'Subsets: choose or skip each item.',
        'Combination Sum: choose, recurse, and backtrack.',
        'Permutations: track a path and undo choices.',
      ],
    }
  }

  if (primaryPattern === 'binary-search' || name.includes('lower_bound') || name.includes('binary_search')) {
    return {
      plainEnglish: 'Where is the first position that satisfies the search condition?',
      interviewQuestion:
        `Given sorted input, implement ${signature.signature} by repeatedly discarding the half that cannot contain the answer.`,
      inputExample: buildInputExampleFromSignature(signature),
      outputExample: 'the first valid index, or the insertion/search result',
      explanation: 'Each midpoint check decides which half still might contain the boundary.',
      brassTacks: 'Keep the answer inside [left, right), probe mid, then move one boundary.',
      leetcodeExamples: [
        'Search Insert Position: find the first legal slot.',
        'Find First and Last Position: locate boundaries.',
        'Koko Eating Bananas: binary search the answer.',
      ],
    }
  }

  const action = functionWords(signature.name)
  return {
    plainEnglish: `What should ${action} return?`,
    interviewQuestion:
      `Implement ${signature.signature}: ${readablePrompt || `return the ${action} result for the given input`}.`,
    inputExample: buildInputExampleFromSignature(signature),
    outputExample: `returns ${returnSummary}`,
    explanation:
      `${cardTitle} is a ${patternLabel} card. The function name and target code define the concrete problem this prompt is asking for.`,
    brassTacks:
      readablePrompt || `Write ${signature.signature} so the returned value matches the function's name.`,
    leetcodeExamples: [
      ...fallbackDetail.leetcodeExamples.slice(0, 2),
      `${patternLabel}: return the accumulated answer.`,
    ],
  }
}

const getPlainEnglishPromptDetail = (
  prompt: string,
  tags: string[],
  cardTitle: string,
  target: string,
): PlainEnglishPromptDetail => {
  const signature = extractFunctionSignature(target)
  return inferPlainEnglishProblem(prompt, tags, cardTitle, target, signature)
}

const normalizeTyping = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()

const estimateTemplateAccuracy = (expectedAnswer: string, userAnswer: string) => {
  const compareLength = Math.max(userAnswer.length, expectedAnswer.length, 1)
  let exactMatches = 0
  for (let i = 0; i < compareLength; i += 1) {
    if (userAnswer[i] === expectedAnswer[i]) exactMatches += 1
  }
  return Math.round((exactMatches / compareLength) * 100)
}

const INLINE_NOTE_COLUMN = 48
const LIVE_NOTE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'be',
  'before',
  'by',
  'for',
  'from',
  'if',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'then',
  'to',
  'use',
  'we',
  'when',
  'with',
  'your',
])

const shortenAnnotationNote = (value: string, maxWords = 8) => {
  const cleaned = value
    .replace(/#\s*/g, '')
    .replace(/\bINVARIANT\s*:\s*/gi, '')
    .replace(/[.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned.split(/\s+/).slice(0, maxWords).join(' ')
}

const getLiveMatchTokens = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_[\]:]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !LIVE_NOTE_STOP_WORDS.has(token))

const scoreLineAgainstLiveNote = (line: string, note: string) => {
  const trimmedLine = line.trim()
  if (!trimmedLine) return Number.NEGATIVE_INFINITY

  const lineLower = trimmedLine.toLowerCase()
  const noteLower = note.toLowerCase()
  const noteTokens = getLiveMatchTokens(note)
  const lineTokens = new Set(getLiveMatchTokens(trimmedLine))

  let score = 0
  noteTokens.forEach((token) => {
    if (lineTokens.has(token) || lineLower.includes(token)) score += token.length > 4 ? 3 : 2
  })

  if (/(sort|sorted|order)/.test(noteLower) && /(\.sort\(|sorted\()/.test(lineLower)) score += 7
  if (/(lambda|key)/.test(noteLower) && /(lambda|key\s*=)/.test(lineLower)) score += 5
  if (/(interval|merge|overlap)/.test(noteLower) && /(interval|merge|overlap|out\s*=|s,\s*e|a,\s*b)/.test(lineLower)) score += 3
  if (/(first|start|left|x\[0\]|\b0\b)/.test(noteLower) && /(\[0\]|x\[0\]|left|start)/.test(lineLower)) score += 4
  if (/(second|end|right|x\[1\]|\b1\b)/.test(noteLower) && /(\[1\]|x\[1\]|right|end)/.test(lineLower)) score += 4
  if (/(skip|second|rest|remaining|after first)/.test(noteLower) && /(\[1:\]|\[:1\])/.test(lineLower)) score += 5
  if (/(loop|iterate|walk|scan|each)/.test(noteLower) && /^for\b/.test(lineLower)) score += 5
  if (/return/.test(noteLower) && /^return\b/.test(lineLower)) score += 5
  if (/(append|push|pop|add|remove|update)/.test(noteLower) && /(append|push|pop|add|remove|=|\+=|-=)/.test(lineLower)) score += 3

  return score
}

const mergeLiveTone = (current: LiveInlineTone | null | undefined, next: LiveInlineTone): LiveInlineTone => {
  if (current === 'negative' || next === 'negative') return 'negative'
  if (current === 'positive' || next === 'positive') return 'positive'
  return 'neutral'
}

const mergeLiveLineAnnotation = (
  current: LiveLineAnnotation | undefined,
  incoming: LiveInlineNote,
): LiveLineAnnotation => {
  const compactNote = shortenAnnotationNote(incoming.text)
  if (!compactNote) {
    return current ?? { note: '', tone: incoming.tone }
  }

  if (!current || !current.note) {
    return { note: compactNote, tone: incoming.tone }
  }

  const currentParts = current.note.split(' / ').map((part) => part.trim().toLowerCase())
  if (currentParts.includes(compactNote.toLowerCase())) {
    return {
      note: current.note,
      tone: mergeLiveTone(current.tone, incoming.tone),
    }
  }

  return {
    note: `${current.note} / ${compactNote}`,
    tone: mergeLiveTone(current.tone, incoming.tone),
  }
}

const findBestLiveNoteAnchorLine = (lines: string[], note: string, preferredIndex: number) => {
  let bestScore = Number.NEGATIVE_INFINITY
  let bestIndex = -1

  lines.forEach((line, index) => {
    const score = scoreLineAgainstLiveNote(line, note)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
      return
    }
    if (score === bestScore && bestIndex >= 0 && Math.abs(index - preferredIndex) < Math.abs(bestIndex - preferredIndex)) {
      bestIndex = index
    }
  })

  if (bestScore >= 4 && bestIndex >= 0) return bestIndex
  return findNearestWrittenLineIndex(lines, preferredIndex)
}

const patternInlineDecisionNoteForPattern = (patternTag: string) => {
  switch (patternTag) {
    case 'sliding-window':
      return 'window valid before scoring'
    case 'two-pointers':
      return 'answer stays inside pointers'
    case 'binary-search':
      return 'answer stays inside bounds'
    case 'dynamic-programming':
    case 'dp':
      return 'take skip summarize processed prefix'
    case 'graph-traversal':
    case 'dfs-bfs':
      return 'frontier holds unvisited work'
    case 'backtracking':
      return 'path matches current branch'
    case 'heap':
      return 'heap holds current top-k'
    case 'union-find':
      return 'roots name connected groups'
    case 'intervals':
      return 'merged tail alone can overlap'
    case 'prefix-sums':
      return 'seen holds previous prefixes'
    case 'monotonic-stack':
    case 'stack':
      return 'stack keeps unresolved decreasing values'
    default:
      return 'state preserves valid updates'
  }
}

const inlineDecisionNoteForPattern = (patternTag: string, lens: InlineLens = 'pattern') => {
  if (patternTag === 'dynamic-programming' || patternTag === 'dp') {
    switch (lens) {
      case 'plainEnglish':
        return 'at each item choose take or skip'
      case 'why':
        return 'current best depends on earlier bests'
      case 'transfer':
        return 'define state, transition, final answer'
      case 'debug':
        return 'state meaning matters more than array'
      case 'pattern':
      default:
        return 'state stores best answer so far'
    }
  }

  switch (lens) {
    case 'plainEnglish':
      return 'make the next local decision'
    case 'why':
      return 'preserve the rule before moving on'
    case 'transfer':
      return 'state, update, answer'
    case 'debug':
      return 'check what this state represents'
    case 'pattern':
    default:
      return patternInlineDecisionNoteForPattern(patternTag)
  }
}

const patternInlineNoteForLine = (trimmedLine: string, patternTag: string) => {
  if (/^return\b/.test(trimmedLine)) {
    if (/max\(take,\s*skip\)/.test(trimmedLine)) return 'best of final choices'
    if (/return\s+0\b/.test(trimmedLine)) return 'nothing to choose'
    if (/return\s+out\b|return\s+res\b|return\s+result\b/.test(trimmedLine)) return 'return collected result'
    return ''
  }
  if (/^while\b/.test(trimmedLine)) {
    if (patternTag === 'sliding-window') return 'shrink until window is valid'
    if (patternTag === 'binary-search') return 'keep narrowing the search'
    if (patternTag === 'dfs-bfs' || patternTag === 'graph-traversal') return 'process frontier until empty'
    return ''
  }
  if (/^(def|for|if|elif|else)\b/.test(trimmedLine)) return ''
  if (patternTag === 'sliding-window') {
    if (/\b(best|ans)\s*=\s*max\(/.test(trimmedLine)) return 'keep best valid window'
    if (/\b(left|l)\s*\+=/.test(trimmedLine)) return 'shrink from the left'
    if (/\b\w+\[[^\]]+\]\s*=\s*\w+\.get\([^)]*\)\s*\+\s*1/.test(trimmedLine) || /\b\w+\[[^\]]+\]\s*\+=/.test(trimmedLine)) {
      return 'include entering value'
    }
    if (/\b\w+\[[^\]]+\]\s*-/.test(trimmedLine)) return 'remove leaving value'
    if (/^del\b/.test(trimmedLine)) return 'drop zero count'
    if (/\.(append|add)\(/.test(trimmedLine) || /^(out|res|result)\s*=\s*\[/.test(trimmedLine)) return 'record current window'
    return ''
  }
  if (patternTag === 'dfs-bfs' || patternTag === 'graph-traversal') {
    if (/\b(visited|seen)\.add\(/.test(trimmedLine)) return 'mark before enqueueing'
    if (/\b(popleft|pop)\(/.test(trimmedLine)) return 'take next frontier node'
    if (/\b(q|queue|frontier)\.(append|add|push)\(/.test(trimmedLine)) return 'enqueue unseen neighbor'
    if (/\.(append|add)\(/.test(trimmedLine)) return 'record reached node'
    return ''
  }
  if (patternTag === 'two-pointers') {
    if (/\b(left|l)\s*\+=/.test(trimmedLine)) return 'move left pointer inward'
    if (/\b(right|r)\s*-/.test(trimmedLine)) return 'move right pointer inward'
    if (/\b(total|cur|area)\s*=/.test(trimmedLine)) return 'measure current pair'
    return ''
  }
  if (patternTag === 'dynamic-programming' || patternTag === 'dp') {
    if (/^take\s*=\s*0\b/.test(trimmedLine)) return 'best if previous was taken'
    if (/^skip\s*=\s*0\b/.test(trimmedLine)) return 'best if previous was skipped'
    if (/take\s*,\s*skip\s*=/.test(trimmedLine)) return 'take x or skip x'
    if (/dp\[/.test(trimmedLine) || /transition/.test(trimmedLine)) return 'build from solved states'
  }
  if (patternTag === 'backtracking') {
    if (/\b(record|res|result|out)\.(append|add)\(/.test(trimmedLine)) return 'record completed path'
    if (/\bpath\.(append|add)\(/.test(trimmedLine)) return 'choose current item'
    if (/\bpath\.pop\(/.test(trimmedLine)) return 'undo current choice'
    if (/\b(dfs|backtrack|search)\(/.test(trimmedLine)) return 'explore this branch'
    return ''
  }
  if (patternTag === 'heap' && /heappush/.test(trimmedLine)) return 'include new candidate'
  if (patternTag === 'heap' && /heappop/.test(trimmedLine)) return 'drop smallest kept item'
  if ((patternTag === 'binary-search') && /mid\s*=/.test(trimmedLine)) return 'probe middle boundary'
  if ((patternTag === 'binary-search') && /left\s*=\s*mid/.test(trimmedLine)) return 'discard lower half'
  if ((patternTag === 'binary-search') && /right\s*=\s*mid/.test(trimmedLine)) return 'keep possible boundary'
  if (['intervals', 'prefix-sums', 'monotonic-stack', 'stack'].includes(patternTag)) {
    if (/\.(append|add|push)\(/.test(trimmedLine)) return 'record resolved state'
    if (/\.(pop|remove)\(/.test(trimmedLine)) return 'discard stale candidate'
    return ''
  }
  if (/\b(union|find)\b/.test(trimmedLine)) return 'merge or locate root'
  if (trimmedLine.startsWith('#')) return ''
  if (patternTag === 'union-find' && /^parent\b|^rank\b/.test(trimmedLine)) return 'self-label before merging'
  return ''
}

const dynamicProgrammingInlineNoteForLine = (trimmedLine: string, lens: InlineLens) => {
  const hasDpState = /\bdp\s*=/.test(trimmedLine)
  const isLoop = /^for\b/.test(trimmedLine)
  const isTake = /^take\s*=/.test(trimmedLine)
  const isSkip = /^skip\s*=/.test(trimmedLine)
  const isReturn = /^return\b/.test(trimmedLine)
  const isTransition = !isReturn && (/^dp\[[^\]]+\]\s*=\s*max\(/.test(trimmedLine) || /max\(take,\s*skip\)/.test(trimmedLine))

  if (lens === 'pattern') {
    if (hasDpState) return 'state table indexed by prefix'
    if (isLoop) return 'build states left to right'
    if (isTake) return 'candidate using current item'
    if (isSkip) return 'candidate carrying previous best'
    if (isTransition) return 'transition stores best candidate'
    if (isReturn) return 'answer is final state'
  }

  if (lens === 'plainEnglish') {
    if (hasDpState) return 'dp[i] means best using first i items'
    if (isLoop) return 'look at each item in order'
    if (isTake) return 'use this item plus earlier safe best'
    if (isSkip) return 'ignore this item and keep previous best'
    if (isTransition) return 'choose the better of taking or skipping'
    if (isReturn) return 'final slot holds the full answer'
  }

  if (lens === 'why') {
    if (hasDpState) return 'stores solved smaller answers'
    if (isLoop) return 'each step extends the solved prefix'
    if (isTake) return 'taking blocks the adjacent previous item'
    if (isSkip) return 'skipping preserves the known best'
    if (isTransition) return 'optimal answer is the better valid choice'
    if (isReturn) return 'all choices have been summarized'
  }

  if (lens === 'transfer') {
    if (hasDpState) return 'common DP move: name state meaning'
    if (isLoop) return 'common DP move: scan states in order'
    if (isTake) return 'choice branch uses compatible previous state'
    if (isSkip) return 'choice branch carries previous state'
    if (isTransition) return 'transition compares candidate choices'
    if (isReturn) return 'return the state covering the whole input'
  }

  if (lens === 'debug') {
    if (hasDpState) return 'do not memorize array; define dp[i]'
    if (isLoop) return 'i indexes dp slots, val is current item'
    if (isTake) return 'check the index you jump back to'
    if (isSkip) return 'previous best already considered earlier items'
    if (isTransition) return 'if this feels magic, name take and skip'
    if (isReturn) return 'last state is answer only by definition'
  }

  return ''
}

const transformInlineNoteForLens = (note: string, lens: InlineLens) => {
  if (!note) return ''
  if (lens === 'pattern') return note
  if (lens === 'plainEnglish') return note
    .replace(/^include entering value$/, 'add the new value')
    .replace(/^remove leaving value$/, 'take out the old value')
    .replace(/^record current window$/, 'save this answer')
    .replace(/^mark before enqueueing$/, 'remember this node is seen')
    .replace(/^take next frontier node$/, 'work on the next node')
    .replace(/^enqueue unseen neighbor$/, 'save neighbor to visit later')
    .replace(/^choose current item$/, 'try this choice')
    .replace(/^undo current choice$/, 'put things back before trying next')
  if (lens === 'why') return note
    .replace(/^keep best valid window$/, 'only valid windows can improve answer')
    .replace(/^shrink from the left$/, 'restore the window rule')
    .replace(/^probe middle boundary$/, 'middle tells which half survives')
    .replace(/^discard lower half$/, 'lower values cannot contain answer')
    .replace(/^keep possible boundary$/, 'answer may still be at mid')
  if (lens === 'transfer') return note
    .replace(/^keep best valid window$/, 'update answer after state is valid')
    .replace(/^shrink from the left$/, 'move boundary until invariant holds')
    .replace(/^probe middle boundary$/, 'search on a monotonic decision')
    .replace(/^record resolved state$/, 'emit or store resolved candidate')
    .replace(/^discard stale candidate$/, 'remove candidates that cannot win')
  if (lens === 'debug') return note
    .replace(/^keep best valid window$/, 'update best only after validity check')
    .replace(/^shrink from the left$/, 'ask what broke the invariant')
    .replace(/^probe middle boundary$/, 'check your inclusive bounds')
    .replace(/^record resolved state$/, 'confirm this state is truly done')
    .replace(/^discard stale candidate$/, 'confirm it cannot affect future answers')
  return note
}

const inlineNoteForLine = (trimmedLine: string, patternTag: string, lens: InlineLens = 'pattern') => {
  if (/^(def|if|elif|else)\b/.test(trimmedLine)) return ''
  if (patternTag === 'dynamic-programming' || patternTag === 'dp') {
    const dpNote = dynamicProgrammingInlineNoteForLine(trimmedLine, lens)
    if (dpNote) return dpNote
  }
  const patternNote = patternInlineNoteForLine(trimmedLine, patternTag)
  return transformInlineNoteForLens(patternNote, lens)
}

const appendAlignedNote = (line: string, note: string) => {
  const compactNote = shortenAnnotationNote(note)
  if (!compactNote) return line
  const trimmedRight = line.trimEnd()
  if (!trimmedRight) return `${' '.repeat(INLINE_NOTE_COLUMN)}${compactNote}`
  const padding = ' '.repeat(Math.max(2, INLINE_NOTE_COLUMN - trimmedRight.length))
  return `${trimmedRight}${padding}${compactNote}`
}

const INLINE_GENERIC_NOTES = [
  'update state for next decision',
  'return final answer',
  'restore rule before continuing',
  'move through core step',
  'choose rule-preserving branch',
  'repeat until state settles',
  'state depends on solved states',
]

const removeDuplicateInlineNotes = (note: string) => {
  let cleaned = note.trim()
  INLINE_GENERIC_NOTES.forEach((genericNote) => {
    const escaped = genericNote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\s+${escaped}\\b`, 'gi'), genericNote)
  })
  return cleaned.replace(/\s+/g, ' ').trim()
}

const hasAlignedInlineNote = (line: string) => /.*\S\s{6,}\S/.test(line) || new RegExp(`^\\s{${INLINE_NOTE_COLUMN},}\\S`).test(line)

const stripKnownInlineNote = (line: string) => {
  const lower = line.toLowerCase()
  const firstIndex = INLINE_GENERIC_NOTES
    .map((note) => lower.indexOf(note.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  return firstIndex === undefined ? line : line.slice(0, firstIndex).trimEnd()
}

const appendInlineNote = (line: string, patternTag: string, lens: InlineLens = 'pattern') => {
  if (hasAlignedInlineNote(line)) {
    const parts = splitInlineAnnotationLine(line)
    if (!parts.note) return line.trimEnd()
    const cleanedNote = removeDuplicateInlineNotes(parts.note)
    if (INLINE_GENERIC_NOTES.some((note) => note.toLowerCase() === cleanedNote.toLowerCase()) || lens !== 'pattern') {
      if (!parts.code.trim()) return appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens))
      const comment = inlineNoteForLine(parts.code.trim(), patternTag, lens)
      return appendAlignedNote(parts.code, comment)
    }
    return appendAlignedNote(parts.code, cleanedNote)
  }
  const hashIndex = line.indexOf('#')
  if (hashIndex >= 0) {
    const beforeComment = line.slice(0, hashIndex)
    const existingNote = line.slice(hashIndex + 1)
    return appendAlignedNote(beforeComment, existingNote)
  }
  const cleanedLine = stripKnownInlineNote(line)
  const trimmedLine = cleanedLine.trim()
  if (!trimmedLine) return line
  const comment = inlineNoteForLine(trimmedLine, patternTag, lens)
  return appendAlignedNote(cleanedLine, comment)
}

const shouldPlaceInlineDecisionNoteAfter = (line: string, insideLoop: boolean, patternTag: string, lens: InlineLens = 'pattern') => {
  if (!insideLoop) return false
  const codePart = line.split('#', 1)[0].trim()
  if (!codePart) return false
  if (/^(def|for|while|if|elif|else|return)\b/.test(codePart)) return false
  return Boolean(inlineNoteForLine(codePart, patternTag, lens))
}

const buildInlineTemplate = (patternTag: string, algorithmTarget: string, lens: InlineLens = 'pattern') => {
  const lines = normalizeTyping(algorithmTarget).split('\n')
  const output: string[] = []
  let inlineDecisionInserted = false
  let insideLoop = false

  lines.forEach((line) => {
    if (/^\s*(for|while)\b/.test(line)) {
      insideLoop = true
    }
    const nextLine = appendInlineNote(line, patternTag, lens)
    output.push(nextLine)
    if (isInlineDecisionLine(nextLine)) {
      inlineDecisionInserted = true
    }
    if (!inlineDecisionInserted && shouldPlaceInlineDecisionNoteAfter(line, insideLoop, patternTag, lens)) {
      output.push(appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
      inlineDecisionInserted = true
    }
  })

  if (!inlineDecisionInserted) {
    const defIndex = lines.findIndex((line) => /^\s*def\s+/.test(line))
    if (defIndex >= 0) {
      output.splice(defIndex + 1, 0, appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
    } else {
      output.unshift(appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
    }
  }

  return output.join('\n')
}

const extractNestedHelperTarget = (algorithmTarget: string) => {
  const lines = normalizeTyping(algorithmTarget).split('\n')
  for (let start = 0; start < lines.length; start += 1) {
    const match = lines[start]?.match(/^(\s*)def\s+(dfs|backtrack|search|helper)\s*\(/)
    if (!match?.[1]) continue
    const baseIndent = match[1].length
    const block = [lines[start] ?? '']
    for (const nextLine of lines.slice(start + 1)) {
      const indent = nextLine.length - nextLine.trimStart().length
      if (nextLine.trim() && indent <= baseIndent) break
      block.push(nextLine)
    }
    return block
      .map((line) => line.length >= baseIndent ? line.slice(baseIndent) : line.trimStart())
      .join('\n')
      .replace(/\blen\((items|nums|arr|values|candidates|choices|s)\)/g, 'n')
      .trim()
  }
  return ''
}

const buildCoreShapeTemplate = (patternTag: string, algorithmTarget: string) => {
  if (patternTag === 'backtracking') {
    const nestedHelper = extractNestedHelperTarget(algorithmTarget)
    if (nestedHelper) return buildInlineTemplate(patternTag, nestedHelper)
  }
  return buildInlineTemplate(patternTag, algorithmTarget)
}

const normalizeInlineTemplateTarget = (rawTarget: string, patternTag: string, lens: InlineLens = 'pattern') => {
  const lines = normalizeTyping(rawTarget)
    .split('\n')
    .filter((line) => !isNoteOnlyInlineDecisionLine(line))
  const output = lines.map((line) => appendInlineNote(line, patternTag, lens))
  if (output.some((line) => isInlineDecisionLine(line))) {
    return output.join('\n')
  }

  let insideLoop = false
  const inlineDecisionIndex = lines.findIndex((line) => {
    if (/^\s*(for|while)\b/.test(line)) {
      insideLoop = true
      return false
    }
    return shouldPlaceInlineDecisionNoteAfter(line, insideLoop, patternTag, lens)
  })
  if (inlineDecisionIndex >= 0) {
    output.splice(inlineDecisionIndex + 1, 0, appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
  } else {
    const defIndex = lines.findIndex((line) => /^\s*def\s+/.test(line))
    if (defIndex >= 0) {
      output.splice(defIndex + 1, 0, appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
    } else {
      output.unshift(appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
    }
  }
  return output.join('\n')
}

const buildPracticePrompt = (templateMode: TemplateMode, patternTag: string) => {
  const patternLabel = patternTag
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Algorithm'

  const focusByPattern: Record<string, Partial<Record<TemplateMode, string>>> = {
    'sliding-window': {
      algorithm: 'code the expand/shrink/update-best loop',
    },
    'two-pointers': {
      algorithm: 'code the inward pointer scan',
    },
    'binary-search': {
      algorithm: 'code the midpoint discard loop',
    },
    'dynamic-programming': {
      algorithm: 'code the state-transition loop',
    },
    dp: {
      algorithm: 'code the state-transition loop',
    },
    'graph-traversal': {
      algorithm: 'code the frontier plus visited loop',
    },
    'dfs-bfs': {
      algorithm: 'code the frontier plus visited loop',
    },
    backtracking: {
      algorithm: 'code the choose/recurse/undo loop',
    },
    heap: {
      algorithm: 'code the push/prune heap loop',
    },
    'union-find': {
      algorithm: 'code the find/union component loop',
    },
    intervals: {
      algorithm: 'code the sort-and-merge sweep',
    },
    'prefix-sums': {
      algorithm: 'code the prefix query loop',
    },
    'monotonic-stack': {
      algorithm: 'code the pop-then-push stack loop',
    },
    stack: {
      algorithm: 'code the pop-then-push stack loop',
    },
  }

  const defaultFocus: Record<TemplateMode, string> = {
    algorithm: 'code the reusable pattern loop',
  }
  const spiritByPattern: Record<string, string> = {
    'sliding-window': 'turn one pass into a valid-range search',
    'two-pointers': 'use order to eliminate the losing side',
    'binary-search': 'exploit sorted data by discarding half',
    'dynamic-programming': 'reuse solved state instead of recomputing',
    dp: 'reuse solved state instead of recomputing',
    'graph-traversal': 'expand the frontier and visit each state once',
    'dfs-bfs': 'expand the frontier and visit each state once',
    backtracking: 'explore choices cleanly and undo without drift',
    heap: 'keep the best candidates at the top',
    'union-find': 'treat components as roots and merge fast',
    intervals: 'sort boundaries so overlap becomes local',
    'prefix-sums': 'turn range sums into constant-time lookups',
    'monotonic-stack': 'keep only candidates that still matter',
    stack: 'keep only candidates that still matter',
  }
  const focus = focusByPattern[patternTag]?.[templateMode] || defaultFocus[templateMode]
  const spirit = spiritByPattern[patternTag] || 'lean on the reusable pattern instead of brute force'
  return `${patternLabel}: ${spirit}; ${focus}.`
}

const isPlaceholderLine = (line: string) => /\b(pass|something|todo|tbd)\b/i.test(line.trim())

const createInteractionId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const summarizeRecallAttempt = (
  actualLines: string[],
  accuracy: number,
  exact: boolean,
  elapsedMs: number,
  attemptNumber: number,
  supportLayer: SupportLayer
): RecallAttemptSnapshot => ({
  attemptNumber,
  accuracy,
  exact,
  elapsedMs,
  supportLayer,
  usedPlaceholder: actualLines.some((line) => isPlaceholderLine(line)),
  hasGuard: actualLines.some((line) => /^\s*if\b/.test(line) && /not|visited|seen|< 0|>=/.test(line)),
  hasBookkeeping: actualLines.some((line) =>
    /(graph|visited|seen|indegree|parent|dist|rows|cols|queue|deque|stack|\bm\b|\bn\b|state|window)/i.test(line)
  ),
  hasTraversal: actualLines.some((line) => /\bdfs\b|\bbfs\b|queue|deque|stack/i.test(line)),
  hasLoop: actualLines.some((line) =>
    /^\s*(for|while)\b/.test(line)
  ),
})

const analyzeLiveStructure = (code: string, templateMode: TemplateMode): LiveStructure => {
  const lines = code.replace(/\r\n/g, '\n').split('\n')
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0).length
  const hasSignature = lines.some((line) =>
    /^\s*def\s+/.test(line)
  )
  const hasGuard = lines.some((line) =>
    /^\s*if\b/.test(line) && /not|visited|seen|< 0|>=/.test(line)
  )
  const traversalKind = lines.some((line) => /\bdfs\b/.test(line))
    ? 'dfs'
    : lines.some((line) => /\bbfs\b/.test(line))
      ? 'bfs'
      : lines.some((line) => /\bqueue\b|\bdeque\b|\bq\b/.test(line))
        ? 'queue'
        : lines.some((line) => /\bstack\b/.test(line))
          ? 'stack'
          : null
  const hasLoop = lines.some((line) =>
    /^\s*(for|while)\b/.test(line)
  )
  const hasPlaceholder = lines.some((line) => isPlaceholderLine(line))
  const hasBookkeeping = lines.some((line) =>
    /(graph|visited|seen|indegree|parent|dist|rows|cols|queue|deque|stack|\bm\b|\bn\b|state|window|count)/i.test(line)
  )

  return {
    nonEmptyLines,
    hasSignature,
    hasGuard,
    traversalKind,
    hasLoop,
    hasPlaceholder,
    hasBookkeeping,
    milestoneKey: [
      hasSignature ? 'sig' : 'no-sig',
      hasGuard ? 'guard' : 'no-guard',
      traversalKind ?? 'no-traversal',
      hasLoop ? 'loop' : 'no-loop',
      hasPlaceholder ? 'placeholder' : 'no-placeholder',
      hasBookkeeping ? 'state' : 'no-state',
      templateMode,
      `lines-${Math.min(nonEmptyLines, 8)}`,
    ].join('|'),
  }
}

const liveProgressKey = (structure: LiveStructure) =>
  [
    structure.hasSignature ? 'sig' : 'no-sig',
    structure.hasGuard ? 'guard' : 'no-guard',
    structure.traversalKind ?? 'no-traversal',
    structure.hasLoop ? 'loop' : 'no-loop',
    structure.hasPlaceholder ? 'placeholder' : 'no-placeholder',
    structure.hasBookkeeping ? 'state' : 'no-state',
  ].join('|')

const firstChangedLineIndex = (previousText: string, nextText: string) => {
  const previousLines = previousText.replace(/\r\n/g, '\n').split('\n')
  const nextLines = nextText.replace(/\r\n/g, '\n').split('\n')
  const maxLines = Math.max(previousLines.length, nextLines.length)
  for (let index = 0; index < maxLines; index += 1) {
    if ((previousLines[index] ?? '') !== (nextLines[index] ?? '')) return index
  }
  return -1
}

const hasUsefulLiveStructure = (trimmedInput: string, structure: LiveStructure) =>
  trimmedInput.length >= 12 && structure.nonEmptyLines >= 2

const chooseLiveCoachTiming = ({
  trimmedInput,
  structure,
  previous,
  accuracy,
  now,
  idleForMs,
  stallMs,
  debounceMs,
  isGhostRepsEnabled,
}: {
  trimmedInput: string
  structure: LiveStructure
  previous: LiveCoachSnapshot | null
  accuracy: number
  now: number
  idleForMs: number
  stallMs: number
  debounceMs: number
  isGhostRepsEnabled: boolean
}): { decision: LiveCoachTimingDecision | null; snapshot: LiveCoachSnapshot } => {
  const progressKey = liveProgressKey(structure)
  const changedLine = previous ? firstChangedLineIndex(previous.text, trimmedInput) : -1
  const sameLineEditCount =
    previous && changedLine >= 0 && changedLine === previous.changedLine
      ? previous.sameLineEditCount + 1
      : changedLine >= 0
        ? 1
        : 0
  const madeMeaningfulProgress =
    !previous ||
    progressKey !== previous.progressKey ||
    structure.nonEmptyLines > previous.nonEmptyLines ||
    trimmedInput.length >= previous.text.length + 8 ||
    accuracy >= previous.accuracy + 8
  const lastMeaningfulProgressAt = madeMeaningfulProgress
    ? now
    : previous?.lastMeaningfulProgressAt ?? now
  const snapshot: LiveCoachSnapshot = {
    text: trimmedInput,
    progressKey,
    accuracy,
    nonEmptyLines: structure.nonEmptyLines,
    changedLine,
    sameLineEditCount,
    lastMeaningfulProgressAt,
  }

  if (!previous) return { decision: null, snapshot }

  const reachedStructuralMilestone =
    progressKey !== previous.progressKey &&
    (structure.hasLoop || structure.hasGuard || structure.hasBookkeeping || structure.nonEmptyLines >= 4)
  if (reachedStructuralMilestone) {
    return { decision: { reason: 'milestone', delayMs: debounceMs }, snapshot }
  }

  const accuracyDrop = previous.accuracy - accuracy
  if (!isGhostRepsEnabled && accuracyDrop >= 18 && structure.nonEmptyLines >= 3) {
    return { decision: { reason: 'drift', delayMs: debounceMs }, snapshot }
  }

  if (!isGhostRepsEnabled && sameLineEditCount >= 4 && idleForMs >= 1_200) {
    return { decision: { reason: 'churn', delayMs: 650 }, snapshot }
  }

  const stalledAfterProgress = idleForMs >= stallMs && now - lastMeaningfulProgressAt >= stallMs
  if (stalledAfterProgress && structure.nonEmptyLines >= 3) {
    return { decision: { reason: 'stall', delayMs: 0 }, snapshot }
  }

  return { decision: null, snapshot }
}

const computeLineReview = (expectedCode: string, actualCode: string) => {
  const expectedLines = expectedCode.replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd())
  const actualLines = actualCode.replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd())
  const maxLines = Math.max(expectedLines.length, actualLines.length, 1)
  const reviews: LineReview[] = []

  for (let i = 0; i < maxLines; i += 1) {
    const expected = expectedLines[i] ?? ''
    const actual = actualLines[i] ?? ''
    let status: LineReviewStatus = 'match'
    if (expected !== actual) {
      if (!actual && expected) status = 'missing'
      else if (actual && !expected) status = 'extra'
      else status = 'mismatch'
    }
    reviews.push({ lineNumber: i + 1, status, expected, actual })
  }

  return { reviews, actualStatuses: reviews.slice(0, actualLines.length).map((line) => line.status) }
}

const splitInlineAnnotationLine = (line: string) => {
  const noteOnlyMatch = line.match(new RegExp(`^(\\s{${INLINE_NOTE_COLUMN},})(\\S.*)$`))
  if (noteOnlyMatch) {
    return { code: '', gap: noteOnlyMatch[1], note: noteOnlyMatch[2], noteOnly: true }
  }

  const inlineMatch = line.match(/^(.*?\S)(\s{6,})(\S.*)$/)
  if (inlineMatch) {
    return { code: inlineMatch[1], gap: inlineMatch[2], note: inlineMatch[3], noteOnly: false }
  }

  return { code: line, gap: '', note: '', noteOnly: false }
}

const isInlineDecisionLine = (line: string) => {
  const { note, noteOnly } = splitInlineAnnotationLine(line)
  if (!noteOnly) return false
  return /\b(window|answer|state|frontier|path|heap|roots|merged|seen|stack|take|skip|best|rule|choice|decision)\b/i.test(note)
}

const isNoteOnlyInlineDecisionLine = (line: string) => {
  const match = line.match(new RegExp(`^\\s{${INLINE_NOTE_COLUMN},}(\\S.*)$`))
  if (!match) return false
  return isInlineDecisionLine(appendAlignedNote('', match[1]))
}

const stripInlineAnnotationNotes = (code: string) =>
  code
    .split('\n')
    .map((line) => splitInlineAnnotationLine(line).code)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()

const stripHashAnnotationComments = (code: string) =>
  code
    .split('\n')
    .map((line) => line.split('#', 1)[0].trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .trimEnd()

const inlineDisplayLines = (code: string) => {
  const displayLines: Array<{ line: string, sourceLineNumber: number, absorbedDecision: boolean }> = []
  code.split('\n').forEach((line, index) => {
    const parts = splitInlineAnnotationLine(line)
    if (parts.noteOnly && displayLines.length > 0) {
      const previous = displayLines[displayLines.length - 1]
      const previousParts = splitInlineAnnotationLine(previous.line)
      if (previousParts.code.trim()) {
        const combinedNote = [previousParts.note, parts.note].filter((note) => note.trim()).join(' / ')
        previous.line = appendAlignedNote(previousParts.code, combinedNote)
        previous.absorbedDecision = previous.absorbedDecision || isInlineDecisionLine(line)
        return
      }
    }
    displayLines.push({ line, sourceLineNumber: index + 1, absorbedDecision: false })
  })
  return displayLines
}

function InlineAnnotatedCode({
  code,
  language,
  syntaxTheme,
  lineClassName,
}: {
  code: string
  language: string
  syntaxTheme: Record<string, CSSProperties>
  lineClassName?: (line: string, lineNumber: number) => string
}) {
  const lines = inlineDisplayLines(code)
  const inlineSyntaxStyle = {
    margin: 0,
    padding: 0,
    background: 'transparent',
    border: 'none',
    display: 'inline',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    whiteSpace: 'pre',
  } as const

  return (
    <pre className="inline-annotated-code">
      <code>
        {lines.map(({ line, sourceLineNumber, absorbedDecision }) => {
          const parts = splitInlineAnnotationLine(line)
          const baseClassName = lineClassName?.(line, sourceLineNumber) ?? 'typing-highlight-line'
          const className = absorbedDecision && !baseClassName.includes('inline-decision-line')
            ? `${baseClassName} inline-decision-line`
            : baseClassName
          return (
            <span key={`${sourceLineNumber}-${line}`} className={className}>
              {parts.code && (
                <SyntaxHighlighter
                  language={language}
                  style={syntaxTheme}
                  PreTag="span"
                  CodeTag="span"
                  customStyle={inlineSyntaxStyle}
                  codeTagProps={{ style: inlineSyntaxStyle }}
                >
                  {parts.code}
                </SyntaxHighlighter>
              )}
              {parts.gap && <span className="inline-note-gap">{parts.gap}</span>}
              {parts.note && <span className="inline-note-text">{parts.note}</span>}
              {!parts.code && !parts.gap && !parts.note ? ' ' : null}
            </span>
          )
        })}
      </code>
    </pre>
  )
}

function InlineDecisionCode({
  code,
  language,
  syntaxTheme,
}: {
  code: string
  language: string
  syntaxTheme: Record<string, CSSProperties>
}) {
  return (
    <InlineAnnotatedCode
      code={code}
      language={language}
      syntaxTheme={syntaxTheme}
      lineClassName={(line) =>
        isInlineDecisionLine(line)
          ? 'typing-highlight-line inline-decision-line'
          : 'typing-highlight-line'
      }
    />
  )
}

function LiveFeedbackCode({
  code,
  language,
  syntaxTheme,
  displayLines,
  lineReviewStatuses,
  showSubmittedLineReview,
  shouldHighlightInlineDecision,
}: {
  code: string
  language: string
  syntaxTheme: Record<string, CSSProperties>
  displayLines: AnnotatedDisplayLine[]
  lineReviewStatuses: LineReviewStatus[]
  showSubmittedLineReview: boolean
  shouldHighlightInlineDecision: boolean
}) {
  return (
    <InlineAnnotatedCode
      code={code}
      language={language}
      syntaxTheme={syntaxTheme}
      lineClassName={(line, lineNumber) => {
        const displayLine = displayLines[lineNumber - 1]
        const status =
          displayLine &&
          showSubmittedLineReview &&
          displayLine.sourceLineNumber
            ? lineReviewStatuses[displayLine.sourceLineNumber - 1] ?? 'match'
            : null
        const inlineDecisionClass =
          shouldHighlightInlineDecision && isInlineDecisionLine(line)
            ? ' inline-decision-line'
            : ''
        const liveToneClass = displayLine?.liveTone ? ` live-target-${displayLine.liveTone}` : ''
        const liveSourceClass =
          displayLine?.sourceLineNumber !== null && displayLine?.liveTone
            ? ' live-target-source-line'
            : ''
        return `typing-highlight-line${status ? ` line-${status}` : ''}${inlineDecisionClass}${liveToneClass}${liveSourceClass}`
      }}
    />
  )
}

type MarkdownCodeSegment =
  | { type: 'text'; text: string }
  | { type: 'code'; code: string; language: string }

const normalizeCodeLanguage = (language: string) => {
  const normalized = language.trim().toLowerCase()
  if (normalized === 'py') return 'python'
  return normalized || 'python'
}

const parseMarkdownCodeSegments = (text: string): MarkdownCodeSegment[] => {
  const segments: MarkdownCodeSegment[] = []
  const fencePattern = /```([A-Za-z0-9_-]+)?\s*\n?([\s\S]*?)```/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = fencePattern.exec(text)) !== null) {
    if (match.index > cursor) {
      const textContent = text.slice(cursor, match.index).trim()
      if (textContent) segments.push({ type: 'text', text: textContent })
    }
    segments.push({
      type: 'code',
      language: normalizeCodeLanguage(match[1] ?? 'python'),
      code: match[2].trim(),
    })
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    const textContent = text.slice(cursor).trim()
    if (textContent) segments.push({ type: 'text', text: textContent })
  }

  return segments.length > 0 ? segments : [{ type: 'text', text }]
}

const normalizePythonCodeForDisplay = (code: string, language: string) => {
  if (normalizeCodeLanguage(language) !== 'python') return code.trim()

  return code
    .replace(/\t/g, '    ')
    .split('\n')
    .map((line) => {
      const trimmedRight = line.trimEnd()
      const leadingWhitespace = trimmedRight.match(/^\s*/)?.[0] ?? ''
      const content = trimmedRight.slice(leadingWhitespace.length)
      const indentationWidth = leadingWhitespace.length > 0
        ? Math.max(4, Math.ceil(leadingWhitespace.length / 4) * 4)
        : 0
      const paddedContent = content
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*(==|!=|<=|>=|\+=|-=|\*=|\/=|%=|\/\/|\*\*|[+\-*/%<>])\s*/g, ' $1 ')
        .replace(/(?<![<>=!+\-*/%])\s*=\s*(?![=])/g, ' = ')
        .replace(/\s+/g, ' ')
        .trim()
      return `${' '.repeat(indentationWidth)}${paddedContent}`
    })
    .join('\n')
    .trim()
}

const renderInlineMarkdownText = (text: string) => {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index} className="multiple-choice-inline-code">{part.slice(1, -1)}</code>
    }
    return <span key={index}>{part}</span>
  })
}

function MarkdownCodeContent({
  text,
  syntaxTheme,
  compact = false,
}: {
  text: string
  syntaxTheme: Record<string, CSSProperties>
  compact?: boolean
}) {
  return (
    <span className={compact ? 'multiple-choice-markdown compact' : 'multiple-choice-markdown'}>
      {parseMarkdownCodeSegments(text).map((segment, index) => {
        if (segment.type === 'code') {
          return (
            <span key={index} className="multiple-choice-code-text-block">
              <SyntaxHighlighter
                language={segment.language}
                style={syntaxTheme}
                PreTag="span"
                CodeTag="span"
                customStyle={{
                  margin: 0,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  display: 'block',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  lineHeight: 'inherit',
                  whiteSpace: 'pre-wrap',
                }}
                codeTagProps={{
                  style: {
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    lineHeight: 'inherit',
                    whiteSpace: 'pre-wrap',
                  },
                }}
              >
                {normalizePythonCodeForDisplay(segment.code, segment.language)}
              </SyntaxHighlighter>
            </span>
          )
        }

        return (
          <span key={index} className="multiple-choice-text-block">
            {renderInlineMarkdownText(segment.text)}
          </span>
        )
      })}
    </span>
  )
}

function App() {
  const { theme } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const questionType = 'skill-map' as const
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('recall')
  const [multipleChoiceDifficulty, setMultipleChoiceDifficulty] = useState<MultipleChoiceDifficulty>('Med.')
  const [multipleChoiceQuestionCount, setMultipleChoiceQuestionCount] = useState(DEFAULT_MULTIPLE_CHOICE_COUNT)
  const [enabledTemplateModes, setEnabledTemplateModes] = useState<TemplateMode[]>(() => [...DEFAULT_TEMPLATE_MODES])
  const [supportLayer, setSupportLayer] = useState<SupportLayer>('none')
  const [skillMapDeck, setSkillMapDeck] = useState<Flashcard[]>([])
  const [skillMapLoading, setSkillMapLoading] = useState(false)
  const [skillMapError, setSkillMapError] = useState('')
  const [skillMapRefreshToken, setSkillMapRefreshToken] = useState(0)
  const [skillMapSessionVersion, setSkillMapSessionVersion] = useState(0)
  const [multipleChoiceDeck, setMultipleChoiceDeck] = useState<MultipleChoiceCard[]>([])
  const [multipleChoiceLoading, setMultipleChoiceLoading] = useState(false)
  const [multipleChoiceError, setMultipleChoiceError] = useState('')
  const [multipleChoiceRefreshToken, setMultipleChoiceRefreshToken] = useState(0)
  const [multipleChoiceSessionVersion, setMultipleChoiceSessionVersion] = useState(0)
  const [flowMode] = useState<FlowMode>('sequential')
  const [recallTargetMode, setRecallTargetMode] = useState<RecallTargetMode>('algorithm')
  const [adaptiveVariationLoading, setAdaptiveVariationLoading] = useState(false)
  const [adaptiveVariationError, setAdaptiveVariationError] = useState('')
  const [adaptiveVariationNote, setAdaptiveVariationNote] = useState('')
  const [sequentialVariationLoading, setSequentialVariationLoading] = useState(false)
  const [sequentialVariationError, setSequentialVariationError] = useState('')
  const [sequentialVariationNote, setSequentialVariationNote] = useState('')
  const [inlineEnabled, setInlineEnabled] = useState(false)
  const [inlineLens, setInlineLens] = useState<InlineLens>('pattern')
  const [plainEnglishPromptOpen, setPlainEnglishPromptOpen] = useState(false)
  const [promptToggleDetail, setPromptToggleDetail] = useState<PromptToggleExplanationResponse | null>(null)
  const [plainEnglishPromptLoading, setPlainEnglishPromptLoading] = useState(false)
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const tagsListRef = useRef<HTMLDivElement | null>(null)
  const [tagsListHeight, setTagsListHeight] = useState(0)
  const [relatedDrawerOpen, setRelatedDrawerOpen] = useState(false)

  const [sessionOrder, setSessionOrder] = useState<number[]>([])
  const [sessionPosition, setSessionPosition] = useState(0)
  const [sessionFinished, setSessionFinished] = useState(false)
  const [sessionResults, setSessionResults] = useState<Record<string, boolean>>({})
  const [sessionAccuracyByCard, setSessionAccuracyByCard] = useState<Record<string, number>>({})
  const [sessionElapsedByCard, setSessionElapsedByCard] = useState<Record<string, number>>({})
  const [sessionPlanRequested, setSessionPlanRequested] = useState(false)
  const llmProvider: LlmProviderSelection = 'auto'
  const configuredProviderLabel = useConfiguredProviderLabel()
  const requestLlmProvider = llmProvider === 'auto' ? '' : llmProvider

  const [liveCoachUsedThisAttempt, setLiveCoachUsedThisAttempt] = useState(false)

  const [mainPhase, setMainPhase] = useState<'preview' | 'typing' | 'submitted'>('preview')
  const [mainInput, setMainInput] = useState('')
  const [mainStartedAt, setMainStartedAt] = useState<number | null>(null)
  const [mainCloseEnough, setMainCloseEnough] = useState(false)
  const [multipleChoiceSelectedChoiceId, setMultipleChoiceSelectedChoiceId] = useState('')
  const [multipleChoiceStartedAt, setMultipleChoiceStartedAt] = useState<number | null>(null)
  const [multipleChoiceSubmittedByCard, setMultipleChoiceSubmittedByCard] = useState<Record<string, string>>({})
  const [currentInteractionId, setCurrentInteractionId] = useState('')
  const [mainRecallHistoryByCard, setMainRecallHistoryByCard] = useState<Record<string, RecallAttemptSnapshot[]>>({})
  const [liveCoachFeedback, setLiveCoachFeedback] = useState<CoachAttemptFeedback | null>(null)
  const [, setLiveCoachLoading] = useState(false)
  const [liveCoachError, setLiveCoachError] = useState('')
  const [liveCoachTuning, setLiveCoachTuning] = useState(() => loadStoredLiveCoachTuning())
  const [submissionTuning] = useState(() => loadStoredSubmissionTuning())
  const syntaxTheme = theme === 'light-high-contrast' ? vs : vscDarkPlus
  const liveCoachFrequencyProfile = useMemo(
    () => getLiveCoachFrequencyProfile(liveCoachTuning.feedbackFrequency),
    [liveCoachTuning]
  )
  const [coachFeedback, setCoachFeedback] = useState<CoachAttemptFeedback | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState('')
  const [submissionFailureModal, setSubmissionFailureModal] = useState<SubmissionFailureModalState | null>(null)
  const [sessionPlan, setSessionPlan] = useState<CoachSessionPlan | null>(null)
  const [sessionPlanLoading, setSessionPlanLoading] = useState(false)
  const [sessionPlanError, setSessionPlanError] = useState('')
  const mainInputRef = useRef<HTMLTextAreaElement | null>(null)
  const shouldFocusMainInputRef = useRef(false)
  const mainHighlightRef = useRef<HTMLDivElement | null>(null)
  const mainGhostRef = useRef<HTMLDivElement | null>(null)
  const previewCodeContainerRef = useRef<HTMLDivElement | null>(null)
  const [recallMinHeight, setRecallMinHeight] = useState<number | undefined>(undefined)
  const mainGutterRef = useRef<HTMLDivElement | null>(null)
  const currentCardIdRef = useRef('')
  const liveCoachRequestVersionRef = useRef(0)
  const liveCoachSnapshotRef = useRef<LiveCoachSnapshot | null>(null)
  const lastLiveCoachDecisionKeyRef = useRef('')
  const lastMainInputEditAtRef = useRef(0)
  const promptToggleExplanationRequestVersionRef = useRef(0)
  const coachRequestVersionRef = useRef(0)
  const skillMapDeckRequestVersionRef = useRef(0)
  const multipleChoiceDeckRequestVersionRef = useRef(0)
  const adaptiveVariationRequestKeyRef = useRef('')
  const sequentialVariationRequestKeyRef = useRef('')
  const focusedPatternSlug = searchParams.get('focusPattern')?.trim() || ''
  const focusedTagSlug = searchParams.get('focusTag')?.trim() || ''
  const focusedModeParam = searchParams.get('focusMode')?.trim() || ''
  const requestedPlaylistSlug = searchParams.get('playlist')?.trim() || ''
  const focusedMethodParams = searchParams.getAll('focusMethod').map((method) => method.trim()).filter(Boolean)
  const requestedPlaylist = useMemo(
    () => practicePlaylists.find((playlist) => playlist.slug === requestedPlaylistSlug) ?? null,
    [requestedPlaylistSlug]
  )
  const focusedPatternNode = useMemo(
    () => skillMap.find((node) => patternToSlug(node.pattern) === focusedPatternSlug) ?? null,
    [focusedPatternSlug]
  )
  const focusedTemplateMode = useMemo<TemplateMode | null>(() => {
    if (TEMPLATE_MODE_ORDER.includes(focusedModeParam as TemplateMode)) {
      return focusedModeParam as TemplateMode
    }
    return null
  }, [focusedModeParam])
  const requestedSkillMap = useMemo<SkillMapNode[]>(() => {
    if (requestedPlaylist) return playlistQuestionsToSkillMap(requestedPlaylist)
    if (!focusedPatternNode) return skillMap
    const focusedMethodSet = new Set(focusedMethodParams)
    const focusedMethods = focusedMethodSet.size > 0
      ? focusedPatternNode.methods.filter((method) => focusedMethodSet.has(method))
      : focusedPatternNode.methods
    const requestedMethods = focusedMethods.length > 0 ? focusedMethods : focusedPatternNode.methods
    return requestedMethods.map((method) => ({
      pattern: focusedPatternNode.pattern,
      methods: [method],
    }))
  }, [focusedMethodParams, focusedPatternNode, requestedPlaylist])
  const requestedSkillMapSignature = useMemo(
    () => JSON.stringify(requestedSkillMap),
    [requestedSkillMap]
  )
  const multipleChoiceSkillMap = useMemo<SkillMapNode[]>(() => {
    if (requestedPlaylist) {
      return playlistQuestionsToSkillMap(requestedPlaylist)
    }
    if (focusedPatternNode) {
      // Anchored launch from dashboard — respect selected methods
      const focusedMethodSet = new Set(focusedMethodParams)
      const filteredMethods = focusedMethodSet.size > 0
        ? focusedPatternNode.methods.filter((method) => focusedMethodSet.has(method))
        : focusedPatternNode.methods
      const methods = filteredMethods.length > 0 ? filteredMethods : focusedPatternNode.methods
      return [{ pattern: focusedPatternNode.pattern, methods }]
    }
    return MCQ_CORE_ALGORITHM_ANCHORS
  }, [focusedMethodParams, focusedPatternNode, requestedPlaylist])
  const multipleChoiceSkillMapSignature = useMemo(
    () => JSON.stringify(multipleChoiceSkillMap),
    [multipleChoiceSkillMap]
  )
  const requestedTemplateMode = focusedTemplateMode ?? DEFAULT_TEMPLATE_MODES[0]
  const requestedTemplateTargets = useMemo(() => {
    const targets: Record<string, Partial<Record<TemplateMode, string>>> = {}
    requestedSkillMap.forEach((node) => {
      const patternSlug = patternToSlug(node.pattern)
      targets[patternSlug] = {}
    })
    return targets
  }, [requestedSkillMap])
  const requestedQuestionType = requestedPlaylist
    ? `playlist:${requestedPlaylist.slug}`
    : focusedTagSlug
      ? `tag:${focusedTagSlug}`
    : focusedPatternSlug
      ? 'skill-map-core-algorithm'
      : questionType
  const focusedPatternLabel = focusedPatternNode?.pattern ?? patternLabelFromSlug(focusedPatternSlug)
  const filteredDeck = useMemo(() => skillMapDeck, [skillMapDeck])
  const activeTemplateModes = useMemo(() => ensureTemplateModes(enabledTemplateModes), [enabledTemplateModes])
  const currentTemplateMode: TemplateMode = 'algorithm'

  useEffect(() => {
    if (focusedTemplateMode) {
      setEnabledTemplateModes([focusedTemplateMode])
      return
    }
    setEnabledTemplateModes([...DEFAULT_TEMPLATE_MODES])
  }, [focusedTemplateMode])

  const fetchSkillMapDeck = async () => {
    skillMapDeckRequestVersionRef.current += 1
    const requestVersion = skillMapDeckRequestVersionRef.current
    setSkillMapLoading(true)
    setSkillMapError('')
    setSkillMapDeck([])

    const requestBody = {
      questionType: requestedQuestionType,
      count: requestedSkillMap.length,
      skillMap: requestedSkillMap,
      templateMode: requestedTemplateMode,
      templateTargets: requestedTemplateTargets,
      specimenTuning: loadStoredSpecimenTuning(),
      llmProvider: requestLlmProvider,
    }

    try {
      if (focusedTagSlug && !requestedPlaylist) {
        const payload = await requestCoreAlgorithmDrillsByTag(focusedTagSlug, 10)
        if (skillMapDeckRequestVersionRef.current !== requestVersion) return
        setSkillMapDeck(payload.drills)
        setSkillMapSessionVersion((prev) => prev + 1)
        return
      }

      if (focusedPatternSlug && !requestedPlaylist) {
        const payload = await requestCoreAlgorithmDrills(focusedPatternSlug)
        if (skillMapDeckRequestVersionRef.current !== requestVersion) return
        setSkillMapDeck(payload.drills)
        setSkillMapSessionVersion((prev) => prev + 1)
        return
      }

      if (!requestedPlaylist) {
        const payload = await requestRandomCoreAlgorithmDrills(10)
        if (skillMapDeckRequestVersionRef.current !== requestVersion) return
        setSkillMapDeck(payload.drills)
        setSkillMapSessionVersion((prev) => prev + 1)
        return
      }

      const result = await requestSkillMapDrillsStream(
        requestBody,
        (drill) => {
          if (skillMapDeckRequestVersionRef.current !== requestVersion) return
          setSkillMapDeck((prev) => [...prev, drill])
        },
      )
      if (skillMapDeckRequestVersionRef.current !== requestVersion) return
      setSkillMapDeck(result.drills)
      setSkillMapSessionVersion((prev) => prev + 1)
    } catch {
      // Fallback to non-streaming endpoint
      try {
        const payload = await requestSkillMapDrills(requestBody)
        if (skillMapDeckRequestVersionRef.current !== requestVersion) return
        setSkillMapDeck(payload.drills)
        setSkillMapSessionVersion((prev) => prev + 1)
      } catch (error) {
        if (skillMapDeckRequestVersionRef.current !== requestVersion) return
        setSkillMapDeck([])
        setSkillMapSessionVersion((prev) => prev + 1)
        setSkillMapError(
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : 'Skill map drill generation is unavailable right now.'
        )
      }
    } finally {
      if (skillMapDeckRequestVersionRef.current === requestVersion) {
        setSkillMapLoading(false)
      }
    }
  }

  const fetchMultipleChoiceDeck = async () => {
    multipleChoiceDeckRequestVersionRef.current += 1
    const requestVersion = multipleChoiceDeckRequestVersionRef.current
    setMultipleChoiceLoading(true)
    setMultipleChoiceError('')
    setMultipleChoiceDeck([])

    const requestBody: MultipleChoiceDrillsRequest = {
      questionType: 'skill-map-mcq',
      count: multipleChoiceQuestionCount,
      skillMap: multipleChoiceSkillMap,
      difficulty: multipleChoiceDifficulty,
      llmProvider: requestLlmProvider,
    }

    try {
      const payload = await requestMultipleChoiceDrills(requestBody)
      if (multipleChoiceDeckRequestVersionRef.current !== requestVersion) return
      setMultipleChoiceDeck(payload.drills)
      setMultipleChoiceSessionVersion((prev) => prev + 1)
    } catch (error) {
      if (multipleChoiceDeckRequestVersionRef.current !== requestVersion) return
      setMultipleChoiceDeck([])
      setMultipleChoiceSessionVersion((prev) => prev + 1)
      setMultipleChoiceError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Multiple choice generation is unavailable right now.'
      )
    } finally {
      if (multipleChoiceDeckRequestVersionRef.current === requestVersion) {
        setMultipleChoiceLoading(false)
      }
    }
  }

  const startSession = (deckLength: number) => {
    setSessionOrder(Array.from({ length: deckLength }, (_, idx) => idx))
    setSessionPosition(0)
    setSessionFinished(false)
    setSessionResults({})
    setSessionAccuracyByCard({})
    setSessionElapsedByCard({})
    setSessionPlanRequested(false)

    setMainPhase('preview')
    setRecallMinHeight(undefined)
    setMainInput('')
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setMultipleChoiceSelectedChoiceId('')
    setMultipleChoiceStartedAt(Date.now())
    setMultipleChoiceSubmittedByCard({})
    setCurrentInteractionId('')
    setMainRecallHistoryByCard({})
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    liveCoachRequestVersionRef.current = 0
    liveCoachSnapshotRef.current = null
    lastLiveCoachDecisionKeyRef.current = ''
    lastMainInputEditAtRef.current = 0
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSubmissionFailureModal(null)
    setSessionPlan(null)
    setSessionPlanLoading(false)
    setSessionPlanError('')
    clearQueuedFlowState()
  }

  useEffect(() => {
    void fetchSkillMapDeck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedPatternSlug, focusedTagSlug, llmProvider, requestLlmProvider, requestedQuestionType, requestedSkillMapSignature, requestedTemplateMode, skillMapRefreshToken])

  useEffect(() => {
    if (practiceMode !== 'multiple-choice') return
    void fetchMultipleChoiceDeck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceMode, llmProvider, requestedQuestionType, multipleChoiceSkillMapSignature, multipleChoiceDifficulty, multipleChoiceQuestionCount, multipleChoiceRefreshToken])

  useEffect(() => {
    saveStoredLiveCoachTuning(liveCoachTuning)
  }, [liveCoachTuning])

  useEffect(() => {
    if (practiceMode !== 'recall') return
    if (skillMapLoading) return
    startSession(filteredDeck.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceMode, skillMapSessionVersion, skillMapLoading])

  useEffect(() => {
    if (practiceMode !== 'multiple-choice') return
    if (multipleChoiceLoading) return
    startSession(multipleChoiceDeck.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceMode, multipleChoiceSessionVersion, multipleChoiceLoading])

  const currentDeckIndex = sessionOrder[sessionPosition] ?? 0
  const card = filteredDeck[currentDeckIndex] ?? filteredDeck[0] ?? emptySkillMapCard
  const multipleChoiceCard = multipleChoiceDeck[currentDeckIndex] ?? multipleChoiceDeck[0] ?? null
  const activeCardId = practiceMode === 'multiple-choice' ? multipleChoiceCard?.id ?? '' : card.id
  const activeCardTitle = practiceMode === 'multiple-choice' ? multipleChoiceCard?.title ?? 'Multiple Choice' : card.title
  const activeCardDifficulty = practiceMode === 'multiple-choice' ? multipleChoiceCard?.difficulty ?? multipleChoiceDifficulty : card.difficulty
  const activeCardDifficultyLabel = activeCardDifficulty === 'Med.' ? 'Medium' : activeCardDifficulty
  const activeCardTags = practiceMode === 'multiple-choice' ? multipleChoiceCard?.tags ?? [] : card.tags
  const isCoreAlgorithmCard = activeCardTags.includes('core-algorithm')
  const isMetaCard = activeCardTags.includes('core-meta') || activeCardTags.includes('meta')
  const primaryPatternTag = useMemo(() => getPrimaryPatternTag(card.tags), [card.tags])
  const fullSolutionTarget = useMemo(
    () => normalizeTyping(card.solution.replace('{{missing}}', card.missing)),
    [card.missing, card.solution]
  )
  const algorithmPracticeTarget = useMemo(() => {
    const generatedTarget = card.templateTargets?.algorithm?.trim()
    if (generatedTarget) {
      const resolvedTarget = generatedTarget.replace('{{missing}}', card.missing)
      return normalizeTyping(resolvedTarget)
    }
    return fullSolutionTarget
  }, [card.missing, card.templateTargets, fullSolutionTarget])
  const coreShapePracticeTarget = useMemo(() => {
    const generatedTarget = card.templateTargets?.coreShape?.trim()
    if (generatedTarget) {
      return normalizeTyping(generatedTarget.replace('{{missing}}', card.missing))
    }
    return normalizeTyping(buildCoreShapeTemplate(primaryPatternTag, algorithmPracticeTarget))
  }, [algorithmPracticeTarget, card.missing, card.templateTargets, primaryPatternTag])
  const selectedPracticeBaseTarget = recallTargetMode === 'coreShape' ? coreShapePracticeTarget : algorithmPracticeTarget
  const inlinePracticeTarget = useMemo(() => {
    const generatedTarget = recallTargetMode === 'algorithm' ? card.templateTargets?.inline?.trim() : ''
    if (generatedTarget && recallTargetMode === 'algorithm') {
      const cleanGeneratedTarget = stripInlineAnnotationNotes(generatedTarget.replace('{{missing}}', card.missing))
      return normalizeInlineTemplateTarget(cleanGeneratedTarget, primaryPatternTag, inlineLens)
    }
    return normalizeInlineTemplateTarget(selectedPracticeBaseTarget, primaryPatternTag, inlineLens)
  }, [card.missing, card.templateTargets, inlineLens, primaryPatternTag, recallTargetMode, selectedPracticeBaseTarget])
  const plainPracticeTarget = useMemo(
    () => normalizeTyping(stripHashAnnotationComments(stripInlineAnnotationNotes(selectedPracticeBaseTarget))),
    [selectedPracticeBaseTarget]
  )
  const practiceTarget = inlineEnabled ? inlinePracticeTarget : plainPracticeTarget
  const generatedPracticePrompt =
    (recallTargetMode === 'coreShape' ? card.templatePrompts?.coreShape?.trim() : card.templatePrompts?.algorithm?.trim())
    || card.prompt.trim()
  const practicePrompt = useMemo(
    () => generatedPracticePrompt || buildPracticePrompt(currentTemplateMode, primaryPatternTag),
    [currentTemplateMode, generatedPracticePrompt, primaryPatternTag]
  )
  const fallbackPlainEnglishPromptDetail = useMemo(
    () => card.plainEnglishPromptDetail ?? getPlainEnglishPromptDetail(practicePrompt, card.tags, card.title, plainPracticeTarget),
    [card.plainEnglishPromptDetail, card.tags, card.title, plainPracticeTarget, practicePrompt]
  )
  const isPlainEnglishPromptOpen = plainEnglishPromptOpen
  const plainEnglishPromptDetailId = `plain-english-prompt-${card.id}`
  const promptToggleRequestKey = `${card.id}:${practicePrompt}:${practiceTarget}:${requestLlmProvider}`
  const tagsListId = `card-tags-${card.id}`

  const fetchPlainEnglishPromptExplanation = async () => {
    const requestCardId = card.id
    promptToggleExplanationRequestVersionRef.current += 1
    const requestVersion = promptToggleExplanationRequestVersionRef.current
    setPlainEnglishPromptLoading(true)

    try {
      const payload = await requestPromptToggleExplanation({
        cardId: requestCardId,
        cardTitle: card.title,
        prompt: practicePrompt,
        target: practiceTarget,
        tags: card.tags,
        llmProvider: requestLlmProvider,
      })
      if (currentCardIdRef.current !== requestCardId || promptToggleExplanationRequestVersionRef.current !== requestVersion) return
      setPromptToggleDetail(payload)
    } catch {
      if (currentCardIdRef.current !== requestCardId || promptToggleExplanationRequestVersionRef.current !== requestVersion) return
      setPromptToggleDetail({
        plainEnglish: fallbackPlainEnglishPromptDetail.plainEnglish,
        inputExample: fallbackPlainEnglishPromptDetail.inputExample,
        outputExample: fallbackPlainEnglishPromptDetail.outputExample,
        llmUsed: false,
      })
    } finally {
      if (currentCardIdRef.current === requestCardId && promptToggleExplanationRequestVersionRef.current === requestVersion) {
        setPlainEnglishPromptLoading(false)
      }
    }
  }

  const requestPlainEnglishPromptExplanation = useEffectEvent(fetchPlainEnglishPromptExplanation)

  useEffect(() => {
    setPromptToggleDetail(null)
    setPlainEnglishPromptLoading(false)
    promptToggleExplanationRequestVersionRef.current = 0
  }, [promptToggleRequestKey])

  const currentQuestionType = `${requestedQuestionType}:${recallTargetMode}${inlineEnabled ? `:${inlineLens}` : ''}`
  const currentMultipleChoiceQuestionType = 'skill-map-mcq'
  const currentSkillTags = useMemo(
    () => [
      ...card.tags,
      `template-${currentTemplateMode}`,
      `target-${recallTargetMode}`,
      ...(inlineEnabled ? [`inline-${inlineLens}`] : []),
    ],
    [card.tags, currentTemplateMode, inlineEnabled, inlineLens, recallTargetMode]
  )
  const currentRecallHistoryKey = `${card.id}:${currentTemplateMode}:${recallTargetMode}:${inlineEnabled ? inlineLens : 'plain'}`
  const currentMultipleChoiceSkillTags = useMemo(
    () => [
      ...(multipleChoiceCard?.tags ?? []),
      'mode-multiple-choice',
      `difficulty-${multipleChoiceDifficulty === 'Hard' ? 'hard' : 'med'}`,
    ],
    [multipleChoiceCard?.tags, multipleChoiceDifficulty]
  )
  const visibleCardTags = useMemo(
    () => activeCardTags.filter((tag) => tag !== 'skill-map' && tag !== 'skill-map-mcq'),
    [activeCardTags]
  )

  useLayoutEffect(() => {
    const element = tagsListRef.current
    if (!element) return

    const updateTagsListHeight = () => {
      setTagsListHeight(tagsExpanded ? element.scrollHeight : 0)
    }

    updateTagsListHeight()
    if (!tagsExpanded || typeof ResizeObserver === 'undefined') return

    const resizeObserver = new ResizeObserver(updateTagsListHeight)
    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [tagsExpanded, visibleCardTags.length])

  currentCardIdRef.current = activeCardId

  const handleTagClick = (tag: string) => {
    setPracticeMode('recall')
    setTagsExpanded(false)
    setSearchParams(tag === focusedTagSlug ? {} : { focusTag: tag })
  }

  const hasRecallDeck = filteredDeck.length > 0
  const hasMultipleChoiceDeck = multipleChoiceDeck.length > 0
  const hasDeck = practiceMode === 'multiple-choice' ? hasMultipleChoiceDeck : hasRecallDeck
  const activeLoading = practiceMode === 'multiple-choice' ? multipleChoiceLoading : skillMapLoading
  const activeError = practiceMode === 'multiple-choice' ? multipleChoiceError : skillMapError
  const isGhostRepsEnabled = supportLayer === 'ghost-reps'
  const hasAnsweredCurrent = Boolean(activeCardId && Object.prototype.hasOwnProperty.call(sessionResults, activeCardId))
  const sessionCounterText =
    sessionOrder.length === 0
      ? '0 / 0'
      : `${Math.min(sessionPosition + 1, Math.max(sessionOrder.length, 1))} / ${sessionOrder.length}`
  const practiceHistoryHref = useMemo(() => {
    if (!hasDeck) return '/practice-history'

    if (practiceMode === 'multiple-choice' && multipleChoiceCard) {
      const searchParams = new URLSearchParams({
        cardId: multipleChoiceCard.id,
        cardTitle: multipleChoiceCard.title,
        questionType: currentMultipleChoiceQuestionType,
      })

      currentMultipleChoiceSkillTags.forEach((tag) => {
        searchParams.append('tag', tag)
      })

      return `/practice-history?${searchParams.toString()}`
    }

    const searchParams = new URLSearchParams({
      cardId: card.id,
      cardTitle: card.title,
      questionType: currentQuestionType,
    })

    currentSkillTags.forEach((tag) => {
      searchParams.append('tag', tag)
    })

    return `/practice-history?${searchParams.toString()}`
  }, [
    card.id,
    card.title,
    currentMultipleChoiceQuestionType,
    currentMultipleChoiceSkillTags,
    currentQuestionType,
    currentSkillTags,
    hasDeck,
    multipleChoiceCard,
    practiceMode,
  ])
  const currentTemplateLabel = TEMPLATE_MODE_LABELS[currentTemplateMode]
  const activeRecallLabel = recallTargetMode === 'coreShape' ? 'Core shape' : currentTemplateLabel
  const practiceLanguage = 'python'
  const shouldHighlightInlineDecision = inlineEnabled
  const practiceInputLabel = inlineEnabled
    ? `Type the ${activeRecallLabel.toLowerCase()} with inline notes from memory`
    : recallTargetMode === 'coreShape'
      ? 'Type the core shape from memory'
      : 'Type the full algorithm from memory'
  const supportedPracticeInputLabel = isGhostRepsEnabled
    ? `${practiceInputLabel} with Ghost Reps`
    : practiceInputLabel
  const practicePlaceholder = inlineEnabled
    ? `Type the ${activeRecallLabel.toLowerCase()}, decisions, and inline notes from memory...`
    : recallTargetMode === 'coreShape'
      ? 'Type the reusable skeleton from memory...'
      : 'Type the full algorithm from memory...'
  const supportedPracticePlaceholder = isGhostRepsEnabled
    ? `Trace the faint ${activeRecallLabel.toLowerCase()} target here...`
    : practicePlaceholder
  const startRecallLabel = inlineEnabled ? `Hide ${activeRecallLabel.toLowerCase()} notes and start recall` : 'Start'
  const supportedStartRecallLabel = isGhostRepsEnabled
    ? `Start Ghost Reps for ${activeRecallLabel}`
    : startRecallLabel
  const queuedFlowLoading = flowMode === 'adaptive' ? adaptiveVariationLoading : sequentialVariationLoading
  const queuedFlowNote = flowMode === 'adaptive' ? adaptiveVariationNote : sequentialVariationNote
  const queuedFlowError = flowMode === 'adaptive' ? adaptiveVariationError : sequentialVariationError
  const queuedFlowLoadingMessage =
    flowMode === 'adaptive'
      ? 'Building a targeted repair variation...'
      : 'Building the next sequential step...'
  const relatedLeetCodeSet = useMemo(
    () => practiceMode === 'recall'
      ? resolveRelatedLeetCodeSet({
          patternTag: primaryPatternTag,
          title: card.title,
          prompt: practicePrompt,
          target: practiceTarget,
          tags: card.tags,
          focusedMethods: focusedMethodParams,
        })
      : null,
    [card.tags, card.title, focusedMethodParams, practiceMode, practicePrompt, practiceTarget, primaryPatternTag]
  )

  useEffect(() => {
    setRelatedDrawerOpen(false)
  }, [card.id, currentTemplateMode, relatedLeetCodeSet?.heading])

  const completeCardInSession = (isCorrect: boolean, accuracy: number, elapsedMs?: number) => {
    if (!activeCardId) return
    setSessionResults((prevResults) => {
      const next = { ...prevResults, [activeCardId]: isCorrect }
      if (Object.keys(next).length >= sessionOrder.length) {
        setSessionFinished(true)
      }
      return next
    })
    setSessionAccuracyByCard((prev) => ({ ...prev, [activeCardId]: accuracy }))
    if (elapsedMs !== undefined) {
      setSessionElapsedByCard((prev) => ({ ...prev, [activeCardId]: elapsedMs }))
    }
  }

  const submitAttemptToServer = async (payload: AttemptPayload) => {
    try {
      await fetch(apiUrl('/api/attempts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          cardTitle: card.title,
          question: practicePrompt,
          questionType: currentQuestionType,
          categoryTags: currentSkillTags,
          correctAnswer: payload.correctAnswer,
          userAnswer: payload.userAnswer,
          mode: payload.mode,
          correct: payload.correct,
          accuracy: payload.accuracy,
          exact: payload.exact,
          elapsedMs: payload.elapsedMs,
          interactionId: payload.interactionId,
          generatedCardId: card.id,
          generatedCard: { ...card, prompt: practicePrompt },
          templateMode: payload.templateMode,
          supportLayer: payload.supportLayer,
          liveCoachUsed: payload.liveCoachUsed,
          coachFeedback: payload.coachFeedback ?? null,
          submissionRubric: payload.submissionRubric ?? null,
        }),
      })
    } catch {
      // silently fail
    }
  }

  const submitMultipleChoiceAttemptToServer = async (payload: {
    interactionId: string
    selectedChoice: MultipleChoiceChoice
    correctChoice: MultipleChoiceChoice
    correct: boolean
    elapsedMs: number
  }) => {
    if (!multipleChoiceCard) return
    try {
      await fetch(apiUrl('/api/attempts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: multipleChoiceCard.id,
          cardTitle: multipleChoiceCard.title,
          question: multipleChoiceCard.question,
          questionType: currentMultipleChoiceQuestionType,
          categoryTags: currentMultipleChoiceSkillTags,
          correctAnswer: `${payload.correctChoice.id}. ${payload.correctChoice.text}`,
          userAnswer: `${payload.selectedChoice.id}. ${payload.selectedChoice.text}`,
          mode: 'main-recall',
          correct: payload.correct,
          accuracy: payload.correct ? 100 : 0,
          exact: payload.correct,
          elapsedMs: payload.elapsedMs,
          interactionId: payload.interactionId,
          generatedCardId: multipleChoiceCard.id,
          generatedCard: {
            ...multipleChoiceCard,
            cardMode: 'multiple-choice',
            prompt: multipleChoiceCard.question,
          },
          templateMode: 'algorithm',
          supportLayer: 'none',
          liveCoachUsed: false,
          coachFeedback: null,
          submissionRubric: null,
        }),
      })
    } catch {
      // silently fail
    }
  }

  const evaluateSubmittedRecall = async (expectedAnswer: string, userAnswer: string) => {
    try {
      const response = await fetch(apiUrl('/api/coach/evaluate-attempt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedAnswer,
          userAnswer,
          skillTags: currentSkillTags,
          templateMode: currentTemplateMode,
          submissionTuning,
        }),
      })
      if (!response.ok) throw new Error('Unable to evaluate attempt')
      return (await response.json()) as AttemptEvaluationResponse
    } catch {
      return {
        accuracy: estimateTemplateAccuracy(expectedAnswer, userAnswer),
        sound: userAnswer === expectedAnswer,
        syntaxValid: userAnswer.trim().length > 0,
      }
    }
  }

  const enqueueGeneratedFollowup = (drill: Flashcard) => {
    if (skillMapDeck.some((item) => item.id === drill.id)) return
    const nextDeckIndex = skillMapDeck.length
    setSkillMapDeck((prevDeck) => {
      if (prevDeck.some((item) => item.id === drill.id)) return prevDeck
      return [...prevDeck, drill]
    })
    setSessionOrder((prevOrder) => {
      if (prevOrder.includes(nextDeckIndex)) return prevOrder
      return [
        ...prevOrder.slice(0, sessionPosition + 1),
        nextDeckIndex,
        ...prevOrder.slice(sessionPosition + 1),
      ]
    })
  }

  const requestAdaptiveVariation = async (payload: {
    interactionId: string
    expectedAnswer: string
    userAnswer: string
    submissionRubric: Record<string, unknown>
  }) => {
    const requestKey = `${card.id}:${currentTemplateMode}:${payload.interactionId}`
    if (adaptiveVariationRequestKeyRef.current === requestKey) return
    adaptiveVariationRequestKeyRef.current = requestKey
    setAdaptiveVariationLoading(true)
    setAdaptiveVariationError('')
    setAdaptiveVariationNote('')

    try {
      const response = await fetch(apiUrl('/api/coach/adaptive-variation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          cardTitle: card.title,
          prompt: practicePrompt,
          expectedAnswer: payload.expectedAnswer,
          userAnswer: payload.userAnswer,
          templateMode: currentTemplateMode,
          skillTags: currentSkillTags,
          submissionRubric: payload.submissionRubric,
          specimenTuning: loadStoredSpecimenTuning(),
          llmProvider: requestLlmProvider,
        }),
      })
      if (!response.ok) throw new Error('Unable to generate adaptive variation')
      const variation = (await response.json()) as AdaptiveVariationResponse
      if (adaptiveVariationRequestKeyRef.current !== requestKey || currentCardIdRef.current !== card.id) return
      enqueueGeneratedFollowup(variation.drill)
      setAdaptiveVariationNote(variation.variationReason || 'Targeted repair variation queued next.')
    } catch {
      if (adaptiveVariationRequestKeyRef.current !== requestKey || currentCardIdRef.current !== card.id) return
      setAdaptiveVariationError('Targeted variation unavailable right now.')
    } finally {
      if (adaptiveVariationRequestKeyRef.current === requestKey && currentCardIdRef.current === card.id) {
        setAdaptiveVariationLoading(false)
      }
    }
  }

  const requestSequentialVariation = async (payload: {
    interactionId: string
    expectedAnswer: string
  }) => {
    const requestKey = `${card.id}:${currentTemplateMode}:${payload.interactionId}`
    if (sequentialVariationRequestKeyRef.current === requestKey) return
    sequentialVariationRequestKeyRef.current = requestKey
    setSequentialVariationLoading(true)
    setSequentialVariationError('')
    setSequentialVariationNote('')

    try {
      const response = await fetch(apiUrl('/api/coach/sequential-variation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          cardTitle: card.title,
          prompt: practicePrompt,
          expectedAnswer: payload.expectedAnswer,
          templateMode: currentTemplateMode,
          skillTags: currentSkillTags,
          specimenTuning: loadStoredSpecimenTuning(),
          llmProvider: requestLlmProvider,
        }),
      })
      if (!response.ok) throw new Error('Unable to generate sequential variation')
      const variation = (await response.json()) as SequentialVariationResponse
      if (sequentialVariationRequestKeyRef.current !== requestKey || currentCardIdRef.current !== card.id) return
      enqueueGeneratedFollowup(variation.drill)
      setSequentialVariationNote(variation.progressionReason || 'Smallest next-step variation queued next.')
    } catch {
      if (sequentialVariationRequestKeyRef.current !== requestKey || currentCardIdRef.current !== card.id) return
      setSequentialVariationError('Sequential next step unavailable right now.')
    } finally {
      if (sequentialVariationRequestKeyRef.current === requestKey && currentCardIdRef.current === card.id) {
        setSequentialVariationLoading(false)
      }
    }
  }

  const clearQueuedFlowState = () => {
    setAdaptiveVariationLoading(false)
    setAdaptiveVariationError('')
    setAdaptiveVariationNote('')
    setSequentialVariationLoading(false)
    setSequentialVariationError('')
    setSequentialVariationNote('')
    adaptiveVariationRequestKeyRef.current = ''
    sequentialVariationRequestKeyRef.current = ''
  }

  const resetPerCardInteraction = () => {
    setMainPhase('preview')
    setRecallMinHeight(undefined)
    setMainInput('')
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setMultipleChoiceSelectedChoiceId('')
    setMultipleChoiceStartedAt(Date.now())
    setCurrentInteractionId('')
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setLiveCoachUsedThisAttempt(false)
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSubmissionFailureModal(null)
    setPlainEnglishPromptOpen(false)
    setPromptToggleDetail(null)
    setPlainEnglishPromptLoading(false)
    setTagsExpanded(false)
    promptToggleExplanationRequestVersionRef.current = 0
    liveCoachRequestVersionRef.current = 0
    liveCoachSnapshotRef.current = null
    lastLiveCoachDecisionKeyRef.current = ''
    lastMainInputEditAtRef.current = 0
    clearQueuedFlowState()
  }

  const toggleInlineHelper = () => {
    setInlineEnabled((prev) => !prev)
    if (mainPhase !== 'preview') {
      resetPerCardInteraction()
    }
  }

  const selectRecallTargetMode = (nextMode: RecallTargetMode) => {
    if (recallTargetMode === nextMode) return
    setRecallTargetMode(nextMode)
    if (mainPhase !== 'preview') {
      resetPerCardInteraction()
    }
  }

  const selectInlineLens = (nextLens: InlineLens) => {
    if (inlineLens === nextLens) return
    setInlineLens(nextLens)
    if (mainPhase !== 'preview') {
      resetPerCardInteraction()
    }
  }

  useEffect(() => {
    resetPerCardInteraction()
  }, [activeCardId, practiceMode, sessionPosition])

  useEffect(() => {
    if (mainPhase !== 'typing' || !shouldFocusMainInputRef.current) return
    shouldFocusMainInputRef.current = false
    window.requestAnimationFrame(() => {
      const input = mainInputRef.current
      if (!input) return
      input.focus()
      const cursorPosition = input.value.length
      input.selectionStart = cursorPosition
      input.selectionEnd = cursorPosition
    })
  }, [mainPhase, mainInput])

  const startMainRecall = () => {
    if (!hasDeck || hasAnsweredCurrent || sessionFinished) return
    if (previewCodeContainerRef.current) {
      setRecallMinHeight(previewCodeContainerRef.current.offsetHeight)
    }
    setMainPhase('typing')
    setMainStartedAt(Date.now())
    setMainInput('')
    setCurrentInteractionId(createInteractionId())
    lastMainInputEditAtRef.current = Date.now()
    liveCoachSnapshotRef.current = null
    lastLiveCoachDecisionKeyRef.current = ''
  }

  const handleMainEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (mainHighlightRef.current) {
      mainHighlightRef.current.scrollTop = e.currentTarget.scrollTop
      mainHighlightRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
    if (mainGhostRef.current) {
      mainGhostRef.current.scrollTop = e.currentTarget.scrollTop
      mainGhostRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
    if (mainGutterRef.current) {
      mainGutterRef.current.scrollTop = e.currentTarget.scrollTop
    }
  }

  const applyMainEdit = (nextValue: string, cursorPosition: number) => {
    setMainInput(nextValue)
    lastMainInputEditAtRef.current = Date.now()
    window.requestAnimationFrame(() => {
      if (!mainInputRef.current) return
      mainInputRef.current.selectionStart = cursorPosition
      mainInputRef.current.selectionEnd = cursorPosition
    })
  }

  const handleMainInputChange = (nextValue: string) => {
    if (mainPhase !== 'typing') return
    setMainInput(nextValue)
    lastMainInputEditAtRef.current = Date.now()
  }

  const handleMainKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (mainPhase === 'submitted' && latestSubmittedWasGhostRep) {
        repeatGhostRep()
        return
      }
      if (mainPhase === 'typing' && mainInput.trim().length > 0) submitMainRecall()
      return
    }

    if (mainPhase !== 'typing') return

    const inputElement = event.currentTarget
    const start = inputElement.selectionStart
    const end = inputElement.selectionEnd

    if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey) {
        const lineStart = mainInput.lastIndexOf('\n', Math.max(0, start - 1)) + 1
        const leading = mainInput.slice(lineStart).match(/^ +/)?.[0].length ?? 0
        const removeCount = Math.min(4, leading, Math.max(start - lineStart, 0))
        if (removeCount > 0) {
          const nextValue = mainInput.slice(0, lineStart) + mainInput.slice(lineStart + removeCount)
          applyMainEdit(nextValue, start - removeCount)
        }
      } else {
        const spaces = '    '
        const nextValue = `${mainInput.slice(0, start)}${spaces}${mainInput.slice(end)}`
        applyMainEdit(nextValue, start + 4)
      }
      return
    }

    if (event.key === 'Backspace') {
      if (start === end && start > 0) {
        const lineStart = mainInput.lastIndexOf('\n', Math.max(0, start - 1)) + 1
        const beforeCursor = mainInput.slice(lineStart, start)
        const leading = beforeCursor.match(/^ +/)?.[0] ?? ''
        const cursorInLeading = beforeCursor.length <= leading.length
        if (cursorInLeading && beforeCursor.length > 0) {
          event.preventDefault()
          const currentIndent = beforeCursor.length
          const nextIndent = Math.max(0, Math.floor((currentIndent - 1) / 4) * 4)
          const nextValue = `${mainInput.slice(0, lineStart)}${' '.repeat(nextIndent)}${mainInput.slice(start)}`
          applyMainEdit(nextValue, lineStart + nextIndent)
        }
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const lineStart = mainInput.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      const currentLine = mainInput.slice(lineStart, start)
      const indent = currentLine.match(/^\s*/)?.[0] ?? ''
      const extraIndent = currentLine.trimEnd().endsWith(':') ? '    ' : ''
      const insertion = `\n${indent}${extraIndent}`
      const nextValue = `${mainInput.slice(0, start)}${insertion}${mainInput.slice(end)}`
      applyMainEdit(nextValue, start + insertion.length)
    }
  }

  const fetchLiveCoachFeedback = async (payload: {
    interactionId: string
    expectedAnswer: string
    userAnswer: string
    elapsedMs: number
    accuracy: number
    exact: boolean
    previousAttempts: RecallAttemptSnapshot[]
    liveStructure: LiveStructure
  }) => {
    if (!liveCoachTuning.enabled) return
    const requestCardId = card.id
    liveCoachRequestVersionRef.current += 1
    const requestVersion = liveCoachRequestVersionRef.current
    setLiveCoachLoading(true)
    setLiveCoachError('')
    try {
      const response = await fetch(apiUrl('/api/coach/attempt-feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          cardTitle: card.title,
          prompt: practicePrompt,
          expectedAnswer: payload.expectedAnswer,
          userAnswer: payload.userAnswer,
          elapsedMs: payload.elapsedMs,
          accuracy: payload.accuracy,
          exact: payload.exact,
          interactionId: payload.interactionId,
          skillTags: currentSkillTags,
          previousAttempts: payload.previousAttempts.map((attempt) => ({
            attemptNumber: attempt.attemptNumber,
            accuracy: attempt.accuracy,
            exact: attempt.exact,
            elapsedMs: attempt.elapsedMs,
          })),
          questionType: currentQuestionType,
          mode: 'main-recall',
          templateMode: currentTemplateMode,
          enabledTemplateModes: activeTemplateModes,
          liveMode: true,
          liveMilestones: {
            nonEmptyLines: payload.liveStructure.nonEmptyLines,
            hasSignature: payload.liveStructure.hasSignature,
            hasGuard: payload.liveStructure.hasGuard,
            traversalKind: payload.liveStructure.traversalKind ?? '',
            hasLoop: payload.liveStructure.hasLoop,
            hasPlaceholder: payload.liveStructure.hasPlaceholder,
            hasBookkeeping: payload.liveStructure.hasBookkeeping,
          },
          liveCoachTuning,
          submissionTuning,
          llmProvider: requestLlmProvider,
        }),
      })
      if (!response.ok) throw new Error('Unable to load live coach feedback')
      const feedback = (await response.json()) as CoachAttemptFeedback
      if (currentCardIdRef.current !== requestCardId || liveCoachRequestVersionRef.current !== requestVersion) return
      setLiveCoachFeedback(feedback)
      setLiveCoachUsedThisAttempt(true)
    } catch {
      if (currentCardIdRef.current !== requestCardId || liveCoachRequestVersionRef.current !== requestVersion) return
      setLiveCoachError('Live coach unavailable right now.')
      setLiveCoachFeedback(null)
    } finally {
      if (currentCardIdRef.current === requestCardId && liveCoachRequestVersionRef.current === requestVersion) {
        setLiveCoachLoading(false)
      }
    }
  }

  const requestLiveCoachFeedback = useEffectEvent(fetchLiveCoachFeedback)
  const toggleLiveFeedback = () => {
    setLiveCoachTuning((prev) => ({ ...prev, enabled: !prev.enabled }))
  }

  const fetchCoachAttemptFeedback = async (
    payload: {
      interactionId: string
      expectedAnswer: string
      userAnswer: string
      elapsedMs: number
      accuracy: number
      exact: boolean
      previousAttempts: RecallAttemptSnapshot[]
    }
  ): Promise<CoachAttemptFeedback | null> => {
    const requestCardId = card.id
    coachRequestVersionRef.current += 1
    const requestVersion = coachRequestVersionRef.current
    setCoachFeedback(null)
    setCoachLoading(true)
    setCoachError('')
    setSubmissionFailureModal(null)
    try {
      const response = await fetch(apiUrl('/api/coach/attempt-feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          cardTitle: card.title,
          prompt: practicePrompt,
          expectedAnswer: payload.expectedAnswer,
          userAnswer: payload.userAnswer,
          elapsedMs: payload.elapsedMs,
          accuracy: payload.accuracy,
          exact: payload.exact,
          interactionId: payload.interactionId,
          skillTags: currentSkillTags,
          previousAttempts: payload.previousAttempts.map((attempt) => ({
            attemptNumber: attempt.attemptNumber,
            accuracy: attempt.accuracy,
            exact: attempt.exact,
            elapsedMs: attempt.elapsedMs,
          })),
          questionType: currentQuestionType,
          mode: 'main-recall',
          llmProvider: requestLlmProvider,
          templateMode: currentTemplateMode,
          enabledTemplateModes: activeTemplateModes,
          submissionTuning,
        }),
      })
      if (!response.ok) {
        let parsedError: unknown = null
        try {
          parsedError = await response.json()
        } catch {
          parsedError = null
        }

        const defaultProviderLabel =
          llmProvider === 'auto'
            ? configuredProviderLabel
            : providerDisplayLabel(llmProvider)
        const detail =
          parsedError &&
          typeof parsedError === 'object' &&
          parsedError !== null &&
          'detail' in parsedError &&
          typeof (parsedError as { detail?: unknown }).detail === 'object' &&
          (parsedError as { detail?: unknown }).detail !== null
            ? ((parsedError as { detail: Record<string, unknown> }).detail)
            : null

        const code = typeof detail?.code === 'string' ? detail.code : ''
        if (
          code === 'submission_feedback_missing_api_key' ||
          code === 'submission_feedback_no_response' ||
          code.startsWith('coach_llm_') ||
          code.startsWith('signal_assessor_')
        ) {
          const providerLabel =
            typeof detail?.providerLabel === 'string' && detail.providerLabel.trim().length > 0
              ? detail.providerLabel
              : defaultProviderLabel
          const message =
            typeof detail?.message === 'string' && detail.message.trim().length > 0
              ? detail.message
              : `Feedback cannot be generated at this time. No response from ${providerLabel}.`
          setSubmissionFailureModal({
            providerLabel,
            message,
          })
        }
        throw new Error('Unable to load coach feedback')
      }
      const feedback = (await response.json()) as CoachAttemptFeedback
      if (currentCardIdRef.current !== requestCardId || coachRequestVersionRef.current !== requestVersion) return null
      setCoachFeedback(feedback)
      return feedback
    } catch {
      if (currentCardIdRef.current !== requestCardId || coachRequestVersionRef.current !== requestVersion) return null
      setCoachError('Coach feedback unavailable for this attempt.')
      setCoachFeedback(null)
      return null
    } finally {
      if (currentCardIdRef.current === requestCardId && coachRequestVersionRef.current === requestVersion) {
        setCoachLoading(false)
      }
    }
  }

  const fetchSessionPlan = async () => {
    if (sessionPlanRequested) return
    setSessionPlanRequested(true)
    setSessionPlanLoading(true)
    setSessionPlanError('')

    try {
      const weakCards = Object.entries(sessionAccuracyByCard)
        .map(([cardId, accuracy]) => {
          const found = filteredDeck.find((item) => item.id === cardId)
          return {
            cardId,
            cardTitle: found?.title ?? '',
            accuracy,
            elapsedMs: sessionElapsedByCard[cardId] ?? 0,
          }
        })
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 5)

      const response = await fetch(apiUrl('/api/coach/session-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'main-recall',
          questionType: requestedQuestionType,
          attempts,
          correctCount,
          avgAccuracy,
          avgElapsedMs:
            attempts > 0
              ? Math.round(
                  Object.values(sessionElapsedByCard).reduce((sum, value) => sum + value, 0) /
                    attempts
                )
              : 0,
          weakestCards: weakCards,
          llmProvider: requestLlmProvider,
        }),
      })
      if (!response.ok) throw new Error('Unable to load coach session plan')
      const plan = (await response.json()) as CoachSessionPlan
      setSessionPlan(plan)
    } catch {
      setSessionPlanError('Coach session plan unavailable right now.')
      setSessionPlan(null)
    } finally {
      setSessionPlanLoading(false)
    }
  }

  const submitMainRecall = async () => {
    if (practiceMode !== 'recall' || !hasDeck || hasAnsweredCurrent || sessionFinished || mainPhase !== 'typing') return

    const startedAt = mainStartedAt ?? Date.now()
    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const elapsedMs = Math.max(Date.now() - startedAt, 1)
    const normalizedInput = normalizeTyping(mainInput)
    const normalizedInputLines = normalizedInput.split('\n')
    const normalizedTarget = practiceTarget
    const evaluation = await evaluateSubmittedRecall(normalizedTarget, normalizedInput)
    const accuracy = Math.round(evaluation.accuracy)
    const sound = evaluation.sound
    const isGhostRep = supportLayer === 'ghost-reps'
    const closeEnough = !isGhostRep && sound
    const historyKey = currentRecallHistoryKey
    const currentHistory = mainRecallHistoryByCard[historyKey] ?? []
    const attemptSnapshot = summarizeRecallAttempt(
      normalizedInputLines,
      accuracy,
      sound,
      elapsedMs,
      currentHistory.length + 1,
      supportLayer
    )
    setMainCloseEnough(closeEnough)
    setMainPhase('submitted')
    setMainRecallHistoryByCard((prev) => ({
      ...prev,
      [historyKey]: [...(prev[historyKey] ?? []), attemptSnapshot],
    }))

    const feedback = isGhostRep
      ? null
      : await fetchCoachAttemptFeedback({
          interactionId,
          expectedAnswer: normalizedTarget,
          userAnswer: normalizedInput,
          elapsedMs,
          accuracy,
          exact: sound,
          previousAttempts: currentHistory,
        })

    await submitAttemptToServer({
      mode: 'main-recall',
      correct: sound,
      correctAnswer: normalizedTarget,
      userAnswer: normalizedInput,
      accuracy,
      exact: sound,
      elapsedMs,
      interactionId,
      templateMode: currentTemplateMode,
      supportLayer,
      liveCoachUsed: liveCoachUsedThisAttempt,
      coachFeedback: feedback,
      submissionRubric: feedback?.submissionRubric ?? null,
    })

    if (!isGhostRep && flowMode === 'adaptive' && !sound && feedback?.submissionRubric) {
      void requestAdaptiveVariation({
        interactionId,
        expectedAnswer: normalizedTarget,
        userAnswer: normalizedInput,
        submissionRubric: feedback.submissionRubric,
      })
    }

    if (!isGhostRep && closeEnough) {
      completeCardInSession(sound, accuracy, elapsedMs)
      if (flowMode === 'sequential') {
        void requestSequentialVariation({
          interactionId,
          expectedAnswer: normalizedTarget,
        })
      }
    }
  }

  const submitMultipleChoice = async () => {
    if (
      practiceMode !== 'multiple-choice' ||
      !multipleChoiceCard ||
      !hasDeck ||
      hasAnsweredCurrent ||
      sessionFinished ||
      !multipleChoiceSelectedChoiceId
    ) {
      return
    }

    const selectedChoice = multipleChoiceCard.choices.find((choice) => choice.id === multipleChoiceSelectedChoiceId)
    const correctChoice = multipleChoiceCard.choices.find((choice) => choice.id === multipleChoiceCard.correctChoiceId)
    if (!selectedChoice || !correctChoice) return

    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const elapsedMs = Math.max(Date.now() - (multipleChoiceStartedAt ?? Date.now()), 1)
    const correct = selectedChoice.id === correctChoice.id

    setMultipleChoiceSubmittedByCard((prev) => ({
      ...prev,
      [multipleChoiceCard.id]: selectedChoice.id,
    }))
    completeCardInSession(correct, correct ? 100 : 0, elapsedMs)

    await submitMultipleChoiceAttemptToServer({
      interactionId,
      selectedChoice,
      correctChoice,
      correct,
      elapsedMs,
    })
  }

  const reviseMainRecall = () => {
    if (!hasDeck || hasAnsweredCurrent || sessionFinished || mainPhase !== 'submitted' || mainCloseEnough) return
    setMainPhase('typing')
    setMainStartedAt(Date.now())
    setCurrentInteractionId(createInteractionId())
    lastMainInputEditAtRef.current = Date.now()
    liveCoachSnapshotRef.current = null
    lastLiveCoachDecisionKeyRef.current = ''
  }

  const repeatGhostRep = () => {
    if (!hasDeck || hasAnsweredCurrent || sessionFinished || mainPhase !== 'submitted') return
    shouldFocusMainInputRef.current = true
    setMainPhase('typing')
    setMainInput('')
    setMainStartedAt(Date.now())
    setMainCloseEnough(false)
    setCurrentInteractionId(createInteractionId())
    setCoachFeedback(null)
    setCoachError('')
    setSubmissionFailureModal(null)
    lastMainInputEditAtRef.current = Date.now()
    liveCoachSnapshotRef.current = null
    lastLiveCoachDecisionKeyRef.current = ''
  }

  const restartSession = () => {
    if (practiceMode === 'multiple-choice') {
      setMultipleChoiceRefreshToken((prev) => prev + 1)
      return
    }
    setSkillMapRefreshToken((prev) => prev + 1)
  }

  const goNext = () => {
    if (sessionFinished) return
    setSessionPosition((prev) => Math.min(prev + 1, Math.max(sessionOrder.length - 1, 0)))
  }

  const goPrev = () => {
    setSessionPosition((prev) => Math.max(prev - 1, 0))
  }

  const attempts = Object.keys(sessionResults).length
  const correctCount = Object.values(sessionResults).filter(Boolean).length
  const avgAccuracy =
    attempts > 0
      ? Math.round(
          (Object.values(sessionAccuracyByCard).reduce((sum, value) => sum + value, 0) / attempts) * 10
        ) / 10
      : 0

  const canGoNext = sessionPosition < sessionOrder.length - 1
  const canGoPrev = sessionPosition > 0

  useEffect(() => {
    if (!sessionFinished) return
    if (practiceMode === 'multiple-choice') return
    void fetchSessionPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceMode, sessionFinished])

  const liveStructure = useMemo(
    () => analyzeLiveStructure(mainInput, currentTemplateMode),
    [currentTemplateMode, mainInput]
  )
  const lineReview = useMemo(
    () => computeLineReview(practiceTarget, mainInput.replace(/\r\n/g, '\n')),
    [practiceTarget, mainInput]
  )
  const currentCardRecallHistory = useMemo(
    () => mainRecallHistoryByCard[currentRecallHistoryKey] ?? [],
    [currentRecallHistoryKey, mainRecallHistoryByCard]
  )
  const inlineLiveNotes = useMemo(() => {
    if (mainPhase !== 'typing' || !liveCoachTuning.enabled) return []
    const sourceLines = (mainInput || '').split('\n')
    const preferredIndex = liveCoachSnapshotRef.current?.changedLine ?? sourceLines.length - 1
    const anchoredFallback = findNearestWrittenLineIndex(sourceLines, preferredIndex)

    if (liveCoachError) {
      return [{
        text: liveCoachError,
        sourceLineNumber: anchoredFallback >= 0 ? anchoredFallback + 1 : null,
        tone: 'negative',
      }] satisfies LiveInlineNote[]
    }
    if (!liveCoachFeedback) return []

    const candidateNotes = [
      { text: liveCoachFeedback.immediateCorrection, tone: 'negative' as const },
      { text: liveCoachFeedback.nextMove, tone: 'negative' as const },
      { text: liveCoachFeedback.primaryFocus, tone: 'negative' as const },
      { text: liveCoachFeedback.why, tone: 'neutral' as const },
      { text: liveCoachFeedback.diagnosis, tone: 'negative' as const },
      { text: liveCoachFeedback.affirmation ?? '', tone: 'positive' as const },
      ...liveCoachFeedback.strengths.map((text) => ({ text, tone: 'positive' as const })),
    ]

    const seenNotes = new Set<string>()
    const notes: LiveInlineNote[] = []
    for (const candidate of candidateNotes) {
      const note = shortenAnnotationNote(candidate.text ?? '')
      if (!note) continue
      const noteKey = note.toLowerCase()
      if (seenNotes.has(noteKey)) continue
      seenNotes.add(noteKey)

      const anchoredIndex = findBestLiveNoteAnchorLine(sourceLines, note, preferredIndex)
      notes.push({
        text: note,
        sourceLineNumber: anchoredIndex >= 0 ? anchoredIndex + 1 : null,
        tone: candidate.tone,
      })

      if (notes.length >= 2) break
    }

    return notes
  }, [liveCoachError, liveCoachFeedback, liveCoachTuning.enabled, mainInput, mainPhase])
  const displayLines = useMemo(() => {
    const source = mainPhase === 'submitted'
      ? (mainInput || '')
      : (mainInput || (isGhostRepsEnabled ? '' : `# ${practicePlaceholder}`))

    const baseLines = source
      .split('\n')
      .map(
        (line, index): AnnotatedDisplayLine => ({
          text: line,
          sourceLineNumber: source.length > 0 ? index + 1 : null,
          liveTone: null,
        })
      )

    if (inlineLiveNotes.length === 0) return baseLines

    const annotationsBySourceLine = new Map<number, LiveLineAnnotation>()

    inlineLiveNotes.forEach((note) => {
      const sourceIndex = note.sourceLineNumber
        ? note.sourceLineNumber - 1
        : findNearestWrittenLineIndex(baseLines.map((line) => line.text), baseLines.length - 1)

      if (sourceIndex < 0 || !baseLines[sourceIndex]) return

      baseLines[sourceIndex].liveTone = mergeLiveTone(baseLines[sourceIndex].liveTone, note.tone)
      annotationsBySourceLine.set(
        sourceIndex,
        mergeLiveLineAnnotation(annotationsBySourceLine.get(sourceIndex), note)
      )
    })

    return baseLines.map((line, index) => {
      const annotation = annotationsBySourceLine.get(index)
      if (!annotation?.note) return line

      return {
        ...line,
        text: appendAlignedNote(line.text, annotation.note),
        liveTone: annotation.tone,
      }
    })
  }, [inlineLiveNotes, isGhostRepsEnabled, mainInput, mainPhase, practicePlaceholder])
  const displayCode = useMemo(
    () => displayLines.map((line) => line.text).join('\n'),
    [displayLines]
  )
  const shouldUseAnnotatedDisplay = shouldHighlightInlineDecision || inlineLiveNotes.length > 0
  const ghostTargetCode = useMemo(() => {
    if (inlineEnabled && isGhostRepsEnabled && liveCoachTuning.enabled) {
      return stripInlineAnnotationNotes(practiceTarget)
    }
    return practiceTarget
  }, [inlineEnabled, isGhostRepsEnabled, liveCoachTuning.enabled, practiceTarget])
  const triggerLiveCoachRefresh = useEffectEvent((trimmedInput: string) => {
    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const target = practiceTarget
    const accuracy = estimateTemplateAccuracy(target, trimmedInput)

    void requestLiveCoachFeedback({
      interactionId,
      expectedAnswer: target,
      userAnswer: trimmedInput,
      elapsedMs: Math.max((mainStartedAt ? Date.now() - mainStartedAt : 0), 0),
      accuracy,
      exact: trimmedInput === target,
      previousAttempts: currentCardRecallHistory,
      liveStructure: liveStructure,
    })
  })
  const latestSubmittedAttempt =
    mainPhase === 'submitted' ? currentCardRecallHistory[currentCardRecallHistory.length - 1] ?? null : null
  const latestSubmittedWasGhostRep = latestSubmittedAttempt?.supportLayer === 'ghost-reps'
  const submittedMultipleChoiceId = multipleChoiceCard ? multipleChoiceSubmittedByCard[multipleChoiceCard.id] ?? '' : ''
  const selectedMultipleChoice = multipleChoiceCard?.choices.find((choice) => choice.id === multipleChoiceSelectedChoiceId) ?? null
  const correctMultipleChoice = multipleChoiceCard?.choices.find((choice) => choice.id === multipleChoiceCard.correctChoiceId) ?? null
  const multipleChoiceSubmitted = Boolean(submittedMultipleChoiceId)
  const multipleChoiceCorrect = Boolean(submittedMultipleChoiceId && submittedMultipleChoiceId === multipleChoiceCard?.correctChoiceId)
  const inlineLensTabs = inlineEnabled ? (
    <div className="inline-lens-tabs" role="tablist" aria-label="Inline explanation lens">
      {INLINE_LENS_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          className={inlineLens === option.value ? 'inline-lens-tab active' : 'inline-lens-tab'}
          aria-selected={inlineLens === option.value}
          title={option.title}
          onClick={() => selectInlineLens(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ) : null
  const primaryCardAction = (() => {
    if (!hasDeck) return null

    if (practiceMode === 'multiple-choice') {
      if (multipleChoiceSubmitted) return null
      return {
        label: 'Submit answer',
        onClick: submitMultipleChoice,
        disabled: !selectedMultipleChoice || hasAnsweredCurrent || sessionFinished,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ),
      }
    }

    if (mainPhase === 'preview') {
      return {
        label: supportedStartRecallLabel,
        onClick: startMainRecall,
        disabled: !hasDeck || hasAnsweredCurrent || sessionFinished,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
          </svg>
        ),
      }
    }

    if (mainPhase === 'typing') {
      return {
        label: isGhostRepsEnabled ? 'Log ghost rep' : `Submit ${activeRecallLabel.toLowerCase()}`,
        onClick: submitMainRecall,
        disabled: mainInput.trim().length === 0,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
          </svg>
        ),
      }
    }

    if (latestSubmittedWasGhostRep) {
      return {
        label: 'Log another ghost rep',
        onClick: repeatGhostRep,
        disabled: sessionFinished,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
          </svg>
        ),
      }
    }

    if (!mainCloseEnough) {
      return {
        label: 'Revise and resubmit',
        onClick: reviseMainRecall,
        disabled: sessionFinished,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
          </svg>
        ),
      }
    }

    return null
  })()

  useEffect(() => {
    if (mainPhase !== 'submitted' || !latestSubmittedWasGhostRep) return
    const handler = (event: KeyboardEvent) => {
      const modifierPressed = event.metaKey || event.ctrlKey
      if (!modifierPressed) return

      if (event.key === 'Enter') {
        event.preventDefault()
        repeatGhostRep()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (canGoPrev) goPrev()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (canGoNext) goNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canGoNext, canGoPrev, latestSubmittedWasGhostRep, mainPhase, sessionFinished, sessionOrder.length, sessionPosition])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (practiceMode !== 'recall') return
      if (event.key === 'g' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSupportLayer((prev) => (prev === 'ghost-reps' ? 'none' : 'ghost-reps'))
      }
      if (event.key === 'l' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setLiveCoachTuning((prev) => ({ ...prev, enabled: !prev.enabled }))
      }
      if (event.key === 'i' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleInlineHelper()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [practiceMode, toggleInlineHelper])

  const submissionFeedbackNextStep =
    coachFeedback?.immediateCorrection || coachFeedback?.primaryFocus || 'Review the drifted step, then rewrite the recall target once more.'
  const showGeneratingSubmissionFeedback = coachLoading && !coachFeedback
  const submissionFeedbackText = (coachFeedback?.fullFeedback || '').trim()
  const submissionFeedbackParagraphs = submissionFeedbackText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const submissionCorrectedVersion = (coachFeedback?.correctedVersion || '').trim()
  const submissionResultLabel = latestSubmittedWasGhostRep
    ? 'Ghost Rep'
    : latestSubmittedAttempt?.exact
      ? 'Sound'
      : 'Needs work'
  const submissionResultTone = latestSubmittedAttempt?.exact
    ? 'success'
    : latestSubmittedWasGhostRep || mainCloseEnough
      ? 'warning'
      : 'error'
  const submissionCoachLabel = !coachFeedback
    ? 'Rules'
    : coachFeedback.llmUsed
      ? coachFeedback.llmProvider === 'claude'
        ? 'Claude'
        : coachFeedback.llmProvider === 'openai'
          ? 'ChatGPT'
          : coachFeedback.llmProvider === 'gemma'
            ? 'Gemma 4'
            : 'LLM'
      : 'Rules'
  const submissionAttemptStatusText = mainCloseEnough
    ? `${activeRecallLabel} recall recorded.`
    : latestSubmittedWasGhostRep
      ? `Ghost rep logged for ${activeRecallLabel}. Repeat it until the shape starts to stick.`
    : `This recall attempt is not sound yet. Revise the logic and submit again.`
  const showSubmittedLineReview = mainPhase === 'submitted' && !mainCloseEnough && !latestSubmittedWasGhostRep

  useEffect(() => {
    if (liveCoachTuning.enabled) return
    liveCoachRequestVersionRef.current += 1
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setLiveCoachFeedback(null)
  }, [liveCoachTuning.enabled])

  useEffect(() => {
    if (!liveCoachTuning.enabled) return
    if (practiceMode !== 'recall') return
    if (!hasDeck || mainPhase !== 'typing' || sessionFinished || hasAnsweredCurrent) return

    const trimmedInput = normalizeTyping(mainInput)
    if (!hasUsefulLiveStructure(trimmedInput, liveStructure)) {
      setLiveCoachFeedback(null)
      setLiveCoachLoading(false)
      setLiveCoachError('')
      liveCoachSnapshotRef.current = null
      lastLiveCoachDecisionKeyRef.current = ''
      return
    }

    const now = Date.now()
    const accuracy = estimateTemplateAccuracy(practiceTarget, trimmedInput)
    const stallMs = Math.max(
      8_000,
      Math.min(liveCoachTuning.stallThresholdSeconds * 1000, liveCoachFrequencyProfile.idleRefreshMs)
    )
    const { decision, snapshot } = chooseLiveCoachTiming({
      trimmedInput,
      structure: liveStructure,
      previous: liveCoachSnapshotRef.current,
      accuracy,
      now,
      idleForMs: now - (lastMainInputEditAtRef.current || now),
      stallMs,
      debounceMs: liveCoachFrequencyProfile.debounceMs,
      isGhostRepsEnabled,
    })
    liveCoachSnapshotRef.current = snapshot

    const scheduleDecision = (decisionKey: string, delayMs: number) => {
      if (lastLiveCoachDecisionKeyRef.current === decisionKey) return undefined
      const timeoutId = window.setTimeout(() => {
        if (lastLiveCoachDecisionKeyRef.current === decisionKey) return
        lastLiveCoachDecisionKeyRef.current = decisionKey
        triggerLiveCoachRefresh(trimmedInput)
      }, delayMs)
      return () => window.clearTimeout(timeoutId)
    }

    if (decision) {
      const decisionKey = [
        card.id,
        currentTemplateMode,
        decision.reason,
        snapshot.progressKey,
        snapshot.changedLine,
        Math.floor(snapshot.text.length / 20),
      ].join('|')
      return scheduleDecision(decisionKey, decision.delayMs)
    }

    if (snapshot.nonEmptyLines >= 3) {
      const remainingStallMs = Math.max(stallMs - (now - (lastMainInputEditAtRef.current || now)), 0)
      const decisionKey = [
        card.id,
        currentTemplateMode,
        'stall',
        snapshot.progressKey,
        snapshot.changedLine,
        Math.floor(snapshot.text.length / 20),
      ].join('|')
      const timeoutId = window.setTimeout(() => {
        if (lastLiveCoachDecisionKeyRef.current === decisionKey) return
        if (normalizeTyping(mainInput) !== trimmedInput) return
        if (Date.now() - (lastMainInputEditAtRef.current || Date.now()) < stallMs) return
        lastLiveCoachDecisionKeyRef.current = decisionKey
        triggerLiveCoachRefresh(trimmedInput)
      }, remainingStallMs)
      return () => window.clearTimeout(timeoutId)
    }
  }, [
    liveStructure,
    liveStructure.nonEmptyLines,
    liveStructure.hasSignature,
    liveStructure.hasGuard,
    liveStructure.hasLoop,
    liveStructure.hasPlaceholder,
    liveStructure.hasBookkeeping,
    liveStructure.traversalKind,
    card.id,
    currentTemplateMode,
    hasDeck,
    hasAnsweredCurrent,
    isGhostRepsEnabled,
    liveCoachFrequencyProfile.debounceMs,
    liveCoachFrequencyProfile.idleRefreshMs,
    liveCoachTuning.enabled,
    liveCoachTuning.stallThresholdSeconds,
    mainInput,
    mainPhase,
    practiceTarget,
    practiceMode,
    sessionFinished,
  ])

  return (
    <div className={relatedDrawerOpen && relatedLeetCodeSet ? 'app app-related-drawer-open' : 'app'}>
      {submissionFailureModal && (
        <div className="submission-feedback-modal" onClick={() => setSubmissionFailureModal(null)}>
          <div
            className="submission-feedback-popover"
            role="dialog"
            aria-modal="true"
            aria-label="Submission feedback unavailable"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="dashboard-activity-eyebrow">Submission feedback unavailable</p>
            <h4>Feedback cannot be generated at this time.</h4>
            <p className="coach-panel-copy" style={{ marginBottom: '0.55rem' }}>
              {submissionFailureModal.message}
            </p>
            <div className="actions" style={{ marginTop: 0 }}>
              <button type="button" className="secondary" onClick={() => setSubmissionFailureModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <TopNav
        llmProviderLabel={`Auto (${configuredProviderLabel})`}
        sessionCounterText={sessionCounterText}
        sessionCounterLoading={activeLoading}
        practiceHistoryHref={practiceHistoryHref}
      />

  <div className={relatedLeetCodeSet ? 'card-shell card-shell-has-drawer' : 'card-shell'}>
      {relatedLeetCodeSet && (
        <button
          type="button"
          className={relatedDrawerOpen ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
          aria-expanded={relatedDrawerOpen}
          aria-controls="related-problems-drawer"
          aria-label={relatedDrawerOpen ? 'Hide related LeetCode drawer' : 'Show related LeetCode drawer'}
          title="Related LeetCode"
          onClick={() => setRelatedDrawerOpen((open) => !open)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
          </svg>
          <span className="sr-only">Related LeetCode</span>
        </button>
      )}
      <section className="card">
        <div className="card-header">
          <div className="card-header-main">
            <h3>{activeCardTitle}</h3>
            <p className="card-badges">
              <span>{activeCardDifficultyLabel}</span>
              {(isCoreAlgorithmCard || isMetaCard) && <span aria-hidden="true">•</span>}
              {isCoreAlgorithmCard && <span className="card-badge-core">core</span>}
              {isMetaCard && <span className="card-badge-meta">meta</span>}
            </p>
            {visibleCardTags.length > 0 && (
              <div className="tags">
                <button
                  type="button"
                  className={tagsExpanded ? 'tags-toggle active' : 'tags-toggle'}
                  onClick={() => setTagsExpanded((current) => !current)}
                  aria-expanded={tagsExpanded}
                  aria-controls={tagsListId}
                  title={tagsExpanded ? 'Hide tags' : 'Show tags'}
                >
                  tags
                </button>
                <div
                  ref={tagsListRef}
                  className={tagsExpanded ? 'tags-list expanded' : 'tags-list'}
                  id={tagsListId}
                  aria-hidden={!tagsExpanded}
                  style={{ '--tags-list-height': `${tagsListHeight}px` } as CSSProperties}
                >
                  {visibleCardTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={focusedTagSlug === tag ? 'tag tag-button active' : 'tag tag-button'}
                      onClick={() => handleTagClick(tag)}
                      aria-pressed={focusedTagSlug === tag}
                      disabled={!tagsExpanded}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {practiceMode === 'multiple-choice' ? (
              <div className="coach-metric-row card-header-metric-row">
                <span className="coach-metric-chip">Algorithm anchors</span>
                <span className="coach-metric-chip">{multipleChoiceQuestionCount} questions</span>
                {(focusedPatternSlug || requestedPlaylist) && (
                  <span className="coach-metric-chip">
                    {requestedPlaylist ? 'Playlist bias' : `Focus ${focusedPatternLabel}`}
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <div className="card-header-side">
            <div className="flow-mode-control" role="group" aria-label="Practice mode">
              <button
                type="button"
                className={practiceMode === 'recall' ? 'flow-mode-button active' : 'flow-mode-button'}
                onClick={() => setPracticeMode('recall')}
                aria-pressed={practiceMode === 'recall'}
                title="Recall"
              >
                Recall
              </button>
              <button
                type="button"
                className={practiceMode === 'multiple-choice' ? 'flow-mode-button active' : 'flow-mode-button'}
                onClick={() => setPracticeMode('multiple-choice')}
                aria-pressed={practiceMode === 'multiple-choice'}
                title="Multiple Choice"
              >
                MCQ
              </button>
            </div>
            {practiceMode === 'multiple-choice' ? (
              <>
                <div className="flow-mode-control" role="group" aria-label="Multiple choice difficulty">
                  <button
                    type="button"
                    className={multipleChoiceDifficulty === 'Med.' ? 'flow-mode-button active' : 'flow-mode-button'}
                    onClick={() => setMultipleChoiceDifficulty('Med.')}
                    aria-pressed={multipleChoiceDifficulty === 'Med.'}
                  >
                    Med.
                  </button>
                  <button
                    type="button"
                    className={multipleChoiceDifficulty === 'Hard' ? 'flow-mode-button active' : 'flow-mode-button'}
                    onClick={() => setMultipleChoiceDifficulty('Hard')}
                    aria-pressed={multipleChoiceDifficulty === 'Hard'}
                  >
                    Hard
                  </button>
                </div>
                <div className="multiple-choice-set-control">
                  <label htmlFor="multiple-choice-question-count">Set</label>
                  <input
                    id="multiple-choice-question-count"
                    type="number"
                    min={MULTIPLE_CHOICE_MIN_COUNT}
                    max={MULTIPLE_CHOICE_MAX_COUNT}
                    step="1"
                    value={multipleChoiceQuestionCount}
                    onChange={(event) => {
                      const nextCount = Number.parseInt(event.currentTarget.value, 10)
                      setMultipleChoiceQuestionCount(clampMultipleChoiceQuestionCount(Number.isNaN(nextCount) ? MULTIPLE_CHOICE_MIN_COUNT : nextCount))
                    }}
                    aria-label="MCQ set size"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="support-layer-control" aria-label="Practice support controls">
                  <button
                    type="button"
                    className={inlineEnabled ? 'navbar-toggle active' : 'navbar-toggle'}
                    onClick={toggleInlineHelper}
                    aria-pressed={inlineEnabled}
                    aria-label={inlineEnabled ? 'Turn Inline off' : 'Turn Inline on'}
                    title="Inline"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={isGhostRepsEnabled ? 'navbar-toggle active' : 'navbar-toggle'}
                    onClick={() => setSupportLayer(isGhostRepsEnabled ? 'none' : 'ghost-reps')}
                    aria-pressed={isGhostRepsEnabled}
                    aria-label={isGhostRepsEnabled ? 'Turn Ghost Reps off' : 'Turn Ghost Reps on'}
                    title="Ghost Reps"
                  >
                    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12.5V6.5a5 5 0 0 1 10 0v6l-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5Z"/>
                      <circle cx="5.5" cy="6.5" r="0.75" fill="currentColor" stroke="none"/>
                      <circle cx="8.5" cy="6.5" r="0.75" fill="currentColor" stroke="none"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={liveCoachTuning.enabled ? 'navbar-toggle active' : 'navbar-toggle'}
                    onClick={toggleLiveFeedback}
                    aria-pressed={liveCoachTuning.enabled}
                    aria-label={liveCoachTuning.enabled ? 'Turn live feedback off' : 'Turn live feedback on'}
                    title="Live"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                    </svg>
                  </button>
                </div>
                <div className="flow-mode-control" role="group" aria-label="Recall target mode">
              <button
                type="button"
                className={recallTargetMode === 'algorithm' ? 'flow-mode-button active' : 'flow-mode-button'}
                onClick={() => selectRecallTargetMode('algorithm')}
                aria-pressed={recallTargetMode === 'algorithm'}
                title="Algorithm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.25 8.25 21 12m0 0-3.75 3.75M21 12H3" />
                </svg>
              </button>
              <button
                type="button"
                className={recallTargetMode === 'coreShape' ? 'flow-mode-button active' : 'flow-mode-button'}
                onClick={() => selectRecallTargetMode('coreShape')}
                aria-pressed={recallTargetMode === 'coreShape'}
                title="Core shape"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                </svg>
              </button>
                </div>
              </>
            )}
          </div>
        </div>

        {sessionFinished && (
          <p className="status success" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            Session complete. {correctCount} of {attempts} {practiceMode === 'multiple-choice' ? 'questions were correct' : 'cards were sound'}. Avg score: {avgAccuracy}%.
          </p>
        )}
        {sessionFinished && practiceMode === 'recall' && (
          <div className="hint" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            <strong>Coach Session Plan</strong>
            {sessionPlanLoading && <p style={{ margin: '0.5rem 0 0' }}>Building your next-session plan...</p>}
            {sessionPlanError && <p style={{ margin: '0.5rem 0 0' }}>{sessionPlanError}</p>}
            {sessionPlan && (
              <div style={{ marginTop: '0.6rem' }}>
                <p style={{ margin: '0.3rem 0' }}><strong>{sessionPlan.headline}</strong></p>
                <p style={{ margin: '0.3rem 0' }}><strong>Focus:</strong> {sessionPlan.focusTheme}</p>
                <p style={{ margin: '0.3rem 0' }}><strong>Warmup:</strong> {sessionPlan.warmup}</p>
                <p style={{ margin: '0.3rem 0' }}><strong>Main Set:</strong> {sessionPlan.mainSet}</p>
                <p style={{ margin: '0.3rem 0' }}><strong>Cooldown:</strong> {sessionPlan.cooldown}</p>
                <p style={{ margin: '0.3rem 0' }}><strong>Note:</strong> {sessionPlan.note}</p>
                <p style={{ margin: '0.3rem 0', opacity: 0.8 }}>Generated by {sessionPlan.llmUsed ? 'LLM coach + rules' : 'rules coach'}.</p>
              </div>
            )}
          </div>
        )}

        <div className="card-grid">
          <div className="panel">
            {practiceMode === 'multiple-choice' ? (
              !hasDeck ? (
                activeLoading ? (
                  <div className="skeleton-group">
                    <div className="skeleton-line w95 tall" />
                    <div className="skeleton-line w80" />
                    <div className="skeleton-line w60" />
                  </div>
                ) : (
                  <>
                    <p className="prompt prompt-bar">Multiple choice is unavailable right now.</p>
                    <p className="hint">{activeError || 'Regenerate to request another LLM question set.'}</p>
                  </>
                )
              ) : multipleChoiceCard ? (
                <div className="multiple-choice-question-panel">
                  <div className="prompt multiple-choice-question">
                    <MarkdownCodeContent text={multipleChoiceCard.question} syntaxTheme={syntaxTheme} />
                  </div>
                </div>
              ) : null
            ) : !hasDeck ? (
              activeLoading ? (
                <div className="skeleton-group">
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w80" />
                  <div className="skeleton-line w60" />
                </div>
              ) : (
                <>
                  <p className="prompt prompt-bar">The skill-map deck is unavailable right now.</p>
                  <p className="hint">{activeError || 'Try restarting the session to request another generated deck.'}</p>
                </>
              )
            ) : (
              <div className="drill-fade-in">
                <div className={isPlainEnglishPromptOpen ? 'prompt-toggle-card expanded' : 'prompt-toggle-card'}>
                  <div className="prompt-toggle-header">
                    <p className="prompt prompt-bar prompt-toggle-text">{practicePrompt}</p>
                    {fallbackPlainEnglishPromptDetail && (
                      <button
                        type="button"
                        className={isPlainEnglishPromptOpen ? 'prompt-toggle-button active' : 'prompt-toggle-button'}
                        onClick={() => {
                          if (!plainEnglishPromptOpen && !promptToggleDetail && !plainEnglishPromptLoading) {
                            void requestPlainEnglishPromptExplanation()
                          }
                          setPlainEnglishPromptOpen((current) => !current)
                        }}
                        aria-expanded={isPlainEnglishPromptOpen}
                        aria-controls={plainEnglishPromptDetailId}
                        title={isPlainEnglishPromptOpen ? 'Hide explanation' : 'Show explanation'}
                      >
                        <span>{isPlainEnglishPromptOpen ? 'Hide' : 'Explanation'}</span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d={isPlainEnglishPromptOpen ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
                        </svg>
                      </button>
                    )}
                  </div>
                  {isPlainEnglishPromptOpen && fallbackPlainEnglishPromptDetail && (
                    <div className="prompt-detail" id={plainEnglishPromptDetailId}>
                      <div className="prompt-detail-section">
                        <h3>Explanation</h3>
                        <p>
                          {plainEnglishPromptLoading
                            ? 'Generating a plain English explanation...'
                            : promptToggleDetail?.plainEnglish || fallbackPlainEnglishPromptDetail.plainEnglish}
                        </p>
                      </div>
                      <div className="prompt-detail-section">
                        <h3>Input / Output</h3>
                        <div className="prompt-io-console" aria-label="Input and output example">
                          <div className="prompt-io-row">
                            <span className="prompt-io-label prompt-io-label-input">In [1]:</span>
                            <div className="prompt-io-code">
                              <SyntaxHighlighter
                                language="python"
                                style={syntaxTheme}
                                customStyle={{
                                  margin: 0,
                                  padding: 0,
                                  background: 'transparent',
                                  border: 'none',
                                  fontFamily: 'inherit',
                                  fontSize: 'inherit',
                                  lineHeight: 'inherit',
                                }}
                                codeTagProps={{ style: { fontFamily: 'inherit' } }}
                              >
                                {promptToggleDetail?.inputExample || fallbackPlainEnglishPromptDetail.inputExample}
                              </SyntaxHighlighter>
                            </div>
                          </div>
                          <div className="prompt-io-row prompt-io-row-output">
                            <span className="prompt-io-label prompt-io-label-output">Out[1]:</span>
                            <div className="prompt-io-code">
                              <SyntaxHighlighter
                                language="python"
                                style={syntaxTheme}
                                customStyle={{
                                  margin: 0,
                                  padding: 0,
                                  background: 'transparent',
                                  border: 'none',
                                  fontFamily: 'inherit',
                                  fontSize: 'inherit',
                                  lineHeight: 'inherit',
                                }}
                                codeTagProps={{ style: { fontFamily: 'inherit' } }}
                              >
                                {promptToggleDetail?.outputExample || fallbackPlainEnglishPromptDetail.outputExample}
                              </SyntaxHighlighter>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            {practiceMode === 'multiple-choice' ? (
              !hasDeck ? (
                activeLoading ? (
                  <div className="skeleton-group">
                    <div className="skeleton-line w60" />
                    <div className="skeleton-line w95 tall" />
                    <div className="skeleton-line w95 tall" />
                    <div className="skeleton-line w80 tall" />
                    <div className="skeleton-line w95 tall" />
                    <div className="skeleton-line w45" />
                  </div>
                ) : (
                  <div className="hint" style={{ marginTop: 0 }}>
                    {activeError || 'No multiple choice questions are available yet.'}
                  </div>
                )
              ) : multipleChoiceCard ? (
                <div className="multiple-choice-card">
                  <div className="multiple-choice-options" role="radiogroup" aria-label="Answer choices">
                    {multipleChoiceCard.choices.map((choice) => {
                      const isSelected = multipleChoiceSelectedChoiceId === choice.id
                      const isSubmittedChoice = submittedMultipleChoiceId === choice.id
                      const isCorrectChoice = multipleChoiceCard.correctChoiceId === choice.id
                      const resultClass = multipleChoiceSubmitted
                        ? isCorrectChoice
                          ? ' correct'
                          : isSubmittedChoice
                            ? ' incorrect'
                            : ''
                        : ''
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          className={`multiple-choice-option${isSelected ? ' selected' : ''}${resultClass}`}
                          onClick={() => {
                            if (!multipleChoiceSubmitted) setMultipleChoiceSelectedChoiceId(choice.id)
                          }}
                          disabled={multipleChoiceSubmitted || hasAnsweredCurrent || sessionFinished}
                          role="radio"
                          aria-checked={isSelected || isSubmittedChoice}
                        >
                          <span className="multiple-choice-option-id">{choice.id}</span>
                          <span className="multiple-choice-option-text">
                            <MarkdownCodeContent text={choice.text} syntaxTheme={syntaxTheme} compact />
                            {multipleChoiceSubmitted && isSubmittedChoice && (
                              <span className="multiple-choice-inline-result">
                                {multipleChoiceCorrect ? (
                                  <span className="multiple-choice-inline-result-explanation">
                                    <MarkdownCodeContent text={multipleChoiceCard.explanation} syntaxTheme={syntaxTheme} compact />
                                  </span>
                                ) : (
                                  <>
                                    <span className="multiple-choice-inline-result-wrong">Incorrect.</span>
                                    {correctMultipleChoice && (
                                      <span className="multiple-choice-inline-result-correct-label">
                                        Correct answer: <strong>{correctMultipleChoice.id}.</strong>{' '}
                                        <MarkdownCodeContent text={correctMultipleChoice.text} syntaxTheme={syntaxTheme} compact />
                                      </span>
                                    )}
                                    <span className="multiple-choice-inline-result-explanation">
                                      <MarkdownCodeContent text={multipleChoiceCard.explanation} syntaxTheme={syntaxTheme} compact />
                                    </span>
                                  </>
                                )}
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null
            ) : !hasDeck ? (
              activeLoading ? (
                <div className="skeleton-group">
                  <div className="skeleton-line w60" />
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w80 tall" />
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w45" />
                </div>
              ) : (
                <div className="hint" style={{ marginTop: 0 }}>
                  {activeError || 'No drills are available yet.'}
                </div>
              )
            ) : mainPhase === 'preview' && (
              <div className="drill-fade-in">
                {inlineLensTabs}
                <div className="code-container" ref={previewCodeContainerRef}>
                  {shouldHighlightInlineDecision ? (
                    <InlineDecisionCode
                      code={practiceTarget}
                      language={practiceLanguage}
                      syntaxTheme={syntaxTheme}
                    />
                  ) : (
                    <SyntaxHighlighter
                      language={practiceLanguage}
                      style={syntaxTheme}
                      customStyle={{
                        margin: 0,
                        padding: 0,
                        background: 'transparent',
                        border: 'none',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                        lineHeight: 'inherit',
                      }}
                      codeTagProps={{
                        style: {
                          background: 'transparent',
                          fontFamily: 'inherit',
                          fontSize: 'inherit',
                          lineHeight: 'inherit',
                        },
                      }}
                    >
                      {practiceTarget}
                    </SyntaxHighlighter>
                  )}
                </div>
              </div>
            )}

            {hasDeck && mainPhase !== 'preview' && (
              <>
                <label className="answer-label" htmlFor="main-recall-input">
                  {supportedPracticeInputLabel}
                </label>
                <div
                  className={[
                    'code-container recall-editor-container',
                    latestSubmittedWasGhostRep ? 'recall-editor-container-ghost-submitted' : '',
                  ].filter(Boolean).join(' ')}
                  style={recallMinHeight ? { minHeight: recallMinHeight } : undefined}
                >
                  <div className="typing-editor-shell">
                    {inlineLensTabs}
                    <div className="typing-editor no-gutter">
                      <div className="typing-code-area">
                        {latestSubmittedWasGhostRep && latestSubmittedAttempt && (
                          <div className="ghost-submit-summary" aria-live="polite">
                            <span>Accuracy {latestSubmittedAttempt.accuracy}%</span>
                            <span>Time {(latestSubmittedAttempt.elapsedMs / 1000).toFixed(1)}s</span>
                          </div>
                        )}
                        {mainPhase === 'typing' && isGhostRepsEnabled && (
                          <div className="typing-ghost-target" aria-hidden="true" ref={mainGhostRef}>
                            {shouldHighlightInlineDecision ? (
                              <InlineDecisionCode
                                code={ghostTargetCode}
                                language={practiceLanguage}
                                syntaxTheme={syntaxTheme}
                              />
                            ) : (
                              <SyntaxHighlighter
                                language={practiceLanguage}
                                style={syntaxTheme}
                                customStyle={{
                                  margin: 0,
                                  padding: 0,
                                  background: 'transparent',
                                  border: 'none',
                                  fontFamily: 'inherit',
                                  fontSize: 'inherit',
                                  lineHeight: 'inherit',
                                  whiteSpace: 'pre',
                                }}
                                codeTagProps={{
                                  style: {
                                    background: 'transparent',
                                    fontFamily: 'inherit',
                                    fontSize: 'inherit',
                                    lineHeight: 'inherit',
                                    whiteSpace: 'pre',
                                  },
                                }}
                              >
                                {practiceTarget}
                              </SyntaxHighlighter>
                            )}
                          </div>
                        )}
                        <div className="typing-highlight" aria-hidden="true" ref={mainHighlightRef}>
                          {shouldUseAnnotatedDisplay ? (
                            <LiveFeedbackCode
                              code={displayCode}
                              language={practiceLanguage}
                              syntaxTheme={syntaxTheme}
                              displayLines={displayLines}
                              lineReviewStatuses={lineReview.actualStatuses}
                              showSubmittedLineReview={showSubmittedLineReview}
                              shouldHighlightInlineDecision={shouldHighlightInlineDecision}
                            />
                          ) : (
                            <SyntaxHighlighter
                              language={practiceLanguage}
                              style={syntaxTheme}
                              wrapLines
                              lineProps={(lineNumber) => {
                                const line = displayLines[lineNumber - 1]
                                if (!line) {
                                  return { className: 'typing-highlight-line' }
                                }

                                const status =
                                  showSubmittedLineReview && line.sourceLineNumber
                                    ? lineReview.actualStatuses[line.sourceLineNumber - 1] ?? 'match'
                                    : null
                                const liveToneClass = line.liveTone ? ` live-target-${line.liveTone}` : ''
                                const liveSourceClass =
                                  line.sourceLineNumber !== null && line.liveTone
                                    ? ' live-target-source-line'
                                    : ''
                                return {
                                  className: `typing-highlight-line${status ? ` line-${status}` : ''}${liveToneClass}${liveSourceClass}`,
                                }
                              }}
                              customStyle={{
                                margin: 0,
                                padding: 0,
                                background: 'transparent',
                                border: 'none',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                lineHeight: 'inherit',
                                whiteSpace: 'pre',
                              }}
                              codeTagProps={{
                                style: {
                                  background: 'transparent',
                                  fontFamily: 'inherit',
                                  fontSize: 'inherit',
                                  lineHeight: 'inherit',
                                  whiteSpace: 'pre',
                                },
                              }}
                            >
                              {displayCode}
                            </SyntaxHighlighter>
                          )}
                        </div>
                        {mainPhase === 'typing' && (
                          <textarea
                            id="main-recall-input"
                            ref={mainInputRef}
                            className="typing-answer-overlay"
                            rows={12}
                            value={mainInput}
                            onChange={(event) => handleMainInputChange(event.target.value)}
                            onKeyDown={handleMainKeyDown}
                            onScroll={handleMainEditorScroll}
                            disabled={hasAnsweredCurrent || sessionFinished}
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                            autoComplete="off"
                            placeholder={supportedPracticePlaceholder}
                          />
                        )}
                      </div>
                    </div>
                    {mainPhase === 'submitted' && !latestSubmittedWasGhostRep && (
                      <div className="coach-docked-panel">
                        <div className="coach-docked-card">
                          <div className="coach-card-header">
                            <h4>Submission Feedback</h4>
                            {!showGeneratingSubmissionFeedback && (
                              <span className={`coach-status-chip coach-status-chip-${submissionResultTone}`}>
                                {submissionResultLabel}
                              </span>
                            )}
                          </div>
                          {showGeneratingSubmissionFeedback ? (
                            <p className="coach-muted coach-waiting-placeholder">Waiting for submission feedback</p>
                          ) : (
                            <>
                              {latestSubmittedAttempt && (
                                <div className="coach-metric-row">
                                  <span className="coach-metric-chip">Accuracy {latestSubmittedAttempt.accuracy}%</span>
                                  <span className="coach-metric-chip">Time {(latestSubmittedAttempt.elapsedMs / 1000).toFixed(1)}s</span>
                                  {latestSubmittedWasGhostRep ? (
                                    <span className="coach-metric-chip">Support Ghost Reps</span>
                                  ) : (
                                    <span className="coach-metric-chip">
                                      Coach {submissionCoachLabel}
                                    </span>
                                  )}
                                </div>
                              )}
                              <p className={mainCloseEnough || latestSubmittedWasGhostRep ? 'status success' : 'status error'}>
                                {submissionAttemptStatusText}
                              </p>
                              {coachLoading && coachFeedback && <p className="coach-muted">Refining submission feedback...</p>}
                              {coachError && <p className="coach-error">{coachError}</p>}
                              {latestSubmittedWasGhostRep ? (
                                <p className="coach-panel-copy">
                                  This counts as supported work. It is saved separately from unsupported recall so you can build fluency without pretending it was cold recall.
                                </p>
                              ) : (
                                submissionFeedbackParagraphs.map((paragraph, index) => (
                                  <p key={index} className="coach-panel-copy">
                                    {paragraph}
                                  </p>
                                ))
                              )}
                              {submissionCorrectedVersion && (
                                <div className="coach-code-review">
                                  <p className="coach-code-label">Corrected version</p>
                                  <div className="code-container">
                                    <SyntaxHighlighter
                                      language={practiceLanguage}
                                      style={syntaxTheme}
                                      customStyle={{ margin: 0, padding: 0, background: 'transparent', border: 'none' }}
                                      codeTagProps={{ style: { background: 'transparent' } }}
                                    >
                                      {submissionCorrectedVersion}
                                    </SyntaxHighlighter>
                                  </div>
                                </div>
                              )}
                              {!latestSubmittedWasGhostRep && (
                                <p className="coach-muted">
                                  <strong>Next step:</strong> {submissionFeedbackNextStep}
                                </p>
                              )}
                              {queuedFlowLoading && (
                                <p className="coach-muted">{queuedFlowLoadingMessage}</p>
                              )}
                              {queuedFlowNote && (
                                <p className="coach-muted">
                                  <strong>Queued next:</strong> {queuedFlowNote}
                                </p>
                              )}
                              {queuedFlowError && <p className="coach-error">{queuedFlowError}</p>}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <p className="typing-help">
                  {isGhostRepsEnabled
                    ? <>Ghost Reps are saved as supported work · trace the faint target as many times as needed · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to log · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Left</kbd>/<kbd>Right</kbd> to move cards</>
                    : <>Tab inserts 4 spaces · Shift+Tab outdents · Enter auto-indents · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to submit</>}
                </p>
              </>
            )}
          </div>

        </div>

        <div className="card-control-bar">
          <div className="card-control-group">
            <button className="secondary card-control-button" onClick={goPrev} disabled={!canGoPrev} aria-label="Previous card">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061a1.125 1.125 0 0 1 1.683.977v8.122Z" />
              </svg>
              <span>Previous</span>
            </button>
            <button className="secondary card-control-button" onClick={goNext} disabled={!canGoNext} aria-label="Next card">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
              </svg>
              <span>Next</span>
            </button>
            <button className="secondary card-control-button" onClick={restartSession} aria-label="Regenerate session">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span>Regenerate</span>
            </button>
          </div>

          {primaryCardAction && (
            <div className="card-control-group card-control-group-primary">
              <button
                className="card-control-button"
                onClick={primaryCardAction.onClick}
                disabled={primaryCardAction.disabled}
              >
                {primaryCardAction.icon}
                <span>{primaryCardAction.label}</span>
              </button>
            </div>
          )}
        </div>
      </section>
      {relatedLeetCodeSet && (
        <RelatedLeetCodeDrawer
          relatedSet={relatedLeetCodeSet}
          open={relatedDrawerOpen}
          onClose={() => setRelatedDrawerOpen(false)}
        />
      )}
      </div>
    </div>
  )
}

export default App
