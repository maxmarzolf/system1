import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Flashcard } from './data/flashcards'
import { skillMap } from './data/skill-map'
import { getLiveCoachFrequencyProfile, loadStoredLiveCoachTuning } from './liveCoachTuning'

const emptySkillMapCard: Flashcard = {
  id: 'skill-map-loading',
  title: 'Skill Map Drill',
  difficulty: 'Easy',
  prompt: 'Generate a fresh set of atomic recall drills from the layered skill map.',
  solution: 'def solve():\n    {{missing}}',
  missing: 'pass',
  hint: 'Regenerate the session to request a fresh generated deck.',
  tags: ['skill-map'],
}

type SessionOrder = 'shuffled' | 'original'
type TemplateMode = 'pseudo' | 'skeleton' | 'full'
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
  coachFeedback?: CoachAttemptFeedback | null
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
  drillDownActive?: boolean
  drillDownTitle?: string
  drillDownPrompt?: string
  drillDownQuestion?: string
  drillDownTarget?: string
  drillDownHint?: string
  drillDownKey?: string
  drillDownOverrideLabel?: string
  llmUsed: boolean
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
  usedPlaceholder: boolean
  hasGuard: boolean
  hasBookkeeping: boolean
  hasTraversal: boolean
  hasLoop: boolean
}

type DraftStructure = {
  nonEmptyLines: number
  hasSignature: boolean
  hasGuard: boolean
  traversalKind: 'dfs' | 'bfs' | 'queue' | 'stack' | null
  hasLoop: boolean
  hasPlaceholder: boolean
  hasBookkeeping: boolean
  milestoneKey: string
}

type FocusDrillPhase = 'preview' | 'typing' | 'submitted'
type LlmProvider = 'openai' | 'claude'

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiUrl = (path: string) => `${API_BASE_URL}${path}`
const MAIN_RECALL_CLOSE_ENOUGH_ACCURACY = 90
const TEMPLATE_MODE_ORDER: TemplateMode[] = ['pseudo', 'skeleton', 'full']
const DEFAULT_TEMPLATE_MODES: TemplateMode[] = ['full']
const TEMPLATE_MODE_LABELS: Record<TemplateMode, string> = {
  pseudo: 'Pseudo',
  skeleton: 'Skeleton',
  full: 'Full',
}
const TEMPLATE_MODE_FILE_LABELS: Record<TemplateMode, string> = {
  pseudo: 'recall.txt',
  skeleton: 'skeleton.py',
  full: 'recall.py',
}

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

