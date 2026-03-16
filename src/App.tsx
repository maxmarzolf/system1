import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './App.css'
import { flashcards as baseFlashcards } from './data/flashcards'
import { cardOptions as baseCardOptions } from './data/flashcard-options'
import { top150Flashcards } from './data/flashcards-top150'
import { top150CardOptions } from './data/flashcard-options-top150'
import {
  SYSTEM1_MODE_ORDER,
  defaultCardProgress,
  modeDescription,
  modeShortLabel,
  modeTitle,
  scoreAttempt,
  updateAutomaticity,
  type CardProgress,
  type System1Mode,
} from './system1Modes'

const flashcards = [...baseFlashcards, ...top150Flashcards]
const cardOptions: Record<string, { code: string; correct: boolean }[]> = { ...baseCardOptions, ...top150CardOptions }

type CheckState = 'correct' | 'incorrect' | null
type QuestionType = 'tree' | 'stack' | 'graph' | 'top150'
type SessionOrder = 'shuffled' | 'original'
type PracticeTrack = 'main-recall' | 'legacy'
type StoredProgress = Record<string, CardProgress>

type AttemptPayload = {
  mode: System1Mode | 'main-recall'
  correct: boolean
  correctAnswer: string
  userAnswer: string
  options?: { text: string; isCorrect: boolean }[]
}

