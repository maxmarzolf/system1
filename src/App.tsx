import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Flashcard } from './data/flashcards'
import { skillMap } from './data/skill-map'
import { loadStoredLiveCoachTuning } from './liveCoachTuning'

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

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiUrl = (path: string) => `${API_BASE_URL}${path}`
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
  const [skillMapDeck, setSkillMapDeck] = useState<Flashcard[]>([])
  const [skillMapLoading, setSkillMapLoading] = useState(false)
  const [skillMapError, setSkillMapError] = useState('')
  const [skillMapRefreshToken, setSkillMapRefreshToken] = useState(0)

  const [sessionOrder, setSessionOrder] = useState<number[]>([])
  const [sessionPosition, setSessionPosition] = useState(0)
  const [sessionFinished, setSessionFinished] = useState(false)
  const [sessionStartedAt, setSessionStartedAt] = useState(Date.now())
  const [sessionCompletedAt, setSessionCompletedAt] = useState<number | null>(null)
  const [sessionResults, setSessionResults] = useState<Record<string, boolean>>({})
  const [sessionAccuracyByCard, setSessionAccuracyByCard] = useState<Record<string, number>>({})
  const [sessionElapsedByCard, setSessionElapsedByCard] = useState<Record<string, number>>({})
  const [sessionPlanRequested, setSessionPlanRequested] = useState(false)

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
    setSessionStartedAt(Date.now())
    setSessionCompletedAt(null)
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
  }, [skillMapRefreshToken])

  useEffect(() => {
    if (skillMapLoading) return
    startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredDeck, sessionOrderType, skillMapLoading])

  const currentDeckIndex = sessionOrder[sessionPosition] ?? 0
  const card = filteredDeck[currentDeckIndex] ?? filteredDeck[0] ?? emptySkillMapCard
  const fullSolutionTarget = useMemo(
    () => normalizeTyping(card.solution.replace('{{missing}}', card.missing)),
    [card.missing, card.solution]
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
      questionType,
    })

    card.tags.forEach((tag) => {
      searchParams.append('tag', tag)
    })

    return `/practice-history?${searchParams.toString()}`
  }, [card.id, card.tags, card.title, hasDeck, questionType])

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
          questionType,
          categoryTags: card.tags,
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
        }),
      })
      if (!response.ok) throw new Error('Unable to evaluate attempt')
      return (await response.json()) as AttemptEvaluationResponse
    } catch {
      const compareLength = Math.max(userAnswer.length, expectedAnswer.length, 1)
      let exactMatches = 0
      for (let i = 0; i < compareLength; i += 1) {
        if (userAnswer[i] === expectedAnswer[i]) exactMatches += 1
      }

      return {
        accuracy: Math.round((exactMatches / compareLength) * 100),
        sound: userAnswer === expectedAnswer,
        syntaxValid: true,
      }
    }
  }

  const resetPerCardInteraction = () => {
    setShowHint(false)

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

  useEffect(() => {
    resetPerCardInteraction()
  }, [card.id, sessionPosition])

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
          skillTags: card.tags,
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
          liveCoachTuning,
          liveCoachContext: {
            ignoredDrillDownKey,
            completedDrillDownKey,
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
          skillTags: card.tags,
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

  const submitMainRecall = async () => {
    if (!hasDeck || hasAnsweredCurrent || sessionFinished || mainPhase !== 'typing') return

    const startedAt = mainStartedAt ?? Date.now()
    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const elapsedMs = Math.max(Date.now() - startedAt, 1)
    const normalizedInput = normalizeTyping(mainInput)
    const normalizedInputLines = normalizedInput.split('\n')
    const normalizedTarget = fullSolutionTarget
    const evaluation = await evaluateSubmittedRecall(normalizedTarget, normalizedInput)
    const accuracy = Math.round(evaluation.accuracy)
    const sound = evaluation.sound
    const closeEnough = sound
    const currentHistory = mainRecallHistoryByCard[card.id] ?? []
    const attemptSnapshot = summarizeRecallAttempt(
      normalizedInputLines,
      accuracy,
      sound,
      elapsedMs,
      currentHistory.length + 1
    )

    setMainCloseEnough(closeEnough)
    setMainPhase('submitted')
    setMainRecallHistoryByCard((prev) => ({
      ...prev,
      [card.id]: [...(prev[card.id] ?? []), attemptSnapshot],
    }))

    if (closeEnough) {
      completeCardInSession(sound, accuracy, elapsedMs)
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
  const exactAccuracy = attempts > 0 ? Math.round((correctCount / attempts) * 100) : 0
  const avgAccuracy =
    attempts > 0
      ? Math.round(
          (Object.values(sessionAccuracyByCard).reduce((sum, value) => sum + value, 0) / attempts) * 10
        ) / 10
      : 0

  const sessionDurationMs = Math.max((sessionCompletedAt ?? Date.now()) - sessionStartedAt, 0)
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
    () => analyzeDraftStructure(mainInput),
    [mainInput]
  )
  const lineReview = useMemo(
    () => computeLineReview(fullSolutionTarget, mainInput.replace(/\r\n/g, '\n')),
    [fullSolutionTarget, mainInput]
  )
  const isGraphQuestion =
    card.tags.includes('graph') || card.tags.includes('graph-bfs')
  const currentCardRecallHistory = useMemo(
    () => mainRecallHistoryByCard[card.id] ?? [],
    [card.id, mainRecallHistoryByCard]
  )
  const priorCardRecallHistory =
    mainPhase === 'submitted' ? currentCardRecallHistory.slice(0, -1) : currentCardRecallHistory
  const displayLines = useMemo(() => {
    const source = mainPhase === 'submitted'
      ? (mainInput || '')
      : (mainInput || '# Type the full solution from memory...')

    return source
      .split('\n')
      .map(
        (line, index): AnnotatedDisplayLine => ({
          text: line,
          sourceLineNumber: source.length > 0 ? index + 1 : null,
        })
      )
  }, [mainInput, mainPhase])
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
    const target = fullSolutionTarget
    const compareLength = Math.max(trimmedInput.length, target.length, 1)
    let exactMatches = 0
    for (let i = 0; i < compareLength; i += 1) {
      if (trimmedInput[i] === target[i]) exactMatches += 1
    }
    const accuracy = Math.round((exactMatches / compareLength) * 100)

    lastLiveCoachMilestoneRef.current = draftStructure.milestoneKey
    lastLiveCoachLengthRef.current = trimmedInput.length

    void requestLiveCoachFeedback({
      interactionId,
      expectedAnswer: target,
      userAnswer: trimmedInput,
      elapsedMs: Math.max((mainStartedAt ? Date.now() - mainStartedAt : 0), 0),
      accuracy,
      exact: trimmedInput === target,
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
    coachFeedback?.immediateCorrection || coachFeedback?.primaryFocus || 'Review the drifted step, then retype the full answer once more.'
  const submissionFeedbackText = (coachFeedback?.fullFeedback || '').trim() || [
    submissionFeedbackSummary,
    `Next step: ${submissionFeedbackNextStep}`,
  ].join('\n\n')
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
  const showSubmittedLineReview = mainPhase === 'submitted' && !mainCloseEnough

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
      Math.abs(trimmedInput.length - lastLiveCoachLengthRef.current) >= 24

    if (!shouldRefresh) return

    const timeoutId = window.setTimeout(() => {
      triggerLiveCoachRefresh(trimmedInput)
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [
    draftStructure,
    hasDeck,
    hasAnsweredCurrent,
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
      if (idleForMs < 20_000 || sinceLastIdleRefreshMs < 20_000) return

      lastIdleLiveCoachRefreshAtRef.current = now
      triggerLiveCoachRefresh(trimmedInput)
    }, 2_000)

    return () => window.clearInterval(intervalId)
  }, [
    draftStructure.nonEmptyLines,
    hasDeck,
    hasAnsweredCurrent,
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
          <p><strong>Flow:</strong> Prompt → Recall Full Answer</p>
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
                  <button onClick={startMainRecall} disabled={!hasDeck || hasAnsweredCurrent || sessionFinished}>Hide answer and start recall</button>
                </div>
              </>
            )}

            {hasDeck && mainPhase !== 'preview' && (
              <>
                <label className="answer-label" htmlFor="main-recall-input">
                  Type the full answer from memory
                </label>
                <div className="vscode-editor-container">
                  <div className="vscode-tabs">
                    <div className="vscode-tab active">recall.py</div>
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
                            language="python"
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
                            placeholder="Type the full solution from memory..."
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
                          {coachLoading && <p className="coach-muted">Refining submission feedback...</p>}
                          {coachError && <p className="coach-error">{coachError}</p>}
                          {submissionFeedbackParagraphs.map((paragraph, index) => (
                            <p key={index} className="coach-panel-copy">
                              {paragraph}
                            </p>
                          ))}
                          {submissionCorrectedVersion && (
                            <div className="coach-code-review">
                              <p className="coach-code-label">Corrected version</p>
                              <div className="code-container">
                                <SyntaxHighlighter
                                  language="python"
                                  style={vscDarkPlus}
                                  customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                                  codeTagProps={{ style: { background: 'transparent' } }}
                                >
                                  {submissionCorrectedVersion}
                                </SyntaxHighlighter>
                              </div>
                            </div>
                          )}
                          <p className="coach-muted">
                            <strong>Next step:</strong> {submissionFeedbackNextStep}
                          </p>
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

            {hasDeck && mainPhase === 'submitted' && (
              <p className={mainCloseEnough ? 'status success' : 'status error'}>
                {mainCloseEnough
                  ? 'Sound solution recorded.'
                  : 'This attempt is not sound yet. Revise the logic and submit again.'}
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
