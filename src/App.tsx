import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSearchParams } from 'react-router-dom'
import { skillMap, type SkillMapNode } from './data/skill-map'
import { getLiveCoachFrequencyProfile, loadStoredLiveCoachTuning, saveStoredLiveCoachTuning } from './liveCoachTuning'
import { loadStoredSubmissionTuning } from './submissionTuning'
import TopNav from './TopNav'
import { useTheme } from './theme'

type Flashcard = {
  id: string
  title: string
  difficulty: 'Easy' | 'Med.' | 'Hard'
  prompt: string
  templatePrompts?: Partial<Record<'pseudo' | 'invariant' | 'algorithm', string>>
  templateTargets?: Partial<Record<'pseudo' | 'invariant' | 'algorithm', string>>
  solution: string
  missing: string
  hint: string
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

type TemplateMode = 'pseudo' | 'invariant' | 'algorithm'
type SupportLayer = 'none' | 'ghost-reps'
type TemplateModeResult = {
  accuracy: number
  elapsedMs: number
  exact: boolean
}

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
  templateTargets: Record<string, Partial<Record<TemplateMode, string>>>
  llmProvider: LlmProvider
}

type AdaptiveVariationResponse = {
  drill: Flashcard
  targetDimension: string
  variationReason: string
  llmUsed: boolean
}

type AttemptEvaluationResponse = {
  accuracy: number
  sound: boolean
  syntaxValid: boolean
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

type LlmProvider = 'openai' | 'claude' | 'gemma'

const LLM_PROVIDER_OPTIONS: Array<{ value: LlmProvider, label: string }> = [
  { value: 'openai', label: 'ChatGPT' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemma', label: 'Gemma 4' },
]

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiUrl = (path: string) => `${API_BASE_URL}${path}`
const skillMapDeckRequestCache = new Map<string, Promise<SkillMapDrillsResponse>>()

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

const TEMPLATE_MODE_ORDER: TemplateMode[] = ['pseudo', 'invariant', 'algorithm']
const DEFAULT_TEMPLATE_MODES: TemplateMode[] = ['algorithm']
const TEMPLATE_MODE_LABELS: Record<TemplateMode, string> = {
  pseudo: 'Pseudo',
  invariant: 'Invariant',
  algorithm: 'Algorithm',
}
const patternToSlug = (pattern: string) =>
  pattern
    .toLowerCase()
    .replace(/\//g, ' ')
    .replace(/&/g, ' ')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\s+/g, '-')

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
    'stack',
  ]) {
    if (tags.includes(tag)) return tag
  }
  if (tags.includes('graph') || tags.includes('graph-bfs')) return 'graph-traversal'
  return 'generic'
}

const getTemplatePatternTag = (pattern: string) => {
  const slug = patternToSlug(pattern)
  if (slug === 'heap-priority-queue') return 'heap'
  return getPrimaryPatternTag([slug])
}

const normalizeTyping = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()

const tokenizeTemplateText = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9_+\-\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !['the', 'and', 'then', 'with', 'from', 'into', 'while', 'when'].includes(token))
  )

const estimateTemplateAccuracy = (templateMode: TemplateMode, expectedAnswer: string, userAnswer: string) => {
  if (templateMode === 'algorithm') {
    const compareLength = Math.max(userAnswer.length, expectedAnswer.length, 1)
    let exactMatches = 0
    for (let i = 0; i < compareLength; i += 1) {
      if (userAnswer[i] === expectedAnswer[i]) exactMatches += 1
    }
    return Math.round((exactMatches / compareLength) * 100)
  }

  const expectedTokens = tokenizeTemplateText(expectedAnswer)
  const actualTokens = tokenizeTemplateText(userAnswer)
  if (expectedTokens.size === 0) return 0
  let overlap = 0
  expectedTokens.forEach((token) => {
    if (actualTokens.has(token)) overlap += 1
  })
  return Math.round((overlap / expectedTokens.size) * 100)
}

const buildPseudoTemplate = (patternTag: string) => {
  switch (patternTag) {
    case 'sliding-window':
      return [
        'Define sliding_window(nums)',
        'Initialize the left pointer, the window state, and the best answer',
        'For each right index and incoming value:',
        '    Add the incoming value to the window state',
        '    While the window invariant is broken:',
        '        Remove the outgoing left value from state',
        '        Move left forward',
        '    Update the best answer from the current valid window',
        'Return the best answer',
      ].join('\n')
    case 'two-pointers':
      return [
        'Define two_pointer_scan(nums, target)',
        'Initialize left at the start and right at the end',
        'While left is still before right:',
        '    Compare the current pair to the target condition',
        '    Move left when the pair is too small',
        '    Move right when the pair is too large',
        '    Return as soon as the invariant is satisfied',
        'Return False if no pair works',
      ].join('\n')
    case 'binary-search':
      return [
        'Define binary_search(nums, target)',
        'Initialize the search interval with left and right bounds',
        'While the interval is still valid:',
        '    Compute the midpoint',
        '    Compare the midpoint value to the target condition',
        '    Discard the half that cannot contain the answer',
        'Return the answer implied by the final interval',
      ].join('\n')
    case 'dynamic-programming':
    case 'dp':
      return [
        'Define dp_template(input)',
        'State what dp[i] means before writing updates',
        'Initialize the base case',
        'Iterate in the order that makes earlier state available',
        'Update each state from the earlier state it depends on',
        'Return the final state that represents the answer',
      ].join('\n')
    case 'graph-traversal':
    case 'dfs-bfs':
      return [
        'Define graph_traversal(graph, start)',
        'Initialize the frontier and the visited rule',
        'While there are still states in the frontier:',
        '    Pop one state from the frontier',
        '    Skip states that should not be explored',
        '    For each valid neighbor:',
        '        Mark or schedule the neighbor exactly once',
        'Return the final traversal result',
      ].join('\n')
    case 'backtracking':
      return [
        'Define backtrack(state)',
        'Stop at the base case and record the answer',
        'For each available choice:',
        '    Make the choice',
        '    Recurse on the smaller state',
        '    Undo the choice before the next branch',
      ].join('\n')
    case 'heap':
      return [
        'Define heap_template(items)',
        'Initialize the heap state',
        'For each item in the input:',
        '    Push the item or its score into the heap',
        '    Pop or prune when the heap should shrink',
        'Return the answer represented by the heap',
      ].join('\n')
    case 'union-find':
      return [
        'Define union_find_template(items)',
        'Initialize the parent structure and any rank or size metadata',
        'Provide find and union behavior',
        'Iterate through the relationships you need to connect',
        'Union the relevant roots when the condition is met',
        'Return the final component-based answer',
      ].join('\n')
    case 'intervals':
      return [
        'Define interval_template(intervals)',
        'Sort intervals into the order the invariant expects',
        'Track the current interval you are building',
        'For each next interval:',
        '    Merge it if it overlaps the current one',
        '    Otherwise flush the current interval and start a new one',
        'Return the merged result',
      ].join('\n')
    case 'prefix-sums':
      return [
        'Define prefix_sum_template(nums, target)',
        'Initialize the running prefix state and the lookup structure',
        'For each value in the array:',
        '    Update the running prefix',
        '    Query the lookup using the invariant you need',
        '    Record the current prefix after the query',
        'Return the accumulated answer',
      ].join('\n')
    case 'monotonic-stack':
    case 'stack':
      return [
        'Define stack_template(items)',
        'Initialize the stack',
        'For each item in order:',
        '    While the invariant is broken, resolve items from the top',
        '    Push the current item once the invariant holds again',
        'Return the answer built from the resolved stack behavior',
      ].join('\n')
    default:
      return [
        'Define solve(input)',
        'State the invariant and the tracked state',
        'Iterate through the input in the order the invariant needs',
        'Update the tracked state on each step',
        'Return the final answer once the invariant has done its job',
      ].join('\n')
  }
}