const shuffle = <T,>(array: T[]): T[] => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
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
  if (templateMode === 'full') {
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
        'Return the fallback answer if no pair works',
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

const buildSkeletonTemplate = (patternTag: string) => {
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

const stripPrefixedLabel = (text: string, label: string) =>
  text.replace(new RegExp(`^${label}:\\s*`, 'i'), '').trim()

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
  templateMode: TemplateMode
): RecallAttemptSnapshot => ({
  attemptNumber,
  accuracy,
  exact,
  elapsedMs,
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

const analyzeDraftStructure = (code: string, templateMode: TemplateMode): DraftStructure => {
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

const buildLiveCoachFallback = (draft: DraftStructure, isGraphQuestion: boolean) => {
  if (isGraphQuestion) {
    if (!draft.hasSignature) return 'The very next step is to write the function signature and name the graph inputs you will reason about.'
    if (!draft.hasBookkeeping) return 'The very next step is to add the visited or frontier state right under the signature.'
    if (!draft.traversalKind) return 'The very next step is to choose DFS or BFS and write the line that creates that traversal.'
    if (draft.hasPlaceholder) return 'The very next step is to replace the placeholder with the real state update.'
    if (!draft.hasGuard) return 'The very next step is to add the guard that skips invalid or already-seen states.'
    if (!draft.hasLoop) return 'The very next step is to write the loop or recursive call that advances the traversal once.'
    return 'The very next step is to add one concrete state-update line and then check that the traversal invariant still holds.'
  }

  if (!draft.hasSignature) return 'The very next step is to write the function signature and name the state you will track.'
  if (draft.hasPlaceholder) return 'The very next step is to replace the placeholder with the actual state transition.'
  if (!draft.hasLoop) return 'The very next step is to write the main loop or recursive call that moves the algorithm forward.'
  return 'The very next step is to add one concrete state-update line instead of expanding the whole solution at once.'
}

const buildLiveCoachWhy = (draft: DraftStructure, isGraphQuestion: boolean) => {
  if (isGraphQuestion) {
    if (!draft.hasSignature) return 'Once the opening anchor is on the page, the rest of the graph logic has somewhere stable to attach.'
    if (!draft.hasBookkeeping) return 'Right now the traversal has no concrete state to update, so extra control flow will feel vague.'
    if (!draft.traversalKind) return 'Committing to the traversal first makes every later line easier to justify.'
    if (draft.hasPlaceholder) return 'A placeholder hides the real algorithmic move, so the draft cannot become trustworthy yet.'
    if (!draft.hasGuard) return 'The stop or skip rule usually makes graph code feel immediately cleaner.'
    if (!draft.hasLoop) return 'You already have enough setup; now the draft needs motion.'
    return 'You are close enough that one good structural line is more valuable than a rewrite.'
  }

  if (!draft.hasSignature) return 'A clear entry point makes the rest of the draft easier to reason about.'
  if (draft.hasPlaceholder) return 'The placeholder is the one spot where the algorithm still is not real.'
  if (!draft.hasLoop) return 'The setup is there; now the algorithm needs one line of movement.'
  return 'At this point, a single concrete line will help more than broad advice.'
}

const buildLiveCoachPrinciple = (draft: DraftStructure, tags: string[], isGraphQuestion: boolean) => {
  if (isGraphQuestion) {
    if (draft.traversalKind === 'dfs') {
      return 'In graph DFS, decide exactly when a node becomes visited and do that before exploring neighbors.'
    }
    if (draft.traversalKind === 'bfs' || draft.traversalKind === 'queue') {
      return 'In graph BFS, initialize the frontier with valid start states, then pop one item at a time and enqueue only unseen neighbors.'
    }
    if (draft.traversalKind === 'stack') {
      return 'In iterative graph traversals, the stack only works if your visited rule is consistent from the moment a node is scheduled.'
    }
    return 'For graph problems, three things are almost always worth deciding early: representation, visited rule, and how neighbors enter the frontier.'
  }

  if (tags.includes('sliding-window')) {
    if (draft.hasLoop) {
      return 'In sliding window, the rhythm is expand, restore validity, then score the valid window.'
    }
    return 'In sliding window, every line should support one of three jobs: expand, restore validity, or score.'
  }

  if (tags.includes('two-pointers')) {
    return 'With two pointers, each comparison should justify moving exactly one side of the search.'
  }

  if (tags.includes('binary-search')) {
    return 'In binary search, protect the interval invariant first and let every bound update follow from that meaning.'
  }

  return 'A strong interview habit is to make the invariant explicit before you optimize the code around it.'
}

const buildGraphCoachHeadline = (
  actualLines: string[],
  reviews: LineReview[],
  history: RecallAttemptSnapshot[]
) => {
  const latestPrevious = history[history.length - 1]

  if (actualLines.some((line) => isPlaceholderLine(line))) {
    if (latestPrevious?.usedPlaceholder) {
      return 'For graph problems, stop repeating placeholders and make the traversal state explicit.'
    }
    return 'For graph problems, lock down the model and traversal invariant before coding details.'
  }

  if (
    latestPrevious &&
    !latestPrevious.hasTraversal &&
    actualLines.some((line) => /\bdfs\b|\bbfs\b|queue|deque|stack/.test(line))
  ) {
    return 'Better. Now keep the graph bookkeeping as explicit as the traversal choice.'
  }

  if (
    reviews.some(
      (review) =>
        review.status !== 'match' &&
        /(graph|visited|indegree|queue|deque|stack|\bm\b|\bn\b)/.test(
          `${review.actual} ${review.expected}`
        )
    )
  ) {
    return 'For graph problems, get the bookkeeping right first: representation, visited rule, and start states.'
  }

  return 'For graph problems, lead with the model, the visited rule, and neighbor expansion.'
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
  const questionType = 'skill-map' as const
  const [sessionOrderType, setSessionOrderType] = useState<SessionOrder>('original')
  const [enabledTemplateModes, setEnabledTemplateModes] = useState<TemplateMode[]>(() => [...DEFAULT_TEMPLATE_MODES])
  const [skillMapDeck, setSkillMapDeck] = useState<Flashcard[]>([])
  const [skillMapLoading, setSkillMapLoading] = useState(false)
  const [skillMapError, setSkillMapError] = useState('')
  const [skillMapRefreshToken, setSkillMapRefreshToken] = useState(0)

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

  const [showHint, setShowHint] = useState(false)

  const [mainPhase, setMainPhase] = useState<'preview' | 'typing' | 'submitted'>('preview')
  const [mainInput, setMainInput] = useState('')
  const [mainStartedAt, setMainStartedAt] = useState<number | null>(null)
  const [mainCloseEnough, setMainCloseEnough] = useState(false)
  const [currentInteractionId, setCurrentInteractionId] = useState('')
  const [mainRecallHistoryByCard, setMainRecallHistoryByCard] = useState<Record<string, RecallAttemptSnapshot[]>>({})
  const [liveCoachFeedback, setLiveCoachFeedback] = useState<CoachAttemptFeedback | null>(null)
  const [liveCoachLoading, setLiveCoachLoading] = useState(false)
  const [liveCoachError, setLiveCoachError] = useState('')
  const liveCoachTuning = useMemo(() => loadStoredLiveCoachTuning(), [])
  const liveCoachFrequencyProfile = useMemo(
    () => getLiveCoachFrequencyProfile(liveCoachTuning.feedbackFrequency),
    [liveCoachTuning]
  )
  const [ignoredDrillDownKey, setIgnoredDrillDownKey] = useState('')
  const [completedDrillDownKey, setCompletedDrillDownKey] = useState('')
  const [focusDrillPhase, setFocusDrillPhase] = useState<FocusDrillPhase>('preview')
  const [focusDrillInput, setFocusDrillInput] = useState('')
  const [focusDrillAccuracy, setFocusDrillAccuracy] = useState(0)
  const [focusDrillExact, setFocusDrillExact] = useState(false)
  const [coachFeedback, setCoachFeedback] = useState<CoachAttemptFeedback | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState('')
  const [sessionPlan, setSessionPlan] = useState<CoachSessionPlan | null>(null)
  const [sessionPlanLoading, setSessionPlanLoading] = useState(false)
  const [sessionPlanError, setSessionPlanError] = useState('')
  const mainInputRef = useRef<HTMLTextAreaElement | null>(null)
  const mainHighlightRef = useRef<HTMLDivElement | null>(null)
  const mainGutterRef = useRef<HTMLDivElement | null>(null)
  const currentCardIdRef = useRef('')
  const liveCoachRequestVersionRef = useRef(0)
  const lastLiveCoachMilestoneRef = useRef('')
  const lastLiveCoachLengthRef = useRef(0)
  const lastMainInputEditAtRef = useRef(0)
  const lastIdleLiveCoachRefreshAtRef = useRef(0)
  const currentDrillDownKeyRef = useRef('')
  const coachRequestVersionRef = useRef(0)
  const skillMapDeckRequestVersionRef = useRef(0)

  const filteredDeck = useMemo(() => skillMapDeck, [skillMapDeck])
  const activeTemplateModes = useMemo(() => ensureTemplateModes(enabledTemplateModes), [enabledTemplateModes])
  const currentTemplateMode = activeTemplateModes[Math.min(currentTemplateModeIndex, activeTemplateModes.length - 1)] ?? 'full'

  const fetchSkillMapDeck = async () => {
    skillMapDeckRequestVersionRef.current += 1
    const requestVersion = skillMapDeckRequestVersionRef.current
    setSkillMapLoading(true)
    setSkillMapError('')
    setSkillMapDeck([])

    try {
      const response = await fetch(apiUrl('/api/coach/skill-map-drills'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionType: 'skill-map',
          count: skillMap.length,
          skillMap,
          llmProvider,
        }),
      })
      if (!response.ok) throw new Error('Unable to generate skill map drills')
      const payload = (await response.json()) as SkillMapDrillsResponse
      if (skillMapDeckRequestVersionRef.current !== requestVersion) return
      setSkillMapDeck(payload.drills)
    } catch {
      if (skillMapDeckRequestVersionRef.current !== requestVersion) return
      setSkillMapDeck([])
      setSkillMapError('Skill map drill generation is unavailable right now.')
    } finally {
      if (skillMapDeckRequestVersionRef.current === requestVersion) {
        setSkillMapLoading(false)
      }
    }
  }

  const startSession = () => {
    const baseOrder = Array.from({ length: filteredDeck.length }, (_, idx) => idx)
    const nextOrder = sessionOrderType === 'shuffled' ? shuffle(baseOrder) : baseOrder

    setSessionOrder(nextOrder)
    setSessionPosition(0)
    setSessionFinished(false)
    setCurrentTemplateModeIndex(0)
    setCurrentCardTemplateResults({})
    setSessionResults({})
    setSessionAccuracyByCard({})
    setSessionElapsedByCard({})
    setSessionPlanRequested(false)

    setShowHint(false)

    setMainPhase('preview')
    setMainInput('')
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setCurrentInteractionId('')
    setMainRecallHistoryByCard({})
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setIgnoredDrillDownKey('')
    setCompletedDrillDownKey('')
    setFocusDrillPhase('preview')
    setFocusDrillInput('')
    setFocusDrillAccuracy(0)
    setFocusDrillExact(false)
    liveCoachRequestVersionRef.current = 0
    lastLiveCoachMilestoneRef.current = ''
    lastLiveCoachLengthRef.current = 0
    lastMainInputEditAtRef.current = 0
    lastIdleLiveCoachRefreshAtRef.current = 0
    currentDrillDownKeyRef.current = ''
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSessionPlan(null)
    setSessionPlanLoading(false)
    setSessionPlanError('')
  }

  useEffect(() => {
    void fetchSkillMapDeck()
  }, [llmProvider, skillMapRefreshToken])

  useEffect(() => {
    if (skillMapLoading) return
    startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredDeck, sessionOrderType, skillMapLoading])

  const currentDeckIndex = sessionOrder[sessionPosition] ?? 0
  const card = filteredDeck[currentDeckIndex] ?? filteredDeck[0] ?? emptySkillMapCard
  const primaryPatternTag = useMemo(() => getPrimaryPatternTag(card.tags), [card.tags])
  const fullSolutionTarget = useMemo(
    () => normalizeTyping(card.solution.replace('{{missing}}', card.missing)),
    [card.missing, card.solution]
  )
  const skeletonTarget = useMemo(
    () => buildSkeletonTemplate(primaryPatternTag),
    [primaryPatternTag]
  )
  const pseudoTarget = useMemo(
    () => buildPseudoTemplate(primaryPatternTag),
    [primaryPatternTag]
  )
  const practiceTarget = useMemo(() => {
    if (currentTemplateMode === 'pseudo') return normalizeTyping(pseudoTarget)
    if (currentTemplateMode === 'skeleton') return normalizeTyping(skeletonTarget)
    return fullSolutionTarget
  }, [currentTemplateMode, fullSolutionTarget, pseudoTarget, skeletonTarget])
  const currentQuestionType = `${questionType}:${currentTemplateMode}`
  const currentSkillTags = useMemo(
    () => [...card.tags, `template-${currentTemplateMode}`],
    [card.tags, currentTemplateMode]
  )
  currentCardIdRef.current = card.id

  const hasDeck = filteredDeck.length > 0
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
  const practiceTabLabel = TEMPLATE_MODE_FILE_LABELS[currentTemplateMode]
  const practiceIntroText = {
    pseudo: 'Study the pseudocode outline, then hide it and describe the algorithm from memory.',
    skeleton: 'Study the skeleton, then hide it and rebuild the invariant scaffold from memory.',
    full: 'Study the full answer, then hide it and recall from memory.',
  }[currentTemplateMode]
  const practiceInputLabel = {
    pseudo: 'Write the pseudocode from memory',
    skeleton: 'Write the skeleton from memory',
    full: 'Type the full answer from memory',
  }[currentTemplateMode]
  const practicePlaceholder = {
    pseudo: 'Write the algorithm in plain text or mixed Python and prose...',
    skeleton: 'Write the skeleton and invariant comments from memory...',
    full: 'Type the full solution from memory...',
  }[currentTemplateMode]
  const startRecallLabel = {
    pseudo: 'Hide pseudocode and start recall',
    skeleton: 'Hide skeleton and start recall',
    full: 'Hide answer and start recall',
  }[currentTemplateMode]
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
          question: card.prompt,
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
          generatedCard: card,
          coachFeedback: payload.coachFeedback ?? null,
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
        }),
      })
      if (!response.ok) throw new Error('Unable to evaluate attempt')
      return (await response.json()) as AttemptEvaluationResponse
    } catch {
      return {
        accuracy: estimateTemplateAccuracy(currentTemplateMode, expectedAnswer, userAnswer),
        sound: currentTemplateMode === 'full' ? userAnswer === expectedAnswer : false,
        syntaxValid: userAnswer.trim().length > 0,
      }
    }
  }

  const resetPerCardInteraction = () => {
    setShowHint(false)
    setCurrentTemplateModeIndex(0)
    setCurrentCardTemplateResults({})

    setMainPhase('preview')
    setMainInput('')
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setCurrentInteractionId('')
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setIgnoredDrillDownKey('')
    setCompletedDrillDownKey('')
    setFocusDrillPhase('preview')
    setFocusDrillInput('')
    setFocusDrillAccuracy(0)
    setFocusDrillExact(false)
    liveCoachRequestVersionRef.current = 0
    lastLiveCoachMilestoneRef.current = ''
    lastLiveCoachLengthRef.current = 0
    lastMainInputEditAtRef.current = 0
    lastIdleLiveCoachRefreshAtRef.current = 0
    currentDrillDownKeyRef.current = ''
  }

  const resetCurrentTemplateInteraction = () => {
    setMainPhase('preview')
    setMainInput('')
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setCurrentInteractionId('')
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setIgnoredDrillDownKey('')
    setCompletedDrillDownKey('')
    setFocusDrillPhase('preview')
    setFocusDrillInput('')
    setFocusDrillAccuracy(0)
    setFocusDrillExact(false)
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    liveCoachRequestVersionRef.current = 0
    lastLiveCoachMilestoneRef.current = ''
    lastLiveCoachLengthRef.current = 0
    lastMainInputEditAtRef.current = 0
    lastIdleLiveCoachRefreshAtRef.current = 0
    currentDrillDownKeyRef.current = ''
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
    setMainPhase('typing')
    setMainStartedAt(Date.now())
    setMainInput('')
    setCurrentInteractionId(createInteractionId())
    setIgnoredDrillDownKey('')
    setCompletedDrillDownKey('')
    setFocusDrillPhase('preview')
    setFocusDrillInput('')
    setFocusDrillAccuracy(0)
    setFocusDrillExact(false)
    lastMainInputEditAtRef.current = Date.now()
    lastIdleLiveCoachRefreshAtRef.current = 0
    currentDrillDownKeyRef.current = ''
  }

  const handleMainEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (mainHighlightRef.current) {
      mainHighlightRef.current.scrollTop = e.currentTarget.scrollTop
      mainHighlightRef.current.scrollLeft = e.currentTarget.scrollLeft
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
    if (mainPhase !== 'typing') return

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (mainInput.trim().length > 0) submitMainRecall()
      return
    }

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
    draft: DraftStructure
  }) => {
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
          prompt: card.prompt,
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
          draftMode: true,
          draftMilestones: {
            nonEmptyLines: payload.draft.nonEmptyLines,
            hasSignature: payload.draft.hasSignature,
            hasGuard: payload.draft.hasGuard,
            traversalKind: payload.draft.traversalKind ?? '',
            hasLoop: payload.draft.hasLoop,
            hasPlaceholder: payload.draft.hasPlaceholder,
            hasBookkeeping: payload.draft.hasBookkeeping,
          },
          liveCoachTuning,
          liveCoachContext: {
            ignoredDrillDownKey,
            completedDrillDownKey,
          },
          llmProvider,
        }),
      })
      if (!response.ok) throw new Error('Unable to load live coach feedback')
      const feedback = (await response.json()) as CoachAttemptFeedback
      if (currentCardIdRef.current !== requestCardId || liveCoachRequestVersionRef.current !== requestVersion) return
      setLiveCoachFeedback(feedback)
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
    setCoachLoading(true)
    setCoachError('')
    try {
      const response = await fetch(apiUrl('/api/coach/attempt-feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          cardTitle: card.title,
          prompt: card.prompt,
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
        }),
      })
      if (!response.ok) throw new Error('Unable to load coach feedback')
      const feedback = (await response.json()) as CoachAttemptFeedback
      if (currentCardIdRef.current !== requestCardId || coachRequestVersionRef.current !== requestVersion) return null
      let resolvedFeedback: CoachAttemptFeedback | null = feedback
      setCoachFeedback((prev) => {
        if (prev?.llmUsed && !feedback.llmUsed) {
          resolvedFeedback = prev
          return prev
        }
        return feedback
      })
      return resolvedFeedback
    } catch {
      if (currentCardIdRef.current !== requestCardId || coachRequestVersionRef.current !== requestVersion) return null
      setCoachError('Coach feedback unavailable for this attempt.')
      setCoachFeedback((prev) => (prev?.llmUsed ? prev : null))
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
          questionType,
          orderType: sessionOrderType,
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
    const closeEnough = sound
    const historyKey = `${card.id}:${currentTemplateMode}`
    const currentHistory = mainRecallHistoryByCard[historyKey] ?? []
    const attemptSnapshot = summarizeRecallAttempt(
      normalizedInputLines,
      accuracy,
      sound,
      elapsedMs,
      currentHistory.length + 1,
      currentTemplateMode
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

    const feedback = await fetchCoachAttemptFeedback({
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
      coachFeedback: feedback,
    })

    if (closeEnough && currentTemplateModeIndex >= activeTemplateModes.length - 1) {
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
    setIgnoredDrillDownKey('')
    setCompletedDrillDownKey('')
    setFocusDrillPhase('preview')
    setFocusDrillInput('')
    setFocusDrillAccuracy(0)
    setFocusDrillExact(false)
    lastMainInputEditAtRef.current = Date.now()
    lastIdleLiveCoachRefreshAtRef.current = 0
    currentDrillDownKeyRef.current = ''
  }

  const ignoreLiveCoachDrillDown = () => {
    const key = liveCoachFeedback?.drillDownKey?.trim()
    if (!key) return
    setIgnoredDrillDownKey(key)
    setLiveCoachFeedback((prev) =>
      prev
        ? {
            ...prev,
            drillDownActive: false,
            drillDownTitle: '',
            drillDownPrompt: '',
            drillDownOverrideLabel: '',
          }
        : prev
    )
  }

  const startFocusDrill = () => {
    if (!liveCoachDrillDownTarget) return
    setFocusDrillPhase('typing')
    setFocusDrillInput('')
    setFocusDrillAccuracy(0)
    setFocusDrillExact(false)
  }

  const submitFocusDrill = () => {
    if (!liveCoachDrillDownTarget) return
    const normalizedInput = normalizeTyping(focusDrillInput)
    const compareLength = Math.max(normalizedInput.length, liveCoachDrillDownTarget.length, 1)
    let exactMatches = 0
    for (let i = 0; i < compareLength; i += 1) {
      if (normalizedInput[i] === liveCoachDrillDownTarget[i]) exactMatches += 1
    }
    const accuracy = Math.round((exactMatches / compareLength) * 100)
    const exact = normalizedInput === liveCoachDrillDownTarget

    setFocusDrillAccuracy(accuracy)
    setFocusDrillExact(exact)
    setFocusDrillPhase('submitted')

    if (accuracy >= MAIN_RECALL_CLOSE_ENOUGH_ACCURACY && liveCoachDrillDownKey) {
      setCompletedDrillDownKey(liveCoachDrillDownKey)
      setLiveCoachFeedback((prev) =>
        prev
          ? {
              ...prev,
              drillDownActive: false,
              drillDownTitle: '',
              drillDownPrompt: '',
              drillDownQuestion: '',
              drillDownHint: '',
              drillDownOverrideLabel: '',
            }
          : prev
      )
    }
  }

  const retryFocusDrill = () => {
    setFocusDrillPhase('typing')
    setFocusDrillInput('')
    setFocusDrillAccuracy(0)
    setFocusDrillExact(false)
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

  const normalizedMainLines = useMemo(
    () => mainInput.replace(/\r\n/g, '\n').split('\n'),
    [mainInput]
  )
  const draftStructure = useMemo(
    () => analyzeDraftStructure(mainInput, currentTemplateMode),
    [currentTemplateMode, mainInput]
  )
  const lineReview = useMemo(
    () => computeLineReview(practiceTarget, mainInput.replace(/\r\n/g, '\n')),
    [practiceTarget, mainInput]
  )
  const isGraphQuestion =
    card.tags.includes('graph') || card.tags.includes('graph-bfs')
  const currentCardRecallHistory = useMemo(
    () => mainRecallHistoryByCard[`${card.id}:${currentTemplateMode}`] ?? [],
    [card.id, currentTemplateMode, mainRecallHistoryByCard]
  )
  const priorCardRecallHistory =
    mainPhase === 'submitted' ? currentCardRecallHistory.slice(0, -1) : currentCardRecallHistory
  const displayLines = useMemo(() => {
    const source = mainPhase === 'submitted'
      ? (mainInput || '')
      : (mainInput || `# ${practicePlaceholder}`)

    return source
      .split('\n')
      .map(
        (line, index): AnnotatedDisplayLine => ({
          text: line,
          sourceLineNumber: source.length > 0 ? index + 1 : null,
        })
      )
  }, [mainInput, mainPhase, practicePlaceholder])
  const displayCode = useMemo(
    () => displayLines.map((line) => line.text).join('\n'),
    [displayLines]
  )
  const liveCoachAffirmation = liveCoachFeedback?.affirmation?.trim() || ''
  const liveCoachNextStep =
    liveCoachFeedback?.nextMove ||
    liveCoachFeedback?.immediateCorrection ||
    liveCoachFeedback?.primaryFocus ||
    buildLiveCoachFallback(draftStructure, isGraphQuestion)
  const liveCoachWhy =
    liveCoachFeedback?.why ||
    liveCoachFeedback?.diagnosis ||
    liveCoachFeedback?.primaryFocus ||
    buildLiveCoachWhy(draftStructure, isGraphQuestion)
  const liveCoachDrillDownActive = Boolean(liveCoachFeedback?.drillDownActive)
  const liveCoachDrillDownTitle = liveCoachFeedback?.drillDownTitle?.trim() || 'Focus Drill'
  const liveCoachDrillDownPrompt =
    liveCoachFeedback?.drillDownPrompt?.trim() ||
    buildLiveCoachPrinciple(draftStructure, card.tags, isGraphQuestion)
  const liveCoachDrillDownQuestion = liveCoachFeedback?.drillDownQuestion?.trim() || ''
  const liveCoachDrillDownTarget = normalizeTyping(liveCoachFeedback?.drillDownTarget || '')
  const liveCoachDrillDownHint = liveCoachFeedback?.drillDownHint?.trim() || ''
  const liveCoachDrillDownKey = liveCoachFeedback?.drillDownKey?.trim() || ''
  const triggerLiveCoachRefresh = useEffectEvent((trimmedInput: string) => {
    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const target = practiceTarget
    const accuracy = estimateTemplateAccuracy(currentTemplateMode, target, trimmedInput)

    lastLiveCoachMilestoneRef.current = draftStructure.milestoneKey
    lastLiveCoachLengthRef.current = trimmedInput.length

    void requestLiveCoachFeedback({
      interactionId,
      expectedAnswer: target,
      userAnswer: trimmedInput,
      elapsedMs: Math.max((mainStartedAt ? Date.now() - mainStartedAt : 0), 0),
      accuracy,
      exact: currentTemplateMode === 'full' ? trimmedInput === target : false,
      previousAttempts: currentCardRecallHistory,
      draft: draftStructure,
    })
  })
  const coachFocusText = coachFeedback ? stripPrefixedLabel(coachFeedback.primaryFocus, 'Primary focus') : ''
  const coachHeadline = isGraphQuestion
    ? buildGraphCoachHeadline(normalizedMainLines, lineReview.reviews, priorCardRecallHistory)
    : coachFocusText || 'Tighten the drifted lines and go again.'
  const latestSubmittedAttempt =
    mainPhase === 'submitted' ? currentCardRecallHistory[currentCardRecallHistory.length - 1] ?? null : null
  const submissionFeedbackSummary =
    coachFeedback?.diagnosis || coachHeadline
  const submissionFeedbackNextStep =
    coachFeedback?.immediateCorrection || coachFeedback?.primaryFocus || `Review the drifted step, then rewrite the ${currentTemplateMode} template once more.`
  const showGeneratingSubmissionFeedback = coachLoading && !coachFeedback
  const submissionFeedbackText = (coachFeedback?.fullFeedback || '').trim()
  const submissionFeedbackParagraphs = submissionFeedbackText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const submissionCorrectedVersion = (coachFeedback?.correctedVersion || '').trim()
  const submissionResultLabel = latestSubmittedAttempt?.exact ? 'Sound' : 'Needs work'
  const submissionResultTone = latestSubmittedAttempt?.exact
    ? 'success'
    : mainCloseEnough
      ? 'warning'
      : 'error'
  const showSubmittedLineReview = mainPhase === 'submitted' && !mainCloseEnough && currentTemplateMode !== 'pseudo'

  useEffect(() => {
    if (!liveCoachDrillDownActive || !liveCoachDrillDownKey || !liveCoachDrillDownTarget) {
      currentDrillDownKeyRef.current = ''
      setFocusDrillPhase('preview')
      setFocusDrillInput('')
      setFocusDrillAccuracy(0)
      setFocusDrillExact(false)
      return
    }

    if (currentDrillDownKeyRef.current === liveCoachDrillDownKey) return
    currentDrillDownKeyRef.current = liveCoachDrillDownKey
    setFocusDrillPhase('preview')
    setFocusDrillInput('')
    setFocusDrillAccuracy(0)
    setFocusDrillExact(false)
  }, [liveCoachDrillDownActive, liveCoachDrillDownKey, liveCoachDrillDownTarget])

  useEffect(() => {
    if (!hasDeck || mainPhase !== 'typing' || sessionFinished || hasAnsweredCurrent) return

    const trimmedInput = normalizeTyping(mainInput)
    if (trimmedInput.length < 12 || draftStructure.nonEmptyLines < 2) {
      setLiveCoachFeedback(null)
      setLiveCoachLoading(false)
      setLiveCoachError('')
      lastLiveCoachMilestoneRef.current = ''
      lastLiveCoachLengthRef.current = 0
      return
    }

    const shouldRefresh =
      draftStructure.milestoneKey !== lastLiveCoachMilestoneRef.current ||
      Math.abs(trimmedInput.length - lastLiveCoachLengthRef.current) >= liveCoachFrequencyProfile.milestoneCharDelta

    if (!shouldRefresh) return

    const timeoutId = window.setTimeout(() => {
      triggerLiveCoachRefresh(trimmedInput)
    }, liveCoachFrequencyProfile.debounceMs)

    return () => window.clearTimeout(timeoutId)
  }, [
    draftStructure,
    hasDeck,
    hasAnsweredCurrent,
    liveCoachFrequencyProfile.debounceMs,
    liveCoachFrequencyProfile.milestoneCharDelta,
    mainInput,
    mainPhase,
    sessionFinished,
  ])

  useEffect(() => {
    if (!hasDeck || mainPhase !== 'typing' || sessionFinished || hasAnsweredCurrent) return

    const intervalId = window.setInterval(() => {
      const trimmedInput = normalizeTyping(mainInput)
      if (trimmedInput.length < 12 || draftStructure.nonEmptyLines < 2) return

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
    draftStructure.nonEmptyLines,
    hasDeck,
    hasAnsweredCurrent,
    liveCoachFrequencyProfile.idleRefreshMs,
    mainInput,
    mainPhase,
    sessionFinished,
  ])

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-left">
          <span className="navbar-brand">System 1 Trainer</span>
          <span className="navbar-divider" />
          <div className="navbar-group">
            <button className="nav-tab active" type="button">
              Skill Map
            </button>
          </div>
          <span className="navbar-divider" />
          <div className="navbar-group">
            <button
              className={sessionOrderType === 'shuffled' ? 'nav-tab active' : 'nav-tab'}
              onClick={() => setSessionOrderType('shuffled')}
            >
              Randomize
            </button>
            <button
              className={sessionOrderType === 'original' ? 'nav-tab active' : 'nav-tab'}
              onClick={() => setSessionOrderType('original')}
            >
              Original
            </button>
          </div>
          <span className="navbar-divider" />
          <div className="navbar-group llm-provider-group">
            <label htmlFor="llm-provider" className="llm-provider-label">Coach Model</label>
            <select
              id="llm-provider"
              className="llm-provider-select"
              value={llmProvider}
              onChange={(event) => setLlmProvider(event.target.value as LlmProvider)}
            >
              <option value="openai">ChatGPT</option>
              <option value="claude">Claude</option>
            </select>
          </div>
        </div>
        <div className="navbar-right">
          <span className="navbar-counter">{sessionCounterText}</span>
          <Link to="/coach-tuning" className="navbar-dashboard">Tune Coach</Link>
          <Link to={practiceHistoryHref} className="navbar-dashboard">History</Link>
          <Link to="/dashboard" className="navbar-dashboard">Dashboard</Link>
        </div>
      </nav>

      <section className="card">
        <div className="card-header">
          <div className="card-header-main">
            <h2>{card.title}</h2>
            <p className="difficulty"><span className="leetcode-num">#{card.id}</span> {card.difficulty}</p>
            <p className="card-template-summary">{templateProgressText}</p>
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
            <div className="tags">
              {card.tags.map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="typing-metrics" style={{ marginBottom: '1.5rem' }}>
          <p><strong>Flow:</strong> Prompt → Recall Full Answer</p>
          <p><strong>Coach Model:</strong> {llmProvider === 'claude' ? 'Claude' : 'ChatGPT'}</p>
          <p><strong>Order:</strong> {sessionOrderType === 'shuffled' ? 'Randomized' : 'Original'}</p>
          <p><strong>Session:</strong> {attempts}/{sessionOrder.length}</p>
          <p><strong>Sound Rate:</strong> {exactAccuracy}%</p>
          <p><strong>Avg Score:</strong> {avgAccuracy}%</p>
          <p><strong>Duration:</strong> {(sessionDurationMs / 1000).toFixed(1)}s</p>
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
              <>
                <p className="prompt">
                  {skillMapLoading
                    ? 'Generating atomic recall drills from the layered skill map.'
                    : 'The skill-map deck is unavailable right now.'}
                </p>
                <p className="hint">
                  {skillMapLoading
                    ? 'Each generated drill is meant to isolate one reusable LeetCode move so you can memorize the technique itself, not a story problem.'
                    : skillMapError || 'Try restarting the session to request another generated deck.'}
                </p>
              </>
            ) : (
              <>
                <p className="prompt">{card.prompt}</p>
                <button className="link" onClick={() => setShowHint((prev) => !prev)}>
                  {showHint ? 'Hide hint' : 'Show hint'}
                </button>
                {showHint && <p className="hint">{card.hint}</p>}
              </>
            )}
          </div>

          <div className="panel">
            <h3>Main Recall Flow</h3>
            {!hasDeck ? (
              <div className="hint" style={{ marginTop: 0 }}>
                {skillMapLoading
                  ? 'The LLM is building a fresh set of skill-map snippets now.'
                  : skillMapError || 'No drills are available yet.'}
              </div>
            ) : mainPhase === 'preview' && (
              <>
                <p className="answer-label">{practiceIntroText}</p>
                <div className="code-container">
                  <SyntaxHighlighter
                    language={practiceLanguage}
                    style={vscDarkPlus}
                    customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                    codeTagProps={{ style: { background: 'transparent' } }}
                  >
                    {practiceTarget}
                  </SyntaxHighlighter>
                </div>
                <div className="actions">
                  <button onClick={startMainRecall} disabled={!hasDeck || hasAnsweredCurrent || sessionFinished}>{startRecallLabel}</button>
                </div>
              </>
            )}

            {hasDeck && mainPhase !== 'preview' && (
              <>
                <label className="answer-label" htmlFor="main-recall-input">
                  {practiceInputLabel}
                </label>
                <div className="vscode-editor-container">
                  <div className="vscode-tabs">
                    <div className="vscode-tab active">{practiceTabLabel}</div>
                  </div>
                  <div className="typing-editor-shell">
                    <div className="typing-editor">
                      <div className="typing-gutter" aria-hidden="true" ref={mainGutterRef}>
                        {displayLines.map((line, i) => {
                          const status =
                            showSubmittedLineReview && line.sourceLineNumber
                              ? lineReview.actualStatuses[line.sourceLineNumber - 1] ?? 'match'
                              : null
                          return (
                            <div
                              key={i}
                              className={`typing-line-number${status ? ` line-${status}` : ''}`}
                            >
                              {i + 1}
                            </div>
                          )
                        })}
                      </div>
                      <div className="typing-code-area">
                        <div className="typing-highlight" aria-hidden="true" ref={mainHighlightRef}>
                          <SyntaxHighlighter
                            language={practiceLanguage}
                            style={vscDarkPlus}
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
                              fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                              fontSize: '0.95rem',
                              lineHeight: '1.6',
                              whiteSpace: 'pre',
                            }}
                            codeTagProps={{
                              style: {
                                background: 'transparent',
                                fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                                fontSize: '0.95rem',
                                lineHeight: '1.6',
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
                            placeholder={practicePlaceholder}
                          />
                        )}
                      </div>
                    </div>
                    {mainPhase === 'typing' && (
                      <div className="coach-docked-panel coach-docked-panel-idle">
                        <div className="coach-docked-card">
                          <div className="coach-card-header">
                            <h4>Live Feedback</h4>
                            <span
                              className="live-coach-indicator"
                              aria-label={liveCoachLoading ? 'Live coach refreshing' : 'Live coach active'}
                            >
                              <span className="live-coach-dot" />
                            </span>
                          </div>
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
                          {liveCoachDrillDownActive && (
                            <div className="coach-drilldown-card">
                              <div className="coach-drilldown-header">
                                <p className="coach-live-label">{liveCoachDrillDownTitle}</p>
                                <button type="button" className="link" onClick={ignoreLiveCoachDrillDown}>
                                  {liveCoachFeedback?.drillDownOverrideLabel || 'Ignore this drill-down'}
                                </button>
                              </div>
                              <p className="coach-panel-copy">{liveCoachDrillDownPrompt}</p>
                              {liveCoachDrillDownQuestion && (
                                <p className="coach-drilldown-question">{liveCoachDrillDownQuestion}</p>
                              )}
                              {liveCoachDrillDownHint && (
                                <p className="coach-drilldown-hint">{liveCoachDrillDownHint}</p>
                              )}
                              {focusDrillPhase === 'preview' && liveCoachDrillDownTarget && (
                                <>
                                  <div className="code-container coach-drilldown-code">
                                    <SyntaxHighlighter
                                      language="python"
                                      style={vscDarkPlus}
                                      customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                                      codeTagProps={{ style: { background: 'transparent' } }}
                                    >
                                      {liveCoachDrillDownTarget}
                                    </SyntaxHighlighter>
                                  </div>
                                  <div className="actions">
                                    <button type="button" onClick={startFocusDrill}>Hide answer and practice subset</button>
                                  </div>
                                </>
                              )}
                              {focusDrillPhase === 'typing' && (
                                <>
                                  <textarea
                                    className="coach-drilldown-input"
                                    rows={Math.max(liveCoachDrillDownTarget.split('\n').length + 1, 4)}
                                    value={focusDrillInput}
                                    onChange={(event) => setFocusDrillInput(event.target.value)}
                                    spellCheck={false}
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    autoComplete="off"
                                    placeholder="Type the focused subset from memory..."
                                  />
                                  <div className="actions">
                                    <button type="button" onClick={submitFocusDrill} disabled={focusDrillInput.trim().length === 0}>
                                      Submit subset
                                    </button>
                                  </div>
                                </>
                              )}
                              {focusDrillPhase === 'submitted' && (
                                <>
                                  <p className={focusDrillExact || focusDrillAccuracy >= MAIN_RECALL_CLOSE_ENOUGH_ACCURACY ? 'status success' : 'status error'}>
                                    {focusDrillExact
                                      ? 'Subset nailed.'
                                      : focusDrillAccuracy >= MAIN_RECALL_CLOSE_ENOUGH_ACCURACY
                                        ? `Subset close enough at ${focusDrillAccuracy}%.`
                                        : `Subset needs work at ${focusDrillAccuracy}%.`}
                                  </p>
                                  <div className="code-container coach-drilldown-code">
                                    <SyntaxHighlighter
                                      language="python"
                                      style={vscDarkPlus}
                                      customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                                      codeTagProps={{ style: { background: 'transparent' } }}
                                    >
                                      {liveCoachDrillDownTarget}
                                    </SyntaxHighlighter>
                                  </div>
                                  <div className="actions">
                                    <button type="button" onClick={retryFocusDrill}>Retry subset</button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          {liveCoachError && <p className="coach-error">{liveCoachError}</p>}
                        </div>
                      </div>
                    )}
                    {mainPhase === 'submitted' && (
                      <div className="coach-docked-panel">
                        <div className="coach-docked-card">
                          <div className="coach-card-header">
                            <h4>Submission Feedback</h4>
                            <span className={`coach-status-chip coach-status-chip-${submissionResultTone}`}>
                              {submissionResultLabel}
                            </span>
                          </div>
                          {latestSubmittedAttempt && (
                            <div className="coach-metric-row">
                              <span className="coach-metric-chip">Accuracy {latestSubmittedAttempt.accuracy}%</span>
                              <span className="coach-metric-chip">Time {(latestSubmittedAttempt.elapsedMs / 1000).toFixed(1)}s</span>
                              <span className="coach-metric-chip">
                                Coach {coachFeedback?.llmUsed ? 'GPT' : 'Rules'}
                              </span>
                            </div>
                          )}
                          {coachLoading && coachFeedback && <p className="coach-muted">Refining submission feedback...</p>}
                          {showGeneratingSubmissionFeedback && <p className="coach-muted">Generating feedback...</p>}
                          {coachError && <p className="coach-error">{coachError}</p>}
                          {!showGeneratingSubmissionFeedback && submissionFeedbackParagraphs.map((paragraph, index) => (
                            <p key={index} className="coach-panel-copy">
                              {paragraph}
                            </p>
                          ))}
                          {!showGeneratingSubmissionFeedback && submissionCorrectedVersion && (
                            <div className="coach-code-review">
                              <p className="coach-code-label">Corrected version</p>
                              <div className="code-container">
                                <SyntaxHighlighter
                                  language={practiceLanguage}
                                  style={vscDarkPlus}
                                  customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                                  codeTagProps={{ style: { background: 'transparent' } }}
                                >
                                  {submissionCorrectedVersion}
                                </SyntaxHighlighter>
                              </div>
                            </div>
                          )}
                          {!showGeneratingSubmissionFeedback && (
                            <p className="coach-muted">
                              <strong>Next step:</strong> {submissionFeedbackNextStep}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <p className="typing-help">
                  {currentTemplateMode === 'pseudo'
                    ? <>Plain text or Python-like notes both work here · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to submit</>
                    : <>Tab inserts 4 spaces · Shift+Tab outdents · Enter auto-indents · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to submit</>}
                </p>
                {mainPhase === 'typing' && (
                  <div className="actions">
                    <button onClick={submitMainRecall} disabled={mainInput.trim().length === 0}>Submit {currentTemplateLabel.toLowerCase()}</button>
                  </div>
                )}
                {mainPhase === 'submitted' && !mainCloseEnough && (
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

            {hasDeck && mainPhase === 'submitted' && (
              <p className={mainCloseEnough ? 'status success' : 'status error'}>
                {mainCloseEnough
                  ? hasNextTemplateMode && nextTemplateMode
                    ? `${currentTemplateLabel} template recorded. Continue to ${TEMPLATE_MODE_LABELS[nextTemplateMode]}.`
                    : `${currentTemplateLabel} template recorded.`
                  : `This ${currentTemplateMode} attempt is not sound yet. Revise the logic and submit again.`}
              </p>
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
          <p className="card-footer-hint">
            Skill Map sessions generate atomic pattern drills from the layered map. Regenerate when you want a fresh set.
          </p>
        </div>
      </section>
    </div>
  )
}

export default App