type CoachAttemptFeedback = {
  diagnosis: string
  primaryFocus: string
  immediateCorrection: string
  microDrill: string
  nextRepTarget: string
  strengths: string[]
  errorTags: string[]
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

type LineReviewStatus = 'match' | 'mismatch' | 'missing' | 'extra'

type LineReview = {
  lineNumber: number
  status: LineReviewStatus
  expected: string
  actual: string
}

type InvariantCheck = {
  label: string
  anchor: string
  matched: boolean
}

type InlineCoachComment = {
  lineNumber: number
  text: string
  tone: 'good' | 'fix' | 'guide'
}

type AnnotatedDisplayLine = {
  text: string
  sourceLineNumber: number | null
  isComment: boolean
  tone?: InlineCoachComment['tone']
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

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiUrl = (path: string) => `${API_BASE_URL}${path}`
const PROGRESS_KEY = 'system1-progress-v1'
const MAIN_RECALL_CLOSE_ENOUGH_ACCURACY = 90

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

const buildSolutionOptions = (solution: string, options: { code: string; correct: boolean }[]) =>
  options.map((option) => ({
    ...option,
    full: solution.replace('{{missing}}', option.code),
  }))

const accuracyLevel = (accuracy: number): string => {
  if (accuracy === 100) return 'Exact'
  if (accuracy >= 95) return 'Near Exact'
  if (accuracy >= 85) return 'Strong'
  if (accuracy >= 70) return 'Developing'
  return 'Needs Work'
}

const stripPrefixedLabel = (text: string, label: string) =>
  text.replace(new RegExp(`^${label}:\\s*`, 'i'), '').trim()

const compactCodeLine = (line: string, max = 72) => {
  const cleaned = line.trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 1)}…`
}

const wrapCommentText = (text: string, indent: string, maxWidth = 78) => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return [`${indent}│`]

  const lines: string[] = []
  let current = '│'

  for (const word of words) {
    const next = current === '│' ? `│ ${word}` : `${current} ${word}`
    if (indent.length + next.length <= maxWidth) {
      current = next
      continue
    }
    lines.push(`${indent}${current}`)
    current = `│ ${word}`
  }

  lines.push(`${indent}${current}`)
  return lines
}

const isPlaceholderLine = (line: string) => /\b(pass|something|todo|tbd)\b/i.test(line.trim())

const summarizeRecallAttempt = (
  actualLines: string[],
  accuracy: number,
  exact: boolean,
  elapsedMs: number,
  attemptNumber: number
): RecallAttemptSnapshot => ({
  attemptNumber,
  accuracy,
  exact,
  elapsedMs,
  usedPlaceholder: actualLines.some((line) => isPlaceholderLine(line)),
  hasGuard: actualLines.some((line) => /^\s*if\b/.test(line) && /not|visited|seen|< 0|>=/.test(line)),
  hasBookkeeping: actualLines.some((line) =>
    /(graph|visited|seen|indegree|parent|dist|rows|cols|queue|deque|stack|\bm\b|\bn\b)/.test(line)
  ),
  hasTraversal: actualLines.some((line) => /\bdfs\b|\bbfs\b|queue|deque|stack/.test(line)),
  hasLoop: actualLines.some((line) => /^\s*(for|while)\b/.test(line)),
})

const analyzeDraftStructure = (code: string): DraftStructure => {
  const lines = code.replace(/\r\n/g, '\n').split('\n')
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0).length
  const hasSignature = lines.some((line) => /^\s*def\s+/.test(line))
  const hasGuard = lines.some((line) => /^\s*if\b/.test(line) && /not|visited|seen|< 0|>=/.test(line))
  const traversalKind = lines.some((line) => /\bdfs\b/.test(line))
    ? 'dfs'
    : lines.some((line) => /\bbfs\b/.test(line))
      ? 'bfs'
      : lines.some((line) => /\bqueue\b|\bdeque\b|\bq\b/.test(line))
        ? 'queue'
        : lines.some((line) => /\bstack\b/.test(line))
          ? 'stack'
          : null
  const hasLoop = lines.some((line) => /^\s*(for|while)\b/.test(line))
  const hasPlaceholder = lines.some((line) => isPlaceholderLine(line))
  const hasBookkeeping = lines.some((line) =>
    /(graph|visited|seen|indegree|parent|dist|rows|cols|queue|deque|stack|\bm\b|\bn\b)/.test(line)
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
      `lines-${Math.min(nonEmptyLines, 8)}`,
    ].join('|'),
  }
}

const buildLiveCoachFallback = (draft: DraftStructure, isGraphQuestion: boolean) => {
  if (isGraphQuestion) {
    if (!draft.hasSignature) return 'Start by writing the function signature and naming the graph state you expect to maintain.'
    if (!draft.hasBookkeeping) return 'Before coding the traversal, define the bookkeeping: representation, visited state, and any per-node metadata.'
    if (!draft.traversalKind) return 'Choose the traversal deliberately. In graph interviews, say DFS or BFS and what the frontier means.'
    if (draft.hasPlaceholder) return 'Replace placeholders with the core invariant: reject bad states, mark the current one, then expand neighbors.'
    if (!draft.hasGuard) return 'Add the guard condition next. Graph code usually gets clearer once invalid or already-seen states fail fast.'
    if (!draft.hasLoop) return 'You have the setup; now add the loop or recursion that repeatedly advances the frontier.'
    return 'Good draft. Keep the model, visited rule, and frontier update explicit as you fill in the body.'
  }

  if (!draft.hasSignature) return 'Start with the function signature and identify the state the solution needs to preserve.'
  if (draft.hasPlaceholder) return 'Replace placeholders with the actual state transition so the invariant stays checkable.'
  return 'Keep the next step small and structural: make the state and its update explicit.'
}

const buildLiveCoachPrinciple = (draft: DraftStructure, isGraphQuestion: boolean) => {
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

const buildInlineCoachComments = (
  actualLines: string[],
  reviews: LineReview[],
  isGraphQuestion: boolean,
  history: RecallAttemptSnapshot[]
): InlineCoachComment[] => {
  const comments: InlineCoachComment[] = []
  const usedLines = new Set<number>()
  const fallbackLine = Math.max(actualLines.findIndex((line) => line.trim().length > 0) + 1, 1)
  const latestPrevious = history[history.length - 1]

  const addComment = (
    lineNumber: number,
    text: string,
    tone: InlineCoachComment['tone']
  ) => {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) return
    const safeLine = Math.max(1, Math.min(lineNumber, Math.max(actualLines.length, 1)))
    if (usedLines.has(safeLine)) return
    usedLines.add(safeLine)
    comments.push({ lineNumber: safeLine, text: normalized, tone })
  }

  if (isGraphQuestion) {
    const guardLine = reviews.find(
      (review) =>
        review.status === 'match' &&
        review.actual.trim().startsWith('if ') &&
        /not|< 0|>=|visited|seen/.test(review.actual)
    )
    if (guardLine) {
      addComment(
        guardLine.lineNumber,
        'Good start. In graph problems, an early guard usually makes the traversal logic much simpler.',
        'good'
      )
    }

    const setupLine = reviews.find(
      (review) =>
        review.status !== 'match' &&
        /(graph|visited|indegree|queue|deque|stack|\bm\b|\bn\b)/.test(
          `${review.actual} ${review.expected}`
        )
    )
    if (setupLine) {
      addComment(
        setupLine.lineNumber,
        'For graph problems, define the bookkeeping before the loops: representation, visited state, and any metadata that drives the traversal.',
        'guide'
      )
    }

    const traversalLine = reviews.find(
      (review) =>
        /def (dfs|bfs)|while .*q|while .*queue|deque|queue/.test(
          `${review.actual} ${review.expected}`
        )
    )
    if (traversalLine) {
      addComment(
        traversalLine.lineNumber,
        'Once you choose DFS or BFS, keep the invariant explicit: reject bad states, mark the current one, then expand neighbors.',
        'good'
      )
    }

    const placeholderReview = reviews.find((review) => isPlaceholderLine(review.actual))
    if (placeholderReview) {
      addComment(
        placeholderReview.lineNumber,
        latestPrevious?.usedPlaceholder
          ? 'Same pattern as the last try: placeholders are hiding the algorithm. In graph interviews, name what gets visited, queued, or expanded.'
          : 'In senior interviews, placeholders hide the algorithm. Even rough code should say what gets visited, queued, or expanded.',
        'fix'
      )
    }

    const phaseLine = reviews.find(
      (review) =>
        review.actual.trim().startsWith('for ') ||
        review.expected.trim().startsWith('for ') ||
        review.actual.trim().startsWith('while ')
    )
    if (phaseLine) {
      addComment(
        phaseLine.lineNumber,
        'A common graph pattern is two phases: identify the start states, then traverse until the frontier is exhausted.',
        'guide'
      )
    }

    if (
      latestPrevious &&
      latestPrevious.accuracy < history[history.length]?.accuracy &&
      !latestPrevious.hasBookkeeping &&
      actualLines.some((line) =>
        /(graph|visited|seen|indegree|parent|dist|queue|deque|stack|\bm\b|\bn\b)/.test(line)
      )
    ) {
      addComment(
        fallbackLine,
        'This is better than the last attempt because you are naming the graph state. Keep pushing toward a clear visited rule and frontier update.',
        'good'
      )
    }

    if (comments.length === 0) {
      addComment(
        fallbackLine,
        'For graph problems, explain the model, the visited rule, and the traversal order before coding details.',
        'guide'
      )
    }

    return comments.slice(0, 4)
  }

  for (const review of reviews) {
    const expected = review.expected.trim()
    const actual = review.actual.trim()
    if (review.status === 'match') continue
    if (!expected && !actual) continue

    if (isPlaceholderLine(review.actual)) {
      addComment(
        review.lineNumber,
        'Avoid placeholders in interview code. Name the state transition explicitly, even in a rough first pass.',
        'fix'
      )
      continue
    }

    if (review.status === 'missing') {
      addComment(
        review.lineNumber,
        'There is a missing logical step here. In interviews, it helps to say the invariant this line is maintaining before you type it.',
        'guide'
      )
      continue
    }

    if (review.status === 'mismatch') {
      addComment(
        review.lineNumber,
        'The structure is close, but the state update is drifting. Focus on what this line is supposed to preserve.',
        'guide'
      )
      continue
    }
  }

  if (comments.length === 0) {
    addComment(
      fallbackLine,
      'Keep the invariant explicit: what state exists, how it changes, and what makes the loop or recursion correct.',
      'guide'
    )
  }

  return comments.slice(0, 4)
}

const buildAnnotatedDisplayLines = (
  actualLines: string[],
  comments: InlineCoachComment[]
): AnnotatedDisplayLine[] => {
  const grouped = new Map<number, InlineCoachComment[]>()
  for (const comment of comments) {
    const list = grouped.get(comment.lineNumber) ?? []
    list.push(comment)
    grouped.set(comment.lineNumber, list)
  }

  const displayLines: AnnotatedDisplayLine[] = []
  const safeActualLines = actualLines.length > 0 ? actualLines : ['']

  for (let idx = 0; idx < safeActualLines.length; idx += 1) {
    const sourceLineNumber = idx + 1
    const sourceLine = safeActualLines[idx] ?? ''
    const indent = sourceLine.match(/^\s*/)?.[0] ?? ''
    for (const comment of grouped.get(sourceLineNumber) ?? []) {
      for (const wrappedLine of wrapCommentText(comment.text, indent)) {
        displayLines.push({
          text: wrappedLine,
          sourceLineNumber,
          isComment: true,
          tone: comment.tone,
        })
      }
    }
    displayLines.push({
      text: sourceLine,
      sourceLineNumber,
      isComment: false,
    })
  }

  return displayLines
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

const deriveInvariantChecks = (expectedCode: string, actualCode: string): InvariantCheck[] => {
  const expectedLines = expectedCode
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const actualSet = new Set(
    actualCode
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  )

  const checks: InvariantCheck[] = []
  const pushIfNew = (check: InvariantCheck | null) => {
    if (!check) return
    if (checks.some((item) => item.label === check.label)) return
    checks.push(check)
  }

  const signature = expectedLines.find((line) => line.startsWith('def '))
  pushIfNew(
    signature
      ? { label: 'Function signature', anchor: signature, matched: actualSet.has(signature) }
      : null
  )

  const baseCase = expectedLines.find((line) => /^if .+:$/.test(line))
  pushIfNew(
    baseCase
      ? { label: 'Base-case guard', anchor: baseCase, matched: actualSet.has(baseCase) }
      : null
  )

  const loopGuard = expectedLines.find((line) => line.startsWith('for ') || line.startsWith('while '))
  pushIfNew(
    loopGuard
      ? { label: 'Traversal step', anchor: loopGuard, matched: actualSet.has(loopGuard) }
      : null
  )

  const stateUpdate = expectedLines.find((line) => /(\+=|-=|append\(|pop\(|return )/.test(line))
  pushIfNew(
    stateUpdate
      ? { label: 'State transition', anchor: stateUpdate, matched: actualSet.has(stateUpdate) }
      : null
  )

  const fnName = signature?.match(/^def\s+([A-Za-z_]\w*)\s*\(/)?.[1]
  if (fnName) {
    const recursiveStep = expectedLines.find(
      (line) => line.includes(`${fnName}(`) && !line.startsWith('def ')
    )
    pushIfNew(
      recursiveStep
        ? { label: 'Recurrence call', anchor: recursiveStep, matched: actualSet.has(recursiveStep) }
        : null
    )
  }

  return checks.slice(0, 3)
}

function App() {
  const [questionType, setQuestionType] = useState<QuestionType>('tree')
  const [practiceTrack, setPracticeTrack] = useState<PracticeTrack>('main-recall')
  const [gameMode, setGameMode] = useState<System1Mode>('snap-classify')
  const [sessionOrderType, setSessionOrderType] = useState<SessionOrder>('original')

  const [sessionOrder, setSessionOrder] = useState<number[]>([])
  const [sessionPosition, setSessionPosition] = useState(0)
  const [sessionFinished, setSessionFinished] = useState(false)
  const [sessionStartedAt, setSessionStartedAt] = useState(Date.now())
  const [sessionCompletedAt, setSessionCompletedAt] = useState<number | null>(null)
  const [sessionResults, setSessionResults] = useState<Record<string, boolean>>({})
  const [sessionAccuracyByCard, setSessionAccuracyByCard] = useState<Record<string, number>>({})
  const [sessionElapsedByCard, setSessionElapsedByCard] = useState<Record<string, number>>({})
  const [sessionPersistedId, setSessionPersistedId] = useState<number | null>(null)
  const [sessionPersisting, setSessionPersisting] = useState(false)
  const [sessionPersistAttempted, setSessionPersistAttempted] = useState(false)
  const [sessionPlanRequested, setSessionPlanRequested] = useState(false)

  const [showHint, setShowHint] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [checkState, setCheckState] = useState<CheckState>(null)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [templateMisses, setTemplateMisses] = useState<number[]>([])
  const [gutConfidence, setGutConfidence] = useState<number | null>(null)
  const [trapOptionIndex, setTrapOptionIndex] = useState(0)
  const [duelPair, setDuelPair] = useState<[number, number]>([0, 1])
  const [promptStartAt, setPromptStartAt] = useState<number>(Date.now())

  const [modeScore, setModeScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [automaticityIndex, setAutomaticityIndex] = useState(0)
  const [sessionAutomaticityTotal, setSessionAutomaticityTotal] = useState(0)

  const [mainPhase, setMainPhase] = useState<'preview' | 'typing' | 'submitted'>('preview')
  const [mainInput, setMainInput] = useState('')
  const [mainStartedAt, setMainStartedAt] = useState<number | null>(null)
  const [mainElapsedMs, setMainElapsedMs] = useState(0)
  const [mainAccuracy, setMainAccuracy] = useState(0)
  const [mainLevel, setMainLevel] = useState('')
  const [mainCloseEnough, setMainCloseEnough] = useState(false)
  const [mainRecallHistoryByCard, setMainRecallHistoryByCard] = useState<Record<string, RecallAttemptSnapshot[]>>({})
  const [liveCoachFeedback, setLiveCoachFeedback] = useState<CoachAttemptFeedback | null>(null)
  const [liveCoachLoading, setLiveCoachLoading] = useState(false)
  const [liveCoachError, setLiveCoachError] = useState('')
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
  const coachRequestVersionRef = useRef(0)

  const [progressByCard, setProgressByCard] = useState<StoredProgress>(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY)
      return raw ? (JSON.parse(raw) as StoredProgress) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressByCard))
  }, [progressByCard])

  const filteredDeck = useMemo(
    () => flashcards.filter((item) => item.tags.includes(questionType)),
    [questionType]
  )

  const startSession = () => {
    const baseOrder = Array.from({ length: filteredDeck.length }, (_, idx) => idx)
    const nextOrder = sessionOrderType === 'shuffled' ? shuffle(baseOrder) : baseOrder

    setSessionOrder(nextOrder)
    setSessionPosition(0)
    setSessionFinished(false)
    setSessionStartedAt(Date.now())
    setSessionCompletedAt(null)
    setSessionResults({})
    setSessionAccuracyByCard({})
    setSessionElapsedByCard({})
    setSessionPersistedId(null)
    setSessionPersisting(false)
    setSessionPersistAttempted(false)
    setSessionPlanRequested(false)

    setModeScore(0)
    setStreak(0)
    setAutomaticityIndex(0)
    setSessionAutomaticityTotal(0)

    setShowHint(false)
    setShowAnswer(false)
    setCheckState(null)
    setSelectedOption(null)
    setTemplateMisses([])
    setGutConfidence(null)
    setPromptStartAt(Date.now())

    setMainPhase('preview')
    setMainInput('')
    setMainStartedAt(null)
    setMainElapsedMs(0)
    setMainAccuracy(0)
    setMainLevel('')
    setMainCloseEnough(false)
    setMainRecallHistoryByCard({})
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    liveCoachRequestVersionRef.current = 0
    lastLiveCoachMilestoneRef.current = ''
    lastLiveCoachLengthRef.current = 0
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSessionPlan(null)
    setSessionPlanLoading(false)
    setSessionPlanError('')
  }

  useEffect(() => {
    startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionType, practiceTrack, gameMode, sessionOrderType])

  const currentDeckIndex = sessionOrder[sessionPosition] ?? 0
  const card = filteredDeck[currentDeckIndex] ?? filteredDeck[0] ?? flashcards[0]
  const fullSolutionTarget = useMemo(
    () => normalizeTyping(card.solution.replace('{{missing}}', card.missing)),
    [card.missing, card.solution]
  )

  const rawOptions = useMemo(() => cardOptions[card.id] || [], [card.id])
  const shuffledOptions = useMemo(() => shuffle(rawOptions), [rawOptions])
  const solutionOptions = useMemo(() => buildSolutionOptions(card.solution, rawOptions), [card.solution, rawOptions])
  const shuffledSolutionOptions = useMemo(() => shuffle(solutionOptions), [solutionOptions])

  const trapOption = rawOptions[trapOptionIndex] ?? rawOptions[0]
  const duelOptions = [rawOptions[duelPair[0]], rawOptions[duelPair[1]]].filter(Boolean) as { code: string; correct: boolean }[]
  currentCardIdRef.current = card.id

  const hasAnsweredCurrent = Object.prototype.hasOwnProperty.call(sessionResults, card.id)

  const completeCardInSession = (isCorrect: boolean, accuracy: number, elapsedMs?: number) => {
    setSessionResults((prevResults) => {
      const next = { ...prevResults, [card.id]: isCorrect }
      if (Object.keys(next).length >= sessionOrder.length) {
        setSessionFinished(true)
        setSessionCompletedAt(Date.now())
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
          options: payload.options,
          correctAnswer: payload.correctAnswer,
          userAnswer: payload.userAnswer,
          mode: payload.mode,
          correct: payload.correct,
        }),
      })
    } catch {
      // silently fail
    }
  }

  const resetPerCardInteraction = () => {
    setShowHint(false)
    setShowAnswer(false)
    setCheckState(null)
    setSelectedOption(null)
    setTemplateMisses([])
    setGutConfidence(null)
    setPromptStartAt(Date.now())

    setMainPhase('preview')
    setMainInput('')
    setMainStartedAt(null)
    setMainElapsedMs(0)
    setMainAccuracy(0)
    setMainLevel('')
    setMainCloseEnough(false)
    setLiveCoachFeedback(null)
    setLiveCoachLoading(false)
    setLiveCoachError('')
    liveCoachRequestVersionRef.current = 0
    lastLiveCoachMilestoneRef.current = ''
    lastLiveCoachLengthRef.current = 0

    if (rawOptions.length > 0) {
      setTrapOptionIndex(Math.floor(Math.random() * rawOptions.length))
      const correctIdx = rawOptions.findIndex((opt) => opt.correct)
      const wrongIndices = rawOptions
        .map((opt, idx) => ({ opt, idx }))
        .filter(({ opt }) => !opt.correct)
        .map(({ idx }) => idx)
      const randomWrong = wrongIndices[Math.floor(Math.random() * Math.max(wrongIndices.length, 1))] ?? 0
      setDuelPair(Math.random() > 0.5 ? [correctIdx, randomWrong] : [randomWrong, correctIdx])
    }
  }

  useEffect(() => {
    resetPerCardInteraction()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, sessionPosition, practiceTrack, gameMode])

  const finalizeLegacyAttempt = (input: {
    correct: boolean
    userAnswer: string
    correctAnswer: string
    options?: { text: string; isCorrect: boolean }[]
    falseAlarm?: boolean
    confidence?: number
    secondTry?: boolean
  }) => {
    if (sessionFinished || hasAnsweredCurrent) return

    const elapsedMs = Math.max(Date.now() - promptStartAt, 1)
    const now = new Date()
    const prev = progressByCard[card.id] ?? defaultCardProgress()
    const outcome = scoreAttempt(
      prev,
      {
        mode: gameMode,
        correct: input.correct,
        elapsedMs,
        confidence: input.confidence,
        falseAlarm: input.falseAlarm,
        secondTry: input.secondTry,
      },
      now
    )

    const nextProgressBase: CardProgress = {
      ...prev,
      strength: outcome.nextStrength,
      dueByMode: {
        ...prev.dueByMode,
        [gameMode]: outcome.nextDueIso,
      },
    }

    setProgressByCard((prevState) => ({
      ...prevState,
      [card.id]: updateAutomaticity(nextProgressBase, outcome.wasFastCorrect, now),
    }))

    setCheckState(input.correct ? 'correct' : 'incorrect')
    setShowAnswer(true)
    setAutomaticityIndex(outcome.automaticityIndex)
    setSessionAutomaticityTotal((prevTotal) => prevTotal + outcome.automaticityIndex)
    setModeScore((prevScore) => prevScore + outcome.pointsDelta)
    setStreak((prevStreak) => (input.correct ? prevStreak + 1 : 0))

    completeCardInSession(input.correct, input.correct ? 100 : 0, elapsedMs)

    void submitAttemptToServer({
      mode: gameMode,
      correct: input.correct,
      correctAnswer: input.correctAnswer,
      userAnswer: input.userAnswer,
      options: input.options,
    })
  }

  const startMainRecall = () => {
    if (hasAnsweredCurrent || sessionFinished) return
    setMainPhase('typing')
    setMainStartedAt(Date.now())
    setMainInput('')
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
    window.requestAnimationFrame(() => {
      if (!mainInputRef.current) return
      mainInputRef.current.selectionStart = cursorPosition
      mainInputRef.current.selectionEnd = cursorPosition
    })
  }

  const handleMainInputChange = (nextValue: string) => {
    if (mainPhase !== 'typing') return
    setMainInput(nextValue)
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
          previousAttempts: payload.previousAttempts.map((attempt) => ({
            attemptNumber: attempt.attemptNumber,
            accuracy: attempt.accuracy,
            exact: attempt.exact,
            elapsedMs: attempt.elapsedMs,
          })),
          questionType,
          mode: 'main-recall',
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
      if (currentCardIdRef.current !== requestCardId || liveCoachRequestVersionRef.current !== requestVersion) return
      setLiveCoachLoading(false)
    }
  }

  const fetchCoachAttemptFeedback = async (
    payload: {
      expectedAnswer: string
      userAnswer: string
      elapsedMs: number
      accuracy: number
      exact: boolean
      previousAttempts: RecallAttemptSnapshot[]
    }
  ) => {
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
          previousAttempts: payload.previousAttempts.map((attempt) => ({
            attemptNumber: attempt.attemptNumber,
            accuracy: attempt.accuracy,
            exact: attempt.exact,
            elapsedMs: attempt.elapsedMs,
          })),
          questionType,
          mode: 'main-recall',
        }),
      })
      if (!response.ok) throw new Error('Unable to load coach feedback')
      const feedback = (await response.json()) as CoachAttemptFeedback
      if (currentCardIdRef.current !== requestCardId || coachRequestVersionRef.current !== requestVersion) return
      setCoachFeedback(feedback)
    } catch {
      if (currentCardIdRef.current !== requestCardId || coachRequestVersionRef.current !== requestVersion) return
      setCoachError('Coach feedback unavailable for this attempt.')
      setCoachFeedback(null)
    } finally {
      if (currentCardIdRef.current !== requestCardId || coachRequestVersionRef.current !== requestVersion) return
      setCoachLoading(false)
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

  const submitMainRecall = () => {
    if (hasAnsweredCurrent || sessionFinished || mainPhase !== 'typing') return

    const startedAt = mainStartedAt ?? Date.now()
    const elapsedMs = Math.max(Date.now() - startedAt, 1)
    const normalizedInput = normalizeTyping(mainInput)
    const normalizedInputLines = normalizedInput.split('\n')
    const normalizedTarget = fullSolutionTarget

    const compareLength = Math.max(normalizedInput.length, normalizedTarget.length, 1)
    let exactMatches = 0
    for (let i = 0; i < compareLength; i += 1) {
      if (normalizedInput[i] === normalizedTarget[i]) exactMatches += 1
    }

    const accuracy = Math.round((exactMatches / compareLength) * 100)
    const exact = normalizedInput === normalizedTarget
    const closeEnough = exact || accuracy >= MAIN_RECALL_CLOSE_ENOUGH_ACCURACY
    const currentHistory = mainRecallHistoryByCard[card.id] ?? []
    const attemptSnapshot = summarizeRecallAttempt(
      normalizedInputLines,
      accuracy,
      exact,
      elapsedMs,
      currentHistory.length + 1
    )

    setMainElapsedMs(elapsedMs)
    setMainAccuracy(accuracy)
    setMainLevel(accuracyLevel(accuracy))
    setMainCloseEnough(closeEnough)
    setMainPhase('submitted')
    setCheckState(exact ? 'correct' : 'incorrect')
    setMainRecallHistoryByCard((prev) => ({
      ...prev,
      [card.id]: [...(prev[card.id] ?? []), attemptSnapshot],
    }))

    if (closeEnough) {
      completeCardInSession(exact, accuracy, elapsedMs)
    }

    void submitAttemptToServer({
      mode: 'main-recall',
      correct: exact,
      correctAnswer: normalizedTarget,
      userAnswer: normalizedInput,
    })
    void fetchCoachAttemptFeedback({
      expectedAnswer: normalizedTarget,
      userAnswer: normalizedInput,
      elapsedMs,
      accuracy,
      exact,
      previousAttempts: currentHistory,
    })
  }

  const reviseMainRecall = () => {
    if (hasAnsweredCurrent || sessionFinished || mainPhase !== 'submitted' || mainCloseEnough) return
    setMainPhase('typing')
    setMainStartedAt(Date.now())
  }

  const goNext = () => {
    if (sessionFinished) return
    setSessionPosition((prev) => Math.min(prev + 1, Math.max(sessionOrder.length - 1, 0)))
  }

  const goPrev = () => {
    setSessionPosition((prev) => Math.max(prev - 1, 0))
  }

  const switchLegacyMode = (mode: System1Mode) => {
    setGameMode(mode)
  }

  const resolveSnapClassify = (idx: number) => {
    if (selectedOption !== null || hasAnsweredCurrent) return
    setSelectedOption(idx)

    const option = shuffledOptions[idx]
    const correctOption = rawOptions.find((opt) => opt.correct)

    finalizeLegacyAttempt({
      correct: option?.correct ?? false,
      userAnswer: option?.code ?? '',
      correctAnswer: correctOption?.code ?? '',
      options: rawOptions.map((opt) => ({ text: opt.code, isCorrect: opt.correct })),
    })
  }

  const resolveTemplateHunt = (idx: number) => {
    if (checkState || hasAnsweredCurrent) return
    const option = shuffledSolutionOptions[idx]
    if (!option) return

    if (option.correct) {
      setSelectedOption(idx)
      finalizeLegacyAttempt({
        correct: true,
        userAnswer: option.full,
        correctAnswer: solutionOptions.find((opt) => opt.correct)?.full ?? '',
        options: solutionOptions.map((opt) => ({ text: opt.full, isCorrect: opt.correct })),
        secondTry: templateMisses.length > 0,
      })
      return
    }

    if (templateMisses.includes(idx)) return
    const misses = [...templateMisses, idx]
    setTemplateMisses(misses)

    if (misses.length >= 2) {
      setSelectedOption(idx)
      finalizeLegacyAttempt({
        correct: false,
        userAnswer: option.full,
        correctAnswer: solutionOptions.find((opt) => opt.correct)?.full ?? '',
        options: solutionOptions.map((opt) => ({ text: opt.full, isCorrect: opt.correct })),
        secondTry: true,
      })
    }
  }

  const resolveGutCheck = (idx: number) => {
    if (selectedOption !== null || gutConfidence === null || hasAnsweredCurrent) return
    const option = shuffledOptions[idx]
    const correctOption = rawOptions.find((opt) => opt.correct)
    if (!option) return
    setSelectedOption(idx)

    finalizeLegacyAttempt({
      correct: option.correct,
      userAnswer: option.code,
      correctAnswer: correctOption?.code ?? '',
      options: rawOptions.map((opt) => ({ text: opt.code, isCorrect: opt.correct })),
      confidence: gutConfidence,
    })
  }

  const resolveNoGo = (goSignal: boolean) => {
    if (checkState || hasAnsweredCurrent) return
    const shouldGo = trapOption?.correct ?? false

    finalizeLegacyAttempt({
      correct: shouldGo === goSignal,
      userAnswer: goSignal ? 'GO' : 'NO-GO',
      correctAnswer: shouldGo ? 'GO' : 'NO-GO',
      options: rawOptions.map((opt) => ({ text: opt.code, isCorrect: opt.correct })),
      falseAlarm: !shouldGo && goSignal,
    })
  }

  const resolveDuel = (idx: number) => {
    if (selectedOption !== null || hasAnsweredCurrent) return
    const option = duelOptions[idx]
    const correctOption = duelOptions.find((opt) => opt.correct)
    if (!option) return
    setSelectedOption(idx)

    finalizeLegacyAttempt({
      correct: option.correct,
      userAnswer: option.code,
      correctAnswer: correctOption?.code ?? '',
      options: duelOptions.map((opt) => ({ text: opt.code, isCorrect: opt.correct })),
    })
  }

  const attempts = Object.keys(sessionResults).length
  const correctCount = Object.values(sessionResults).filter(Boolean).length
  const exactAccuracy = attempts > 0 ? Math.round((correctCount / attempts) * 100) : 0
  const avgAccuracy =
    attempts > 0
      ? Math.round(
          (Object.values(sessionAccuracyByCard).reduce((sum, value) => sum + value, 0) / attempts) * 10
        ) / 10
      : 0

  const avgAutomaticity = attempts > 0 ? Math.round((sessionAutomaticityTotal / attempts) * 10) / 10 : 0
  const sessionDurationMs = Math.max((sessionCompletedAt ?? Date.now()) - sessionStartedAt, 0)
  const canAdvance = hasAnsweredCurrent && !sessionFinished && sessionPosition < sessionOrder.length - 1
  const canGoNext = sessionPosition < sessionOrder.length - 1
  const canGoPrev = sessionPosition > 0

  useEffect(() => {
    if (!sessionFinished || sessionCompletedAt === null || sessionPersistedId !== null || sessionPersisting || sessionPersistAttempted) return

    const persist = async () => {
      setSessionPersistAttempted(true)
      setSessionPersisting(true)
      try {
        const response = await fetch(apiUrl('/api/system1-sessions'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: practiceTrack === 'main-recall' ? 'main-recall' : gameMode,
            questionType,
            orderType: sessionOrderType,
            cardCount: sessionOrder.length,
            attempts,
            correctCount,
            accuracy: avgAccuracy,
            durationMs: sessionDurationMs,
            totalScore: practiceTrack === 'main-recall' ? Math.round(avgAccuracy) : modeScore,
            avgAutomaticity: practiceTrack === 'main-recall' ? avgAccuracy : avgAutomaticity,
            startedAt: new Date(sessionStartedAt).toISOString(),
            completedAt: new Date(sessionCompletedAt).toISOString(),
          }),
        })
        if (!response.ok) throw new Error('Unable to persist session')
        const payload = (await response.json()) as { sessionId: number }
        setSessionPersistedId(payload.sessionId)
      } catch {
        // silently fail
      } finally {
        setSessionPersisting(false)
      }
    }

    void persist()
  }, [
    attempts,
    avgAccuracy,
    avgAutomaticity,
    correctCount,
    gameMode,
    modeScore,
    practiceTrack,
    questionType,
    sessionCompletedAt,
    sessionDurationMs,
    sessionFinished,
    sessionOrder.length,
    sessionOrderType,
    sessionPersistAttempted,
    sessionPersistedId,
    sessionPersisting,
    sessionStartedAt,
  ])

  useEffect(() => {
    if (!sessionFinished || practiceTrack !== 'main-recall') return
    void fetchSessionPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFinished, practiceTrack])

  const normalizedMainLines = useMemo(
    () => mainInput.replace(/\r\n/g, '\n').split('\n'),
    [mainInput]
  )
  const draftStructure = useMemo(
    () => analyzeDraftStructure(mainInput),
    [mainInput]
  )
  const lineReview = useMemo(
    () => computeLineReview(fullSolutionTarget, mainInput.replace(/\r\n/g, '\n')),
    [fullSolutionTarget, mainInput]
  )
  const isGraphQuestion =
    questionType === 'graph' || card.tags.includes('graph') || card.tags.includes('graph-bfs')
  const currentCardRecallHistory = mainRecallHistoryByCard[card.id] ?? []
  const priorCardRecallHistory =
    mainPhase === 'submitted' ? currentCardRecallHistory.slice(0, -1) : currentCardRecallHistory
  const invariantChecks = useMemo(
    () => deriveInvariantChecks(fullSolutionTarget, normalizeTyping(mainInput)),
    [fullSolutionTarget, mainInput]
  )
  const inlineCoachComments = useMemo(
    () => buildInlineCoachComments(normalizedMainLines, lineReview.reviews, isGraphQuestion, priorCardRecallHistory),
    [isGraphQuestion, lineReview.reviews, normalizedMainLines, priorCardRecallHistory]
  )
  const commentedSourceLines = useMemo(
    () => new Set(inlineCoachComments.map((item) => item.lineNumber)),
    [inlineCoachComments]
  )
  const displayLines = useMemo(() => {
    if (mainPhase === 'submitted') {
      return buildAnnotatedDisplayLines(normalizedMainLines, inlineCoachComments)
    }

    return (mainInput || '# Type the full solution from memory...')
      .split('\n')
      .map(
        (line, index): AnnotatedDisplayLine => ({
          text: line,
          sourceLineNumber: mainInput.length > 0 ? index + 1 : null,
          isComment: false,
        })
      )
  }, [inlineCoachComments, mainInput, mainPhase, normalizedMainLines])
  const displayCode = useMemo(
    () => displayLines.map((line) => line.text).join('\n'),
    [displayLines]
  )
  const liveCoachText =
    liveCoachFeedback?.primaryFocus ||
    liveCoachFeedback?.immediateCorrection ||
    buildLiveCoachFallback(draftStructure, isGraphQuestion)
  const liveCoachPrinciple = buildLiveCoachPrinciple(draftStructure, isGraphQuestion)
  const coachFocusText = coachFeedback ? stripPrefixedLabel(coachFeedback.primaryFocus, 'Primary focus') : ''
  const coachHeadline = isGraphQuestion
    ? buildGraphCoachHeadline(normalizedMainLines, lineReview.reviews, priorCardRecallHistory)
    : coachFocusText || 'Tighten the drifted lines and go again.'

  const progress = progressByCard[card.id] ?? defaultCardProgress()

  useEffect(() => {
    if (practiceTrack !== 'main-recall' || mainPhase !== 'typing' || sessionFinished || hasAnsweredCurrent) return

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
      Math.abs(trimmedInput.length - lastLiveCoachLengthRef.current) >= 24

    if (!shouldRefresh) return

    const timeoutId = window.setTimeout(() => {
      const target = fullSolutionTarget
      const compareLength = Math.max(trimmedInput.length, target.length, 1)
      let exactMatches = 0
      for (let i = 0; i < compareLength; i += 1) {
        if (trimmedInput[i] === target[i]) exactMatches += 1
      }
      const accuracy = Math.round((exactMatches / compareLength) * 100)

      lastLiveCoachMilestoneRef.current = draftStructure.milestoneKey
      lastLiveCoachLengthRef.current = trimmedInput.length

      void fetchLiveCoachFeedback({
        expectedAnswer: target,
        userAnswer: trimmedInput,
        elapsedMs: Math.max((mainStartedAt ? Date.now() - mainStartedAt : 0), 0),
        accuracy,
        exact: trimmedInput === target,
        previousAttempts: currentCardRecallHistory,
        draft: draftStructure,
      })
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [
    currentCardRecallHistory,
    draftStructure,
    fullSolutionTarget,
    hasAnsweredCurrent,
    mainInput,
    mainPhase,
    mainStartedAt,
    practiceTrack,
    sessionFinished,
  ])

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-left">
          <span className="navbar-brand">System 1 Trainer</span>
          <span className="navbar-divider" />
          <div className="navbar-group">
            {(['tree', 'stack', 'graph', 'top150'] as QuestionType[]).map((qt) => (
              <button
                key={qt}
                className={questionType === qt ? 'nav-tab active' : 'nav-tab'}
                onClick={() => setQuestionType(qt)}
              >
                {qt === 'tree' ? 'Tree' : qt === 'stack' ? 'Stack' : qt === 'graph' ? 'Graph' : 'Top 150'}
              </button>
            ))}
          </div>
          <span className="navbar-divider" />
          <div className="navbar-group">
            <button
              className={practiceTrack === 'main-recall' ? 'nav-tab active' : 'nav-tab'}
              onClick={() => setPracticeTrack('main-recall')}
            >
              Main Recall
            </button>
            <button
              className={practiceTrack === 'legacy' ? 'nav-tab active' : 'nav-tab'}
              onClick={() => setPracticeTrack('legacy')}
            >
              Legacy
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
          {practiceTrack === 'legacy' && (
            <>
              <span className="navbar-divider" />
              <div className="navbar-group">
                {SYSTEM1_MODE_ORDER.map((mode) => (
                  <button
                    key={mode}
                    className={gameMode === mode ? 'nav-tab active' : 'nav-tab'}
                    onClick={() => switchLegacyMode(mode)}
                    title={modeTitle(mode)}
                  >
                    {modeShortLabel(mode)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="navbar-right">
          <span className="navbar-counter">{Math.min(sessionPosition + 1, Math.max(sessionOrder.length, 1))} / {sessionOrder.length}</span>
          <Link to="/dashboard" className="navbar-dashboard">Dashboard</Link>
        </div>
      </nav>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>{card.title}</h2>
            <p className="difficulty"><span className="leetcode-num">#{card.id}</span> {card.difficulty}</p>
          </div>
          <div className="tags">
            {card.tags.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        </div>

        <div className="typing-metrics" style={{ marginBottom: '1.5rem' }}>
          <p><strong>Track:</strong> {practiceTrack === 'main-recall' ? 'Main Recall' : 'Legacy Modes'}</p>
          <p><strong>Mode:</strong> {practiceTrack === 'main-recall' ? 'Prompt → Recall Full Answer' : modeTitle(gameMode)}</p>
          <p><strong>Order:</strong> {sessionOrderType === 'shuffled' ? 'Randomized' : 'Original'}</p>
          <p><strong>Session:</strong> {attempts}/{sessionOrder.length}</p>
          <p><strong>Exact Accuracy:</strong> {exactAccuracy}%</p>
          <p><strong>Avg Accuracy:</strong> {avgAccuracy}%</p>
          <p><strong>Duration:</strong> {(sessionDurationMs / 1000).toFixed(1)}s</p>
          <p><strong>Persisted:</strong> {sessionPersistedId ? `Yes (#${sessionPersistedId})` : sessionFinished ? (sessionPersisting ? 'Saving…' : sessionPersistAttempted ? 'Save failed' : 'Pending') : 'No'}</p>
          {practiceTrack === 'legacy' && (
            <>
              <p><strong>Score:</strong> {modeScore}</p>
              <p><strong>Streak:</strong> {streak}</p>
              <p><strong>Automaticity:</strong> {automaticityIndex}</p>
              <p><strong>Strength:</strong> {Math.round(progress.strength)}</p>
            </>
          )}
        </div>

        {sessionFinished && (
          <p className="status success" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            Session complete. {attempts} cards answered. Avg accuracy: {avgAccuracy}%.
          </p>
        )}
        {sessionFinished && practiceTrack === 'main-recall' && (
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
            <p className="prompt">{card.prompt}</p>
            <button className="link" onClick={() => setShowHint((prev) => !prev)}>
              {showHint ? 'Hide hint' : 'Show hint'}
            </button>
            {showHint && <p className="hint">{card.hint}</p>}
            {practiceTrack === 'legacy' && <p className="hint" style={{ marginTop: '1rem' }}>{modeDescription(gameMode)}</p>}
          </div>

          <div className="panel">
            {practiceTrack === 'main-recall' ? (
              <>
                <h3>Main Recall Flow</h3>
                {mainPhase === 'preview' && (
                  <>
                    <p className="answer-label">Study the full answer, then hide it and recall from memory.</p>
                    <div className="code-container">
                      <SyntaxHighlighter
                        language="python"
                        style={vscDarkPlus}
                        customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                        codeTagProps={{ style: { background: 'transparent' } }}
                      >
                        {fullSolutionTarget}
                      </SyntaxHighlighter>
                    </div>
                    <div className="actions">
                      <button onClick={startMainRecall} disabled={hasAnsweredCurrent || sessionFinished}>Hide answer and start recall</button>
                    </div>
                  </>
                )}

                {mainPhase !== 'preview' && (
                  <>
                    <label className="answer-label" htmlFor="main-recall-input">
                      Type the full answer from memory
                    </label>
                    <div className="vscode-editor-container">
                      <div className="vscode-tabs">
                        <div className="vscode-tab active">recall.py</div>
                      </div>
                      <div className="typing-editor-shell">
                        {mainPhase === 'submitted' && (
                          <div className="coach-banner">
                            <div className="coach-banner-main">
                              <span className="coach-banner-label">Coach focus</span>
                              <p>{coachHeadline}</p>
                            </div>
                            <div className="coach-banner-stats">
                              <span>{mainLevel}</span>
                              <span>{mainAccuracy}%</span>
                              <span>{(mainElapsedMs / 1000).toFixed(1)}s</span>
                              <span>{checkState === 'correct' ? 'Exact' : 'Drift'}</span>
                            </div>
                          </div>
                        )}
                        <div className="typing-editor">
                          <div className="typing-gutter" aria-hidden="true" ref={mainGutterRef}>
                            {displayLines.map((line, i) => {
                              const status =
                                mainPhase === 'submitted' && line.sourceLineNumber
                                  ? lineReview.actualStatuses[line.sourceLineNumber - 1] ?? 'match'
                                  : null
                              const hasComment =
                                mainPhase === 'submitted' &&
                                !line.isComment &&
                                line.sourceLineNumber !== null &&
                                commentedSourceLines.has(line.sourceLineNumber)
                              return (
                                <div
                                  key={i}
                                  className={`typing-line-number${status ? ` line-${status}` : ''}${hasComment ? ' line-reviewed' : ''}${line.isComment ? ' line-comment' : ''}`}
                                >
                                  {i + 1}
                                  {hasComment && <span className="typing-line-marker" />}
                                </div>
                              )
                            })}
                          </div>
                          <div className="typing-code-area">
                            <div className="typing-highlight" aria-hidden="true" ref={mainHighlightRef}>
                              <SyntaxHighlighter
                                language="python"
                                style={vscDarkPlus}
                                wrapLines
                                lineProps={(lineNumber) => {
                                  const line = displayLines[lineNumber - 1]
                                  if (!line) {
                                    return { className: 'typing-highlight-line' }
                                  }
                                  if (line.isComment) {
                                    return {
                                      className: `typing-highlight-line inline-comment-line tone-${line.tone ?? 'guide'}`,
                                    }
                                  }

                                  const status =
                                    mainPhase === 'submitted' && line.sourceLineNumber
                                      ? lineReview.actualStatuses[line.sourceLineNumber - 1] ?? 'match'
                                      : null
                                  const hasComment =
                                    mainPhase === 'submitted' &&
                                    line.sourceLineNumber !== null &&
                                    commentedSourceLines.has(line.sourceLineNumber)
                                  return {
                                    className: `typing-highlight-line${status ? ` line-${status}` : ''}${hasComment ? ' line-reviewed' : ''}`,
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
                                placeholder="Type the full solution from memory..."
                              />
                            )}
                          </div>
                        </div>
                        {mainPhase === 'typing' && (
                          <div className="coach-docked-panel coach-docked-panel-idle">
                            <div className="coach-docked-card">
                              <div className="coach-card-header">
                                <h4>Live Coach</h4>
                                <span className="live-coach-indicator" aria-label="Live coach active">
                                  <span className="live-coach-dot" />
                                </span>
                              </div>
                              <p className="coach-panel-copy">{liveCoachText}</p>
                              <p className="coach-muted">
                                <strong>Always remember:</strong> {liveCoachPrinciple}
                              </p>
                              {liveCoachLoading && <p className="coach-muted">Refreshing live guidance...</p>}
                              {liveCoachError && <p className="coach-error">{liveCoachError}</p>}
                            </div>
                          </div>
                        )}
                        {mainPhase === 'submitted' && (
                          <div className="coach-docked-panel">
                            <div className="coach-docked-card">
                              <h4>Invariants</h4>
                              {coachLoading && <p className="coach-muted">Refining comment wording...</p>}
                              {coachError && <p className="coach-error">{coachError}</p>}
                              <ul className="coach-micro-list">
                                {invariantChecks.length > 0 ? (
                                  invariantChecks.map((item) => (
                                    <li key={item.label}>
                                      <strong>{item.matched ? 'Hold:' : 'Miss:'}</strong> {item.label} - {compactCodeLine(item.anchor, 72)}
                                    </li>
                                  ))
                                ) : (
                                  <li>No invariant detected yet.</li>
                                )}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="typing-help">
                      Tab inserts 4 spaces · Shift+Tab outdents · Enter auto-indents · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to submit
                    </p>
                    {mainPhase === 'typing' && (
                      <div className="actions">
                        <button onClick={submitMainRecall} disabled={mainInput.trim().length === 0}>Submit recall</button>
                      </div>
                    )}
                    {mainPhase === 'submitted' && !mainCloseEnough && (
                      <div className="actions">
                        <button onClick={reviseMainRecall} disabled={sessionFinished}>Revise and resubmit</button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {(gameMode === 'snap-classify' || gameMode === 'gut-check') && (
                  <>
                    <h3>Fill the missing line</h3>
                    <div className="code-container">
                      {card.solution
                        .split('{{missing}}')
                        .map((part, i, array) => (
                          <div key={i} style={{ display: 'contents' }}>
                            <SyntaxHighlighter
                              language="python"
                              style={vscDarkPlus}
                              customStyle={{ margin: 0, padding: 0, background: 'transparent', display: 'inline' }}
                              PreTag="span"
                            >
                              {part}
                            </SyntaxHighlighter>
                            {i < array.length - 1 && (
                              <span className={showAnswer ? 'missing filled' : 'missing'}>
                                {showAnswer ? card.missing : '____'}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>

                    {gameMode === 'gut-check' && (
                      <div className="actions" style={{ marginBottom: '1rem' }}>
                        {[0.6, 0.75, 0.9].map((value) => (
                          <button
                            key={value}
                            className={gutConfidence === value ? '' : 'secondary'}
                            onClick={() => setGutConfidence(value)}
                            disabled={hasAnsweredCurrent}
                          >
                            {Math.round(value * 100)}% confidence
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="options-list">
                      {shuffledOptions.map((option, idx) => {
                        const letter = String.fromCharCode(65 + idx)
                        let cls = 'option-btn'
                        if (selectedOption !== null || hasAnsweredCurrent) {
                          if (option.correct) cls += ' option-correct'
                          else if (idx === selectedOption) cls += ' option-incorrect'
                          else cls += ' option-dimmed'
                        }
                        return (
                          <button
                            key={idx}
                            className={cls}
                            onClick={() => (gameMode === 'gut-check' ? resolveGutCheck(idx) : resolveSnapClassify(idx))}
                            disabled={hasAnsweredCurrent || (gameMode === 'gut-check' && gutConfidence === null)}
                          >
                            <span className="option-letter">{letter}</span>
                            <SyntaxHighlighter
                              language="python"
                              style={vscDarkPlus}
                              customStyle={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: '4px', flex: 1, minWidth: 0 }}
                              PreTag="div"
                            >
                              {option.code}
                            </SyntaxHighlighter>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}

                {gameMode === 'template-hunt' && (
                  <>
                    <h3>Template Hunt</h3>
                    <div className="options-list">
                      {shuffledSolutionOptions.map((option, idx) => {
                        const letter = String.fromCharCode(65 + idx)
                        let cls = 'option-btn solution-option'
                        if (checkState || hasAnsweredCurrent) {
                          if (option.correct) cls += ' option-correct'
                          else if (idx === selectedOption || templateMisses.includes(idx)) cls += ' option-incorrect'
                          else cls += ' option-dimmed'
                        } else if (templateMisses.includes(idx)) {
                          cls += ' option-incorrect'
                        }
                        return (
                          <button
                            key={idx}
                            className={cls}
                            onClick={() => resolveTemplateHunt(idx)}
                            disabled={hasAnsweredCurrent || checkState !== null || templateMisses.includes(idx)}
                          >
                            <span className="option-letter">{letter}</span>
                            <div className="option-solution">
                              <SyntaxHighlighter
                                language="python"
                                style={vscDarkPlus}
                                customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                                codeTagProps={{ style: { background: 'transparent' } }}
                              >
                                {option.full}
                              </SyntaxHighlighter>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}

                {gameMode === 'no-go-trap' && (
                  <>
                    <h3>No-Go Trap</h3>
                    <div className="code-container" style={{ marginBottom: '1rem' }}>
                      <SyntaxHighlighter
                        language="python"
                        style={vscDarkPlus}
                        customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                        PreTag="div"
                      >
                        {trapOption?.code ?? card.missing}
                      </SyntaxHighlighter>
                    </div>
                    <div className="actions">
                      <button onClick={() => resolveNoGo(true)} disabled={hasAnsweredCurrent}>GO</button>
                      <button className="secondary" onClick={() => resolveNoGo(false)} disabled={hasAnsweredCurrent}>NO-GO</button>
                    </div>
                  </>
                )}

                {gameMode === 'near-miss-duel' && (
                  <>
                    <h3>Near-Miss Duel</h3>
                    <div className="options-list">
                      {duelOptions.map((option, idx) => {
                        const letter = String.fromCharCode(65 + idx)
                        let cls = 'option-btn'
                        if (selectedOption !== null || hasAnsweredCurrent) {
                          if (option.correct) cls += ' option-correct'
                          else if (idx === selectedOption) cls += ' option-incorrect'
                          else cls += ' option-dimmed'
                        }
                        return (
                          <button
                            key={idx}
                            className={cls}
                            onClick={() => resolveDuel(idx)}
                            disabled={hasAnsweredCurrent}
                          >
                            <span className="option-letter">{letter}</span>
                            <SyntaxHighlighter
                              language="python"
                              style={vscDarkPlus}
                              customStyle={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: '4px', flex: 1, minWidth: 0 }}
                              PreTag="div"
                            >
                              {option.code}
                            </SyntaxHighlighter>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {practiceTrack === 'main-recall' && mainPhase === 'submitted' && (
              <p className={mainCloseEnough ? 'status success' : 'status error'}>
                {mainCloseEnough
                  ? sessionResults[card.id]
                    ? 'Exact match recorded.'
                    : `Close enough recorded at ${mainAccuracy}% (threshold ${MAIN_RECALL_CLOSE_ENOUGH_ACCURACY}%).`
                  : `Not close enough yet. Stay on this card and iterate until you reach ${MAIN_RECALL_CLOSE_ENOUGH_ACCURACY}% or exact.`}
              </p>
            )}
            {practiceTrack !== 'main-recall' && hasAnsweredCurrent && (
              <p className={sessionResults[card.id] ? 'status success' : 'status error'}>
                {sessionResults[card.id] ? 'Exact match recorded.' : 'Attempt recorded. Keep rehearsing this one.'}
              </p>
            )}

            {canAdvance && (
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
            <button className="secondary" onClick={startSession}>Restart session</button>
          </div>
          <p className="card-footer-hint">
            {practiceTrack === 'main-recall'
              ? 'Sessions start in original order by default. Use Randomize when you want mixed reps; progress is persisted at session completion.'
              : 'Sessions start in original order by default. Use Randomize when you want mixed reps; progress is persisted at session completion.'}
          </p>
        </div>
      </section>
    </div>
  )
}

export default App