const buildInvariantTemplate = (patternTag: string) => {
  switch (patternTag) {
    case 'sliding-window':
      return [
        'def sliding_window(nums):',
        '    left = 0',
        '    state = {}',
        '    best = 0',
        '',
        '    for right, value in enumerate(nums):',
        '        # add nums[right] to the window',
        '        # update state',
        '',
        '        while window_is_invalid(state):',
        '            # remove nums[left] from the window',
        '            # update state',
        '            left += 1',
        '',
        '        # window is now valid',
        '        best = max(best, right - left + 1)',
        '',
        '    return best',
      ].join('\n')
    case 'two-pointers':
      return [
        'def two_pointers(nums, target):',
        '    left = 0',
        '    right = len(nums) - 1',
        '',
        '    while left < right:',
        '        # compare nums[left] and nums[right] to the target',
        '        if pair_is_too_small(nums[left], nums[right], target):',
        '            left += 1',
        '        elif pair_is_too_large(nums[left], nums[right], target):',
        '            right -= 1',
        '        else:',
        '            return [left, right]',
        '',
        '    return default_answer()',
      ].join('\n')
    case 'binary-search':
      return [
        'def binary_search(nums, target):',
        '    left = 0',
        '    right = len(nums) - 1',
        '',
        '    while left <= right:',
        '        mid = (left + right) // 2',
        '',
        '        if midpoint_is_too_small(nums[mid], target):',
        '            left = mid + 1',
        '        else:',
        '            right = mid - 1',
        '',
        '    return answer_from_interval(left, right)',
      ].join('\n')
    case 'dynamic-programming':
    case 'dp':
      return [
        'def dp_template(values):',
        '    dp = [0] * len(values)',
        '    # initialize base case',
        '',
        '    for i in range(1, len(values)):',
        '        # compute dp[i] from earlier state',
        '        dp[i] = transition(dp, values, i)',
        '',
        '    return dp[-1]',
      ].join('\n')
    case 'graph-traversal':
    case 'dfs-bfs':
      return [
        'def graph_traversal(graph, start):',
        '    visited = {start}',
        '    queue = deque([start])',
        '',
        '    while queue:',
        '        node = queue.popleft()',
        '',
        '        for nei in graph[node]:',
        '            if nei in visited:',
        '                continue',
        '            visited.add(nei)',
        '            queue.append(nei)',
        '',
        '    return visited',
      ].join('\n')
    case 'backtracking':
      return [
        'def backtrack(state):',
        '    if base_case(state):',
        '        return record_answer(state)',
        '',
        '    for choice in choices(state):',
        '        # make the choice',
        '        backtrack(next_state(state, choice))',
        '        # undo the choice',
      ].join('\n')
    case 'heap':
      return [
        'def heap_template(items):',
        '    heap = []',
        '',
        '    for item in items:',
        '        # push the relevant value into the heap',
        '        if heap_is_too_large(heap):',
        '            # pop the item that should leave',
        '',
        '    return answer_from_heap(heap)',
      ].join('\n')
    case 'union-find':
      return [
        'def union_find_template(items):',
        '    parent = {item: item for item in items}',
        '    rank = {item: 0 for item in items}',
        '',
        '    def find(x):',
        '        # compress the path to the root',
        '',
        '    def union(a, b):',
        '        # connect the roots by rank',
        '',
        '    for a, b in relationships(items):',
        '        union(a, b)',
        '',
        '    return answer_from_components(parent)',
      ].join('\n')
    case 'intervals':
      return [
        'def interval_template(intervals):',
        '    intervals.sort()',
        '    merged = []',
        '',
        '    for start, end in intervals:',
        '        if merged and overlaps(merged[-1], start, end):',
        '            # extend the current interval',
        '        else:',
        '            merged.append([start, end])',
        '',
        '    return merged',
      ].join('\n')
    case 'prefix-sums':
      return [
        'def prefix_sum_template(nums, target):',
        '    prefix = 0',
        '    seen = {0: 1}',
        '    answer = 0',
        '',
        '    for value in nums:',
        '        prefix += value',
        '        # query the invariant with the old prefix state',
        '        # record the current prefix',
        '',
        '    return answer',
      ].join('\n')
    case 'monotonic-stack':
    case 'stack':
      return [
        'def stack_template(items):',
        '    stack = []',
        '    answer = []',
        '',
        '    for item in items:',
        '        while stack and breaks_invariant(stack[-1], item):',
        '            # resolve the top item',
        '        stack.append(item)',
        '',
        '    return answer',
      ].join('\n')
    default:
      return [
        'def solve(values):',
        '    state = init_state(values)',
        '',
        '    for value in values:',
        '        # update the invariant',
        '',
        '    return build_answer(state)',
      ].join('\n')
  }
}

const buildPracticePrompt = (templateMode: TemplateMode, patternTag: string) => {
  const patternLabel = patternTag
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Algorithm'

  const focusByPattern: Record<string, Partial<Record<TemplateMode, string>>> = {
    'sliding-window': {
      pseudo: 'sketch expand, shrink, update-best rhythm',
      invariant: 'keep the window valid while counts change',
      algorithm: 'code the expand/shrink/update-best loop',
    },
    'two-pointers': {
      pseudo: 'sketch how each comparison moves a pointer',
      invariant: 'preserve the left/right decision rule',
      algorithm: 'code the inward pointer scan',
    },
    'binary-search': {
      pseudo: 'sketch midpoint compare-and-discard steps',
      invariant: 'preserve the search interval invariant',
      algorithm: 'code the midpoint discard loop',
    },
    'dynamic-programming': {
      pseudo: 'state the base case and transition',
      invariant: 'preserve what each dp state means',
      algorithm: 'code the state-transition loop',
    },
    dp: {
      pseudo: 'state the base case and transition',
      invariant: 'preserve what each dp state means',
      algorithm: 'code the state-transition loop',
    },
    'graph-traversal': {
      pseudo: 'sketch frontier growth and visit-once logic',
      invariant: 'preserve frontier and visited invariants',
      algorithm: 'code the frontier plus visited loop',
    },
    'dfs-bfs': {
      pseudo: 'sketch frontier growth and visit-once logic',
      invariant: 'preserve frontier and visited invariants',
      algorithm: 'code the frontier plus visited loop',
    },
    backtracking: {
      pseudo: 'sketch choose, recurse, undo steps',
      invariant: 'preserve path state across undo',
      algorithm: 'code the choose/recurse/undo loop',
    },
    heap: {
      pseudo: 'sketch push, prune, keep-top logic',
      invariant: 'preserve heap size and order invariants',
      algorithm: 'code the push/prune heap loop',
    },
    'union-find': {
      pseudo: 'sketch find-root and union decisions',
      invariant: 'preserve parent roots and rank logic',
      algorithm: 'code the find/union component loop',
    },
    intervals: {
      pseudo: 'sketch overlap merge or flush decisions',
      invariant: 'preserve the ordered merge invariant',
      algorithm: 'code the sort-and-merge sweep',
    },
    'prefix-sums': {
      pseudo: 'sketch prefix update, query, record steps',
      invariant: 'preserve prefix lookup state',
      algorithm: 'code the prefix query loop',
    },
    'monotonic-stack': {
      pseudo: 'sketch pop violators, then push current',
      invariant: 'preserve the monotonic stack invariant',
      algorithm: 'code the pop-then-push stack loop',
    },
    stack: {
      pseudo: 'sketch pop violators, then push current',
      invariant: 'preserve the monotonic stack invariant',
      algorithm: 'code the pop-then-push stack loop',
    },
  }

  const defaultFocus: Record<TemplateMode, string> = {
    pseudo: 'sketch the reusable move sequence',
    invariant: 'preserve the key invariant while state updates',
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
  templateMode: TemplateMode,
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
    /^\s*(for|while)\b/.test(line) || (templateMode === 'pseudo' && /\b(for each|iterate|repeat|while)\b/i.test(line))
  ),
})

const analyzeLiveStructure = (code: string, templateMode: TemplateMode): LiveStructure => {
  const lines = code.replace(/\r\n/g, '\n').split('\n')
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0).length
  const hasSignature = lines.some((line) =>
    /^\s*def\s+/.test(line) || (templateMode === 'pseudo' && /\b(function|define|signature)\b/i.test(line))
  )
  const hasGuard = lines.some((line) =>
    (/^\s*if\b/.test(line) && /not|visited|seen|< 0|>=/.test(line)) ||
    (templateMode === 'pseudo' && /\b(if|when|skip|invalid|visited)\b/i.test(line))
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
    /^\s*(for|while)\b/.test(line) || (templateMode === 'pseudo' && /\b(for each|iterate|repeat|while)\b/i.test(line))
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

function App() {
  const { theme } = useTheme()
  const [searchParams] = useSearchParams()
  const questionType = 'skill-map' as const
  const [enabledTemplateModes, setEnabledTemplateModes] = useState<TemplateMode[]>(() => [...DEFAULT_TEMPLATE_MODES])
  const [supportLayer, setSupportLayer] = useState<SupportLayer>('none')
  const [skillMapDeck, setSkillMapDeck] = useState<Flashcard[]>([])
  const [skillMapLoading, setSkillMapLoading] = useState(false)
  const [skillMapError, setSkillMapError] = useState('')
  const [skillMapRefreshToken, setSkillMapRefreshToken] = useState(0)
  const [skillMapSessionVersion, setSkillMapSessionVersion] = useState(0)
  const [adaptiveVariationLoading, setAdaptiveVariationLoading] = useState(false)
  const [adaptiveVariationError, setAdaptiveVariationError] = useState('')
  const [adaptiveVariationNote, setAdaptiveVariationNote] = useState('')

  const [sessionOrder, setSessionOrder] = useState<number[]>([])
  const [sessionPosition, setSessionPosition] = useState(0)
  const [sessionFinished, setSessionFinished] = useState(false)
  const [currentTemplateModeIndex, setCurrentTemplateModeIndex] = useState(0)
  const [currentCardTemplateResults, setCurrentCardTemplateResults] = useState<Partial<Record<TemplateMode, TemplateModeResult>>>({})
  const [sessionResults, setSessionResults] = useState<Record<string, boolean>>({})
  const [sessionAccuracyByCard, setSessionAccuracyByCard] = useState<Record<string, number>>({})
  const [sessionElapsedByCard, setSessionElapsedByCard] = useState<Record<string, number>>({})
  const [sessionPlanRequested, setSessionPlanRequested] = useState(false)
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('openai')
  const [llmProviderMenuOpen, setLlmProviderMenuOpen] = useState(false)

  const [liveCoachUsedThisAttempt, setLiveCoachUsedThisAttempt] = useState(false)

  const [mainPhase, setMainPhase] = useState<'preview' | 'typing' | 'submitted'>('preview')
  const [mainInput, setMainInput] = useState('')
  const [mainStartedAt, setMainStartedAt] = useState<number | null>(null)
  const [mainCloseEnough, setMainCloseEnough] = useState(false)
  const [currentInteractionId, setCurrentInteractionId] = useState('')
  const [mainRecallHistoryByCard, setMainRecallHistoryByCard] = useState<Record<string, RecallAttemptSnapshot[]>>({})
  const [liveCoachFeedback, setLiveCoachFeedback] = useState<CoachAttemptFeedback | null>(null)
  const [liveCoachLoading, setLiveCoachLoading] = useState(false)
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
  const mainHighlightRef = useRef<HTMLDivElement | null>(null)
  const mainGhostRef = useRef<HTMLDivElement | null>(null)
  const previewCodeContainerRef = useRef<HTMLDivElement | null>(null)
  const [recallMinHeight, setRecallMinHeight] = useState<number | undefined>(undefined)
  const mainGutterRef = useRef<HTMLDivElement | null>(null)
  const llmProviderMenuRef = useRef<HTMLDivElement | null>(null)
  const currentCardIdRef = useRef('')
  const liveCoachRequestVersionRef = useRef(0)
  const lastLiveCoachMilestoneRef = useRef('')
  const lastLiveCoachLengthRef = useRef(0)
  const lastMainInputEditAtRef = useRef(0)
  const lastIdleLiveCoachRefreshAtRef = useRef(0)
  const coachRequestVersionRef = useRef(0)
  const skillMapDeckRequestVersionRef = useRef(0)
  const adaptiveVariationRequestKeyRef = useRef('')
  const focusedPatternSlug = searchParams.get('focusPattern')?.trim() || ''
  const focusedModeParam = searchParams.get('focusMode')?.trim() || ''
  const focusedMethodParams = searchParams.getAll('focusMethod').map((method) => method.trim()).filter(Boolean)
  const focusedMethodSignature = focusedMethodParams.join('\u0000')
  const focusedPatternNode = useMemo(
    () => skillMap.find((node) => patternToSlug(node.pattern) === focusedPatternSlug) ?? null,
    [focusedPatternSlug]
  )
  const focusedTemplateMode = useMemo<TemplateMode | null>(() => {
    if (focusedModeParam === 'pseudo' || focusedModeParam === 'invariant' || focusedModeParam === 'algorithm') {
      return focusedModeParam
    }
    return null
  }, [focusedModeParam])
  const requestedSkillMap = useMemo<SkillMapNode[]>(() => {
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
  }, [focusedPatternNode, focusedMethodSignature])
  const requestedSkillMapSignature = useMemo(
    () => JSON.stringify(requestedSkillMap),
    [requestedSkillMap]
  )
  const requestedTemplateMode = focusedTemplateMode ?? DEFAULT_TEMPLATE_MODES[0]
  const requestedTemplateTargets = useMemo(() => {
    const targets: Record<string, Partial<Record<TemplateMode, string>>> = {}
    requestedSkillMap.forEach((node) => {
      const patternSlug = patternToSlug(node.pattern)
      const patternTag = getTemplatePatternTag(node.pattern)
      targets[patternSlug] = {
        pseudo: normalizeTyping(buildPseudoTemplate(patternTag)),
        invariant: normalizeTyping(buildInvariantTemplate(patternTag)),
      }
    })
    return targets
  }, [requestedSkillMap])
  const requestedQuestionType = focusedPatternNode ? 'skill-map-targeted' : questionType
  const targetedMethodCount = requestedSkillMap.length
  const targetedDeckLabel = focusedPatternNode
    ? `${focusedPatternNode.pattern} • ${focusedTemplateMode ? TEMPLATE_MODE_LABELS[focusedTemplateMode] : 'Focused'} • ${targetedMethodCount} method${targetedMethodCount === 1 ? '' : 's'}`
    : ''

  const filteredDeck = useMemo(() => skillMapDeck, [skillMapDeck])
  const activeTemplateModes = useMemo(() => ensureTemplateModes(enabledTemplateModes), [enabledTemplateModes])
  const currentTemplateMode = activeTemplateModes[Math.min(currentTemplateModeIndex, activeTemplateModes.length - 1)] ?? 'algorithm'

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
      llmProvider,
    }

    try {
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

  const startSession = () => {
    setSessionOrder(Array.from({ length: filteredDeck.length }, (_, idx) => idx))
    setSessionPosition(0)
    setSessionFinished(false)
    setCurrentTemplateModeIndex(0)
    setCurrentCardTemplateResults({})
    setSessionResults({})
    setSessionAccuracyByCard({})
    setSessionElapsedByCard({})
    setSessionPlanRequested(false)

    setMainPhase('preview')
    setRecallMinHeight(undefined)
    setMainInput('')
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setCurrentInteractionId('')
    setMainRecallHistoryByCard({})
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    liveCoachRequestVersionRef.current = 0
    lastLiveCoachMilestoneRef.current = ''
    lastLiveCoachLengthRef.current = 0
    lastMainInputEditAtRef.current = 0
    lastIdleLiveCoachRefreshAtRef.current = 0
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSubmissionFailureModal(null)
    setSessionPlan(null)
    setSessionPlanLoading(false)
    setSessionPlanError('')
  }

  useEffect(() => {
    void fetchSkillMapDeck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmProvider, requestedQuestionType, requestedSkillMapSignature, requestedTemplateMode, skillMapRefreshToken])

  useEffect(() => {
    saveStoredLiveCoachTuning(liveCoachTuning)
  }, [liveCoachTuning])

  useEffect(() => {
    if (skillMapLoading) return
    startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillMapSessionVersion, skillMapLoading])

  useEffect(() => {
    if (!llmProviderMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!llmProviderMenuRef.current?.contains(event.target as Node)) {
        setLlmProviderMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLlmProviderMenuOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [llmProviderMenuOpen])

  const currentDeckIndex = sessionOrder[sessionPosition] ?? 0
  const card = filteredDeck[currentDeckIndex] ?? filteredDeck[0] ?? emptySkillMapCard
  const primaryPatternTag = useMemo(() => getPrimaryPatternTag(card.tags), [card.tags])
  const fullSolutionTarget = useMemo(
    () => normalizeTyping(card.solution.replace('{{missing}}', card.missing)),
    [card.missing, card.solution]
  )
  const invariantTarget = useMemo(
    () => buildInvariantTemplate(primaryPatternTag),
    [primaryPatternTag]
  )
  const pseudoTarget = useMemo(
    () => buildPseudoTemplate(primaryPatternTag),
    [primaryPatternTag]
  )
  const practiceTarget = useMemo(() => {
    const generatedTarget = card.templateTargets?.[currentTemplateMode]?.trim()
    if (generatedTarget) return normalizeTyping(generatedTarget)
    if (currentTemplateMode === 'pseudo') return normalizeTyping(pseudoTarget)
    if (currentTemplateMode === 'invariant') return normalizeTyping(invariantTarget)
    return fullSolutionTarget
  }, [card.templateTargets, currentTemplateMode, fullSolutionTarget, pseudoTarget, invariantTarget])
  const generatedPracticePrompt = card.templatePrompts?.[currentTemplateMode]?.trim() || card.prompt.trim()
  const practicePrompt = useMemo(
    () => generatedPracticePrompt || buildPracticePrompt(currentTemplateMode, primaryPatternTag),
    [currentTemplateMode, generatedPracticePrompt, primaryPatternTag]
  )
  const currentQuestionType = `${requestedQuestionType}:${currentTemplateMode}`
  const currentSkillTags = useMemo(
    () => [...card.tags, `template-${currentTemplateMode}`],
    [card.tags, currentTemplateMode]
  )
  currentCardIdRef.current = card.id

  const hasDeck = filteredDeck.length > 0
  const isGhostRepsEnabled = supportLayer === 'ghost-reps'
  const hasAnsweredCurrent = Object.prototype.hasOwnProperty.call(sessionResults, card.id)
  const sessionCounterText =
    sessionOrder.length === 0
      ? '0 / 0'
      : `${Math.min(sessionPosition + 1, Math.max(sessionOrder.length, 1))} / ${sessionOrder.length}`
  const practiceHistoryHref = useMemo(() => {
    if (!hasDeck) return '/practice-history'

    const searchParams = new URLSearchParams({
      cardId: card.id,
      cardTitle: card.title,
      questionType: currentQuestionType,
    })

    currentSkillTags.forEach((tag) => {
      searchParams.append('tag', tag)
    })

    return `/practice-history?${searchParams.toString()}`
  }, [card.id, card.title, currentQuestionType, currentSkillTags, hasDeck])
  const currentTemplateLabel = TEMPLATE_MODE_LABELS[currentTemplateMode]
  const nextTemplateMode = activeTemplateModes[currentTemplateModeIndex + 1] ?? null
  const hasNextTemplateMode = Boolean(nextTemplateMode)
  const practiceLanguage = currentTemplateMode === 'pseudo' ? 'text' : 'python'
  const practiceIntroText = {
    pseudo: 'Study the pseudocode outline, then hide it and describe the algorithm from memory.',
    invariant: 'Study the invariant scaffold, then hide it and rebuild it from memory.',
    algorithm: 'Study the full algorithm, then hide it and recall from memory.',
  }[currentTemplateMode]
  const practiceInputLabel = {
    pseudo: 'Write the pseudocode from memory',
    invariant: 'Write the invariant scaffold from memory',
    algorithm: 'Type the full algorithm from memory',
  }[currentTemplateMode]
  const supportedPracticeInputLabel = isGhostRepsEnabled
    ? `${practiceInputLabel} with Ghost Reps`
    : practiceInputLabel
  const practicePlaceholder = {
    pseudo: 'Write the algorithm in plain text or mixed Python and prose...',
    invariant: 'Write the invariant scaffold and comments from memory...',
    algorithm: 'Type the full algorithm from memory...',
  }[currentTemplateMode]
  const supportedPracticePlaceholder = isGhostRepsEnabled
    ? `Trace the faint ${currentTemplateLabel.toLowerCase()} target here...`
    : practicePlaceholder
  const startRecallLabel = {
    pseudo: 'Hide pseudocode and start recall',
    invariant: 'Hide invariant scaffold and start recall',
    algorithm: 'Hide algorithm and start recall',
  }[currentTemplateMode]
  const supportedStartRecallLabel = isGhostRepsEnabled
    ? `Start Ghost Reps for ${currentTemplateLabel}`
    : startRecallLabel
  const templateProgressText = `Practice order: ${activeTemplateModes.map((mode) => TEMPLATE_MODE_LABELS[mode]).join(' -> ')} · Current: ${currentTemplateLabel} ${currentTemplateModeIndex + 1}/${activeTemplateModes.length}`

  const completeCardInSession = (isCorrect: boolean, accuracy: number, elapsedMs?: number) => {
    setSessionResults((prevResults) => {
      const next = { ...prevResults, [card.id]: isCorrect }
      if (Object.keys(next).length >= sessionOrder.length) {
        setSessionFinished(true)
      }
      return next
    })
    setSessionAccuracyByCard((prev) => ({ ...prev, [card.id]: accuracy }))
    if (elapsedMs !== undefined) {
      setSessionElapsedByCard((prev) => ({ ...prev, [card.id]: elapsedMs }))
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
        accuracy: estimateTemplateAccuracy(currentTemplateMode, expectedAnswer, userAnswer),
        sound: currentTemplateMode === 'algorithm' ? userAnswer === expectedAnswer : false,
        syntaxValid: userAnswer.trim().length > 0,
      }
    }
  }

  const enqueueAdaptiveVariation = (drill: Flashcard, variationReason: string) => {
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
    setAdaptiveVariationNote(variationReason || 'Targeted repair variation queued next.')
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
          llmProvider,
        }),
      })
      if (!response.ok) throw new Error('Unable to generate adaptive variation')
      const variation = (await response.json()) as AdaptiveVariationResponse
      if (adaptiveVariationRequestKeyRef.current !== requestKey || currentCardIdRef.current !== card.id) return
      enqueueAdaptiveVariation(variation.drill, variation.variationReason)
    } catch {
      if (adaptiveVariationRequestKeyRef.current !== requestKey || currentCardIdRef.current !== card.id) return
      setAdaptiveVariationError('Targeted variation unavailable right now.')
    } finally {
      if (adaptiveVariationRequestKeyRef.current === requestKey && currentCardIdRef.current === card.id) {
        setAdaptiveVariationLoading(false)
      }
    }
  }

  const resetPerCardInteraction = () => {
    setCurrentTemplateModeIndex(0)
    setCurrentCardTemplateResults({})

    setMainPhase('preview')
    setRecallMinHeight(undefined)
    setMainInput('')
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setCurrentInteractionId('')
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setLiveCoachUsedThisAttempt(false)
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSubmissionFailureModal(null)
    setAdaptiveVariationLoading(false)
    setAdaptiveVariationError('')
    setAdaptiveVariationNote('')
    liveCoachRequestVersionRef.current = 0
    adaptiveVariationRequestKeyRef.current = ''
    lastLiveCoachMilestoneRef.current = ''
    lastLiveCoachLengthRef.current = 0
    lastMainInputEditAtRef.current = 0
    lastIdleLiveCoachRefreshAtRef.current = 0
  }

  const resetCurrentTemplateInteraction = () => {
    setMainPhase('preview')
    setRecallMinHeight(undefined)
    setMainInput('')
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setCurrentInteractionId('')
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setLiveCoachUsedThisAttempt(false)
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSubmissionFailureModal(null)
    liveCoachRequestVersionRef.current = 0
    lastLiveCoachMilestoneRef.current = ''
    lastLiveCoachLengthRef.current = 0
    lastMainInputEditAtRef.current = 0
    lastIdleLiveCoachRefreshAtRef.current = 0
  }

  const advanceToNextTemplateMode = () => {
    if (currentTemplateModeIndex >= activeTemplateModes.length - 1) return
    setCurrentTemplateModeIndex((prev) => Math.min(prev + 1, activeTemplateModes.length - 1))
    resetCurrentTemplateInteraction()
  }

  const toggleTemplateMode = (mode: TemplateMode) => {
    setEnabledTemplateModes((prev) => {
      const next = prev.includes(mode)
        ? prev.filter((item) => item !== mode)
        : [...prev, mode]
      return ensureTemplateModes(next)
    })
  }

  useEffect(() => {
    resetPerCardInteraction()
  }, [card.id, sessionPosition])

  useEffect(() => {
    if (!hasDeck || hasAnsweredCurrent || sessionFinished) return
    resetPerCardInteraction()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplateModes.join('|')])

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
    lastIdleLiveCoachRefreshAtRef.current = 0
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
          llmProvider,
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
          llmProvider,
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
          LLM_PROVIDER_OPTIONS.find((option) => option.value === llmProvider)?.label ?? 'LLM'
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
          llmProvider,
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
    if (!hasDeck || hasAnsweredCurrent || sessionFinished || mainPhase !== 'typing') return

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
    const historyKey = `${card.id}:${currentTemplateMode}`
    const currentHistory = mainRecallHistoryByCard[historyKey] ?? []
    const attemptSnapshot = summarizeRecallAttempt(
      normalizedInputLines,
      accuracy,
      sound,
      elapsedMs,
      currentHistory.length + 1,
      currentTemplateMode,
      supportLayer
    )
    const nextTemplateResults = closeEnough
      ? {
          ...currentCardTemplateResults,
          [currentTemplateMode]: { accuracy, elapsedMs, exact: sound },
        }
      : currentCardTemplateResults

    setMainCloseEnough(closeEnough)
    setMainPhase('submitted')
    setMainRecallHistoryByCard((prev) => ({
      ...prev,
      [historyKey]: [...(prev[historyKey] ?? []), attemptSnapshot],
    }))
    if (closeEnough) {
      setCurrentCardTemplateResults(nextTemplateResults)
    }

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

    if (!isGhostRep && !sound && feedback?.submissionRubric) {
      void requestAdaptiveVariation({
        interactionId,
        expectedAnswer: normalizedTarget,
        userAnswer: normalizedInput,
        submissionRubric: feedback.submissionRubric,
      })
    }

    if (!isGhostRep && closeEnough && currentTemplateModeIndex >= activeTemplateModes.length - 1) {
      const completedModes = activeTemplateModes
        .map((mode) => nextTemplateResults[mode])
        .filter((item): item is TemplateModeResult => Boolean(item))
      const aggregateAccuracy =
        completedModes.length > 0
          ? Math.round((completedModes.reduce((sum, item) => sum + item.accuracy, 0) / completedModes.length) * 10) / 10
          : accuracy
      const aggregateElapsedMs = completedModes.reduce((sum, item) => sum + item.elapsedMs, 0) || elapsedMs
      completeCardInSession(sound, aggregateAccuracy, aggregateElapsedMs)
    }
  }

  const reviseMainRecall = () => {
    if (!hasDeck || hasAnsweredCurrent || sessionFinished || mainPhase !== 'submitted' || mainCloseEnough) return
    setMainPhase('typing')
    setMainStartedAt(Date.now())
    setCurrentInteractionId(createInteractionId())
    lastMainInputEditAtRef.current = Date.now()
    lastIdleLiveCoachRefreshAtRef.current = 0
  }

  const repeatGhostRep = () => {
    if (!hasDeck || hasAnsweredCurrent || sessionFinished || mainPhase !== 'submitted') return
    setMainPhase('typing')
    setMainInput('')
    setMainStartedAt(Date.now())
    setMainCloseEnough(false)
    setCurrentInteractionId(createInteractionId())
    setCoachFeedback(null)
    setCoachError('')
    setSubmissionFailureModal(null)
    lastMainInputEditAtRef.current = Date.now()
    lastIdleLiveCoachRefreshAtRef.current = 0
  }

  const restartSession = () => {
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

  const canAdvance = hasAnsweredCurrent && !sessionFinished && sessionPosition < sessionOrder.length - 1
  const canGoNext = sessionPosition < sessionOrder.length - 1
  const canGoPrev = sessionPosition > 0

  useEffect(() => {
    if (!sessionFinished) return
    void fetchSessionPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFinished])

  const liveStructure = useMemo(
    () => analyzeLiveStructure(mainInput, currentTemplateMode),
    [currentTemplateMode, mainInput]
  )
  const lineReview = useMemo(
    () => computeLineReview(practiceTarget, mainInput.replace(/\r\n/g, '\n')),
    [practiceTarget, mainInput]
  )
  const currentCardRecallHistory = useMemo(
    () => mainRecallHistoryByCard[`${card.id}:${currentTemplateMode}`] ?? [],
    [card.id, currentTemplateMode, mainRecallHistoryByCard]
  )
  const displayLines = useMemo(() => {
    const source = mainPhase === 'submitted'
      ? (mainInput || '')
      : (mainInput || (isGhostRepsEnabled ? '' : `# ${practicePlaceholder}`))

    return source
      .split('\n')
      .map(
        (line, index): AnnotatedDisplayLine => ({
          text: line,
          sourceLineNumber: source.length > 0 ? index + 1 : null,
        })
      )
  }, [isGhostRepsEnabled, mainInput, mainPhase, practicePlaceholder])
  const displayCode = useMemo(
    () => displayLines.map((line) => line.text).join('\n'),
    [displayLines]
  )
  const liveCoachAffirmation = liveCoachFeedback?.affirmation?.trim() || ''
  const liveCoachNextStep =
    liveCoachFeedback?.nextMove ||
    liveCoachFeedback?.immediateCorrection ||
    liveCoachFeedback?.primaryFocus ||
    'Waiting for Signal Assessor output.'
  const liveCoachWhy =
    liveCoachFeedback?.why ||
    liveCoachFeedback?.diagnosis ||
    liveCoachFeedback?.primaryFocus ||
    'Live coaching requires a successful LLM response.'
  const triggerLiveCoachRefresh = useEffectEvent((trimmedInput: string) => {
    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const target = practiceTarget
    const accuracy = estimateTemplateAccuracy(currentTemplateMode, target, trimmedInput)

    lastLiveCoachMilestoneRef.current = liveStructure.milestoneKey
    lastLiveCoachLengthRef.current = trimmedInput.length

    void requestLiveCoachFeedback({
      interactionId,
      expectedAnswer: target,
      userAnswer: trimmedInput,
      elapsedMs: Math.max((mainStartedAt ? Date.now() - mainStartedAt : 0), 0),
      accuracy,
      exact: currentTemplateMode === 'algorithm' ? trimmedInput === target : false,
      previousAttempts: currentCardRecallHistory,
      liveStructure: liveStructure,
    })
  })
  const latestSubmittedAttempt =
    mainPhase === 'submitted' ? currentCardRecallHistory[currentCardRecallHistory.length - 1] ?? null : null
  const latestSubmittedWasGhostRep = latestSubmittedAttempt?.supportLayer === 'ghost-reps'

  useEffect(() => {
    if (mainPhase !== 'submitted' || !latestSubmittedWasGhostRep) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        repeatGhostRep()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mainPhase, latestSubmittedWasGhostRep])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'g' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSupportLayer((prev) => (prev === 'ghost-reps' ? 'none' : 'ghost-reps'))
      }
      if (event.key === 'l' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setLiveCoachTuning((prev) => ({ ...prev, enabled: !prev.enabled }))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const submissionFeedbackNextStep =
    coachFeedback?.immediateCorrection || coachFeedback?.primaryFocus || `Review the drifted step, then rewrite the ${currentTemplateMode} template once more.`
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
    ? hasNextTemplateMode && nextTemplateMode
      ? `${currentTemplateLabel} template recorded. Continue to ${TEMPLATE_MODE_LABELS[nextTemplateMode]}.`
      : `${currentTemplateLabel} template recorded.`
    : latestSubmittedWasGhostRep
      ? `Ghost rep logged for ${currentTemplateLabel}. Repeat it until the shape starts to stick.`
    : `This ${currentTemplateMode} attempt is not sound yet. Revise the logic and submit again.`
  const showSubmittedLineReview = mainPhase === 'submitted' && !mainCloseEnough && currentTemplateMode !== 'pseudo'

  useEffect(() => {
    if (liveCoachTuning.enabled) return
    liveCoachRequestVersionRef.current += 1
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setLiveCoachFeedback(null)
  }, [liveCoachTuning.enabled])

  useEffect(() => {
    if (!liveCoachTuning.enabled) return
    if (!hasDeck || mainPhase !== 'typing' || sessionFinished || hasAnsweredCurrent) return

    const trimmedInput = normalizeTyping(mainInput)
    if (trimmedInput.length < 12 || liveStructure.nonEmptyLines < 2) {
      setLiveCoachFeedback(null)
      setLiveCoachLoading(false)
      setLiveCoachError('')
      lastLiveCoachMilestoneRef.current = ''
      lastLiveCoachLengthRef.current = 0
      return
    }

    const shouldRefresh =
      liveStructure.milestoneKey !== lastLiveCoachMilestoneRef.current ||
      Math.abs(trimmedInput.length - lastLiveCoachLengthRef.current) >= liveCoachFrequencyProfile.milestoneCharDelta

    if (!shouldRefresh) return

    const timeoutId = window.setTimeout(() => {
      triggerLiveCoachRefresh(trimmedInput)
    }, liveCoachFrequencyProfile.debounceMs)

    return () => window.clearTimeout(timeoutId)
  }, [
    liveStructure,
    hasDeck,
    hasAnsweredCurrent,
    liveCoachFrequencyProfile.debounceMs,
    liveCoachFrequencyProfile.milestoneCharDelta,
    mainInput,
    mainPhase,
    sessionFinished,
    liveCoachTuning.enabled,
  ])

  useEffect(() => {
    if (!liveCoachTuning.enabled) return
    if (!hasDeck || mainPhase !== 'typing' || sessionFinished || hasAnsweredCurrent) return

    const intervalId = window.setInterval(() => {
      const trimmedInput = normalizeTyping(mainInput)
      if (trimmedInput.length < 12 || liveStructure.nonEmptyLines < 2) return

      const now = Date.now()
      const idleForMs = now - (lastMainInputEditAtRef.current || now)
      const sinceLastIdleRefreshMs = now - (lastIdleLiveCoachRefreshAtRef.current || 0)
      if (
        idleForMs < liveCoachFrequencyProfile.idleRefreshMs ||
        sinceLastIdleRefreshMs < liveCoachFrequencyProfile.idleRefreshMs
      ) return

      lastIdleLiveCoachRefreshAtRef.current = now
      triggerLiveCoachRefresh(trimmedInput)
    }, 2_000)

    return () => window.clearInterval(intervalId)
  }, [
    liveStructure.nonEmptyLines,
    hasDeck,
    hasAnsweredCurrent,
    liveCoachFrequencyProfile.idleRefreshMs,
    mainInput,
    mainPhase,
    sessionFinished,
    liveCoachTuning.enabled,
  ])

  return (
    <div className="app">
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
        llmProviderLabel={LLM_PROVIDER_OPTIONS.find((option) => option.value === llmProvider)?.label ?? 'ChatGPT'}
        llmProviderMenuOpen={llmProviderMenuOpen}
        onToggleLlmProviderMenu={() => setLlmProviderMenuOpen((open) => !open)}
        llmProviderMenuRef={llmProviderMenuRef}
        llmProviderMenu={
          llmProviderMenuOpen ? (
            <div className="navbar-picker-menu" role="listbox" aria-label="Coach model options">
              {LLM_PROVIDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={llmProvider === option.value}
                  className={llmProvider === option.value ? 'navbar-picker-option active' : 'navbar-picker-option'}
                  onClick={() => {
                    setLlmProvider(option.value)
                    setLlmProviderMenuOpen(false)
                  }}
                >
                  <span>{option.label}</span>
                  {llmProvider === option.value && <span className="navbar-picker-check">Active</span>}
                </button>
              ))}
            </div>
          ) : undefined
        }
        sessionCounterText={sessionCounterText}
        practiceHistoryHref={practiceHistoryHref}
      />

      <section className="card">
        <div className="card-header">
          <div className="card-header-main">
            <h2>{card.title}</h2>
            <p className="difficulty"><span className="leetcode-num">#{card.id}</span> {card.difficulty}</p>
            <p className="card-template-summary">{templateProgressText}</p>
            {focusedPatternNode && (
              <p className="card-template-summary">
                Focused deck: {targetedDeckLabel}
              </p>
            )}
          </div>
          <div className="card-header-side">
            <div className="template-mode-toggles" aria-label="Template modes">
              {TEMPLATE_MODE_ORDER.map((mode) => {
                const active = activeTemplateModes.includes(mode)
                const disabled = active && activeTemplateModes.length === 1
                return (
                  <button
                    key={mode}
                    type="button"
                    className={active ? 'template-mode-toggle active' : 'template-mode-toggle'}
                    onClick={() => toggleTemplateMode(mode)}
                    disabled={disabled}
                    aria-pressed={active}
                  >
                    {TEMPLATE_MODE_LABELS[mode]}
                  </button>
                )
              })}
            </div>
            <div className="support-layer-control" aria-label="Practice support controls">
              <button
                type="button"
                className={isGhostRepsEnabled ? 'navbar-toggle active' : 'navbar-toggle'}
                onClick={() => setSupportLayer(isGhostRepsEnabled ? 'none' : 'ghost-reps')}
                aria-pressed={isGhostRepsEnabled}
                aria-label={isGhostRepsEnabled ? 'Turn Ghost Reps off' : 'Turn Ghost Reps on'}
              >
                <span className="navbar-toggle-label">Ghost Reps</span>
                <span className={isGhostRepsEnabled ? 'navbar-toggle-state on' : 'navbar-toggle-state off'}>
                  {isGhostRepsEnabled ? 'On' : 'Off'}
                </span>
              </button>
              <button
                type="button"
                className={liveCoachTuning.enabled ? 'navbar-toggle active' : 'navbar-toggle'}
                onClick={toggleLiveFeedback}
                aria-pressed={liveCoachTuning.enabled}
                aria-label={liveCoachTuning.enabled ? 'Turn live feedback off' : 'Turn live feedback on'}
              >
                <span className="navbar-toggle-label">Live</span>
                <span className={liveCoachTuning.enabled ? 'navbar-toggle-state on' : 'navbar-toggle-state off'}>
                  {liveCoachTuning.enabled ? 'On' : 'Off'}
                </span>
              </button>
            </div>
            <div className="tags">
              {card.tags.map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          </div>
        </div>

        {sessionFinished && (
          <p className="status success" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            Session complete. {correctCount} of {attempts} cards were sound. Avg score: {avgAccuracy}%.
          </p>
        )}
        {sessionFinished && (
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
            <h3>Prompt</h3>
            {!hasDeck ? (
              skillMapLoading ? (
                <div className="skeleton-group">
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w80" />
                  <div className="skeleton-line w60" />
                </div>
              ) : (
                <>
                  <p className="prompt">The skill-map deck is unavailable right now.</p>
                  <p className="hint">{skillMapError || 'Try restarting the session to request another generated deck.'}</p>
                </>
              )
            ) : (
              <div className="drill-fade-in">
                <p className="prompt">{practicePrompt}</p>
              </div>
            )}
          </div>

          <div className="panel">
            <h3>Main Recall Flow</h3>
            {!hasDeck ? (
              skillMapLoading ? (
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
                  {skillMapError || 'No drills are available yet.'}
                </div>
              )
            ) : mainPhase === 'preview' && (
              <div className="drill-fade-in">
                <p className="answer-label">{practiceIntroText}</p>
                <div className="code-container" ref={previewCodeContainerRef}>
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
                </div>
                <div className="actions">
                  <button onClick={startMainRecall} disabled={!hasDeck || hasAnsweredCurrent || sessionFinished}>{supportedStartRecallLabel}</button>
                </div>
              </div>
            )}

            {hasDeck && mainPhase !== 'preview' && (
              <>
                <label className="answer-label" htmlFor="main-recall-input">
                  {supportedPracticeInputLabel}
                </label>
                <div className="code-container recall-editor-container" style={recallMinHeight ? { minHeight: recallMinHeight } : undefined}>
                  <div className="typing-editor-shell">
                    <div className="typing-editor no-gutter">
                      <div className="typing-code-area">
                        {mainPhase === 'typing' && isGhostRepsEnabled && (
                          <div className="typing-ghost-target" aria-hidden="true" ref={mainGhostRef}>
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
                          </div>
                        )}
                        <div className="typing-highlight" aria-hidden="true" ref={mainHighlightRef}>
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
                              return {
                                className: `typing-highlight-line${status ? ` line-${status}` : ''}`,
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
                    {mainPhase === 'typing' && liveCoachTuning.enabled && (
                      <div className="coach-docked-panel coach-docked-panel-idle">
                        <div className="coach-docked-card">
                          <div className="coach-card-header">
                            <h4>Live Feedback</h4>
                            {liveCoachTuning.enabled && (
                              <span
                                className="live-coach-indicator"
                                aria-label={liveCoachLoading ? 'Live coach refreshing' : 'Live coach active'}
                              >
                                <span className="live-coach-dot" />
                              </span>
                            )}
                          </div>
                          {!liveCoachTuning.enabled && (
                            <p className="hint" style={{ margin: 0 }}>
                              Live feedback is paused. No live feedback requests will be sent until you resume it.
                            </p>
                          )}
                          {liveCoachTuning.enabled && (
                            <>
                              {liveCoachAffirmation && (
                                <div className="coach-live-block">
                                  <p className="coach-live-label">Affirmation</p>
                                  <p className="coach-panel-copy">{liveCoachAffirmation}</p>
                                </div>
                              )}
                              <div className="coach-live-block">
                                <p className="coach-live-label">Next move</p>
                                <p className="coach-panel-copy">{liveCoachNextStep}</p>
                              </div>
                              <div className="coach-live-block">
                                <p className="coach-live-label">Why</p>
                                <p className="coach-panel-copy">{liveCoachWhy}</p>
                              </div>
                              {liveCoachError && <p className="coach-error">{liveCoachError}</p>}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {mainPhase === 'submitted' && (
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
                              {adaptiveVariationLoading && (
                                <p className="coach-muted">Building a targeted repair variation...</p>
                              )}
                              {adaptiveVariationNote && (
                                <p className="coach-muted">
                                  <strong>Queued next:</strong> {adaptiveVariationNote}
                                </p>
                              )}
                              {adaptiveVariationError && <p className="coach-error">{adaptiveVariationError}</p>}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <p className="typing-help">
                  {isGhostRepsEnabled
                    ? <>Ghost Reps are saved as supported work · trace the faint target as many times as needed · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to log</>
                    : currentTemplateMode === 'pseudo'
                      ? <>Plain text or Python-like notes both work here · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to submit</>
                      : <>Tab inserts 4 spaces · Shift+Tab outdents · Enter auto-indents · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to submit</>}
                </p>
                {mainPhase === 'typing' && (
                  <div className="actions">
                    <button onClick={submitMainRecall} disabled={mainInput.trim().length === 0}>
                      {isGhostRepsEnabled ? 'Log ghost rep' : `Submit ${currentTemplateLabel.toLowerCase()}`}
                    </button>
                  </div>
                )}
                {mainPhase === 'submitted' && latestSubmittedWasGhostRep && (
                  <div className="actions">
                    <button onClick={repeatGhostRep} disabled={sessionFinished}>Log another ghost rep</button>
                  </div>
                )}
                {mainPhase === 'submitted' && !mainCloseEnough && !latestSubmittedWasGhostRep && (
                  <div className="actions">
                    <button onClick={reviseMainRecall} disabled={sessionFinished}>Revise and resubmit</button>
                  </div>
                )}
                {mainPhase === 'submitted' && mainCloseEnough && hasNextTemplateMode && nextTemplateMode && (
                  <div className="actions">
                    <button onClick={advanceToNextTemplateMode} disabled={sessionFinished}>
                      Continue to {TEMPLATE_MODE_LABELS[nextTemplateMode]}
                    </button>
                  </div>
                )}
              </>
            )}

            {hasDeck && canAdvance && (
              <div className="actions" style={{ marginTop: '0.5rem' }}>
                <button className="secondary" onClick={goNext}>Next card →</button>
              </div>
            )}
          </div>
        </div>

        <div className="card-footer">
          <div className="card-footer-left">
            <button className="secondary" onClick={goPrev} disabled={!canGoPrev}>
              <kbd>←</kbd> Previous
            </button>
            <button className="secondary" onClick={goNext} disabled={!canGoNext}>
              Next <kbd>→</kbd>
            </button>
            <button className="secondary" onClick={restartSession}>
              Regenerate session
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
