import { type CSSProperties, type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSearchParams } from 'react-router-dom'
import FlowBuilder from './FlowBuilder'
import {
  FLOW_COACH_LABELS,
  FLOW_LABELS,
  buildFlowTransitionCopy,
  buildFlowGenerationContext,
  expandFlow,
  loadFlowConfig,
  mergeFlowAttempts,
  nextFlowStep,
  saveFlowConfig,
  summarizeFlowMastery,
  type FlowAttempt,
  type FlowConfig,
  type FlowGenerationContext,
  type FlowStage,
  type SubmissionModality,
} from './practiceFlow'
import RelatedLeetCodeDrawer from './RelatedLeetCodeDrawer'
import { skillMap, type SkillMapNode } from './data/skill-map'
import { playlistQuestionsToSkillMap, practicePlaylists, type PracticePlaylist } from './data/playlists'
import { resolveRelatedLeetCodeSet } from './data/related-leetcode'
import { loadStoredLiveCoachTuning, saveStoredLiveCoachTuning } from './liveCoachTuning'
import { loadStoredSubmissionTuning, saveStoredSubmissionTuning } from './submissionTuning'
import { loadStoredSpecimenTuning } from './specimenTuning'
import type { SpecimenTuning } from './specimenTuning'
import { loadStoredCodeEditorTuning } from './codeEditorTuning'
import { loadStoredMcqTuning, type McqFlowMode, type McqSourceMode } from './mcqTuning'
import { loadStoredGooglePlaylistTuning, type GooglePlaylistOrder } from './googlePlaylistTuning'
import { apiUrl } from './api'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'
import { useTheme, type AppTheme } from './theme'
import RecallCodeEditor, { type RecallCodeEditorHandle, type RecallEditorLineMeta } from './RecallCodeEditor'
import {
  formatHotkey,
  matchesHotkey,
  type PracticeFlowStage,
} from './hotkeys'

type Flashcard = {
  id: string
  title: string
  difficulty: 'Easy' | 'Med.' | 'Hard'
  prompt: string
  explanation?: string
  templatePrompts?: Partial<Record<TemplateMode | HelperLayer | CoreShapeLayer, string>>
  templateTargets?: Partial<Record<TemplateMode | HelperLayer | CoreShapeLayer, string>>
  solution: string
  missing: string
  hint: string
  tags: string[]
  plainEnglishPromptDetail?: PlainEnglishPromptDetail
  skeletonApplicability?: {
    templateStrength: number
    applicationAbstraction: number
    summary: string
    explanation: string
    invariant: string
    timeComplexity: string
  } | null
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
  algorithm: string
  skill?: string
  difficulty: MultipleChoiceDifficulty
  question: string
  choices: MultipleChoiceChoice[]
  correctChoiceId: string
  explanation: string
  tags: string[]
}

type MultipleChoiceSpecimenFocusLine = {
  lineNumber: number
  expected: string
  actual: string
  status: 'mismatch' | 'missing' | 'extra'
}

type MultipleChoiceSpecimenFocus = {
  sequenceStage: 'recall' | 'ghost' | 'multiple-choice'
  focusSummary: string
  missedLines: MultipleChoiceSpecimenFocusLine[]
  phase?: FlowGenerationContext['phase']
  proficiency?: number
  weaknessSummary?: string
  recentAttempts?: FlowGenerationContext['recentAttempts']
}

type PracticeFlowState = {
  anchorCardId: string
  anchorTitle: string
  cycle: number
  stage: FlowStage
  config: FlowConfig
  step: number
  runId: string
  focus: MultipleChoiceSpecimenFocus
  completedAnchorIds: string[]
}

type PracticeFlowTransitionState = {
  id: string
  fromStage: FlowStage | null
  toStage: FlowStage
  anchorCardId: string
  step: number
  startedAt: number
  headline: string
  detail: string
  status: string
}

const CARD_MOVE_DOUBLE_TAP_WINDOW_MS = 350
const FLOW_TRANSITION_MINIMUM_MS = 700
const SUBMISSION_FEEDBACK_ENABLED = true
const INLINE_FEEDBACK_ENABLED = true
const LIVE_FEEDBACK_ENABLED = true

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

type AttemptRequestSignals = {
  flow?: Record<string, unknown>
  modality?: Record<string, unknown>
}

type AttemptPayload = {
  question?: string
  microdrill?: boolean
  mode: 'main-recall'
  correctAnswer: string
  userAnswer: string
  elapsedMs: number
  sessionId?: string
  interactionId: string
  templateMode: TemplateMode
  supportLayer: SupportLayer
  modality: SubmissionModality
  signals?: AttemptRequestSignals
  liveCoachUsed: boolean
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
  llmUsed?: boolean
  llmProvider?: string
}

type SubmissionEvaluation = {
  version: number
  verdict: string
  score: Record<string, number>
  primaryFailure: Record<string, unknown>
  dimensions: Record<string, unknown>
  modifiers: Record<string, unknown>
  recommendedAction: string
  feedback: CoachAttemptFeedback | Record<string, never>
  provenance: {
    llmUsed: boolean
    provider: string
    source: string
  }
}

type SubmissionSaveResponse = {
  saved: boolean
  attemptId: number | null
  successful: boolean
  evaluation: SubmissionEvaluation
  feedbackUnavailable?: {
    code: string
    message: string
    provider: string
  } | null
}

type FlowHistoryEntry = {
  attemptId: number
  sessionId: string
  interactionId: string
  cardId: string
  question: string
  successful: boolean
  modality: string
  signals: {
    elapsedMs: number
    evaluation: Record<string, unknown>
    flow: Record<string, unknown>
    modality: Record<string, unknown>
  }
  createdAt: string
}

type FlowHistoryResponse = { entries: FlowHistoryEntry[] }

type FeedbackRailModel = {
  source: 'Live' | 'Submission'
  items: string[]
  loading?: boolean
  submitted?: boolean
}

type SubmissionFailureModalState = {
  providerLabel: string
  message: string
}

const compactFeedbackItems = (items: Array<string | undefined>, limit = 4) => {
  const seen = new Set<string>()
  return items
    .map((item) => item?.trim() ?? '')
    .filter((item) => {
      if (!item) return false
      const key = item.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

const isSubmissionModality = (value: unknown): value is SubmissionModality =>
  value === 'total-recall' || value === 'ghost-rep' || value === 'mcq' || value === 'microdrill'

const flowEvaluationScore = (evaluation: Record<string, unknown>) => {
  const score = evaluation.score
  const overall = score && typeof score === 'object' ? Number((score as Record<string, unknown>).overall) : 0
  return Number.isFinite(overall) ? Math.max(0, Math.min(100, overall)) : 0
}

const flowEvaluationWeaknesses = (evaluation: Record<string, unknown>, missedLineCount = 0) => {
  const primaryFailure = evaluation.primaryFailure && typeof evaluation.primaryFailure === 'object'
    ? evaluation.primaryFailure as Record<string, unknown>
    : {}
  const feedback = evaluation.feedback && typeof evaluation.feedback === 'object'
    ? evaluation.feedback as Record<string, unknown>
    : {}
  const errorTags = Array.isArray(feedback.errorTags) ? feedback.errorTags.map(String) : []
  return compactFeedbackItems([
    String(primaryFailure.label ?? primaryFailure.key ?? ''),
    String(feedback.primaryFocus ?? ''),
    ...errorTags,
    missedLineCount > 0 ? `${missedLineCount} missed code line${missedLineCount === 1 ? '' : 's'}` : '',
  ])
}

const flowModalityWeakness = (modality: SubmissionModality, successful: boolean) => {
  if (successful) return ''
  if (modality === 'mcq') return 'incorrect conceptual choice'
  if (modality === 'microdrill') return 'code reconstruction remained unsound'
  if (modality === 'ghost-rep') return 'targeted recall remained unsound'
  return 'full recall remained unsound'
}

const flowAttemptFromHistoryEntry = (entry: FlowHistoryEntry, anchorCardId: string): FlowAttempt | null => {
  if (!isSubmissionModality(entry.modality)) return null
  const storedAnchor = String(entry.signals.flow?.anchorCardId ?? entry.cardId ?? '')
  if (storedAnchor !== anchorCardId) return null
  const missedLineCount = Number(entry.signals.modality?.missedLineCount ?? 0)
  return {
    attemptId: entry.attemptId,
    interactionId: entry.interactionId,
    anchorCardId: storedAnchor,
    modality: entry.modality,
    successful: entry.successful,
    score: flowEvaluationScore(entry.signals.evaluation ?? {}),
    elapsedMs: Number(entry.signals.elapsedMs ?? 0),
    missedLineCount: Number.isFinite(missedLineCount) ? Math.max(0, missedLineCount) : 0,
    weaknesses: compactFeedbackItems([
      ...flowEvaluationWeaknesses(entry.signals.evaluation ?? {}, missedLineCount),
      flowModalityWeakness(entry.modality, entry.successful),
    ]),
    question: entry.question,
    createdAt: entry.createdAt,
  }
}

const requestFlowAttemptHistory = async (anchorCard: Flashcard): Promise<FlowAttempt[]> => {
  const response = await fetch(apiUrl('/api/coach/history'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId: anchorCard.id, questionType: '', skillTags: [], limit: 20 }),
  })
  if (!response.ok) throw new Error('Unable to load flow history')
  const payload = await response.json() as FlowHistoryResponse
  return payload.entries
    .map((entry) => flowAttemptFromHistoryEntry(entry, anchorCard.id))
    .filter((entry): entry is FlowAttempt => entry !== null)
    .reverse()
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
  sourceMode: McqSourceMode
  flowMode: McqFlowMode
  specimen?: MultipleChoiceSpecimenContext
  llmProvider: string
}

type MultipleChoiceSpecimenContext = {
  cardId: string
  cardTitle: string
  algorithm: string
  prompt: string
  target: string
  tags: string[]
  focus?: MultipleChoiceSpecimenFocus
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
type LiveFeedbackTrigger = 'auto' | 'hotkey-stuck'

type LiveInlineNote = {
  text: string
  sourceLineNumber: number | null
  tone: LiveInlineTone
  maxWords?: number
}

type LiveLineAnnotation = {
  note: string
  tone: LiveInlineTone
  maxWords?: number
}

type LiveFeedbackMeta = {
  trigger: LiveFeedbackTrigger
  hintDepth: number
  cursorLineNumber: number | null
}

type HotkeyEditContext = {
  changedSinceLastHint: boolean
  changedLineNumber: number | null
  changedLineText: string
  addedLines: string[]
  progressSignals: string[]
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

const firstChangedLineIndex = (previousText: string, nextText: string) => {
  const previousLines = previousText.replace(/\r\n/g, '\n').split('\n')
  const nextLines = nextText.replace(/\r\n/g, '\n').split('\n')
  const maxLines = Math.max(previousLines.length, nextLines.length)
  for (let index = 0; index < maxLines; index += 1) {
    if ((previousLines[index] ?? '') !== (nextLines[index] ?? '')) return index
  }
  return -1
}

type RecallAttemptSnapshot = {
  attemptNumber: number
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
  nonEmptyLines: number
  changedLine: number
  sameLineEditCount: number
  lastMeaningfulProgressAt: number
}

type LlmProvider = 'openai' | 'claude' | 'gemma'
type LlmProviderSelection = 'auto' | LlmProvider

const skillMapDeckRequestCache = new Map<string, Promise<SkillMapDrillsResponse>>()
const multipleChoiceDeckRequestCache = new Map<string, Promise<MultipleChoiceDrillsResponse>>()

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

const requestCoreAlgorithmDrills = (algorithmSlug: string) => {
  const requestKey = `core-algorithm:${algorithmSlug}`
  const existingRequest = skillMapDeckRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const request = fetch(apiUrl(`/api/coach/problem-drills/${encodeURIComponent(algorithmSlug)}`))
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

  const request = fetch(apiUrl(`/api/coach/problem-drills?count=${count}`))
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

  const request = fetch(apiUrl(`/api/coach/problem-drills?tag=${encodeURIComponent(tagSlug)}&count=${count}`))
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

const requestStaticPlaylistDrills = (playlistSlug: string, order: GooglePlaylistOrder) => {
  const requestKey = `static-playlist:${playlistSlug}:${order}`
  const existingRequest = skillMapDeckRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const params = new URLSearchParams({ order })
  const request = fetch(apiUrl(`/api/coach/playlist-drills/${encodeURIComponent(playlistSlug)}?${params.toString()}`))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Unable to load static playlist')
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

const ensureTemplateModes = (modes: TemplateMode[]) => {
  const next = TEMPLATE_MODE_ORDER.filter((mode) => modes.includes(mode))
  return next.length > 0 ? next : [...DEFAULT_TEMPLATE_MODES]
}

const getPrimaryPatternTag = (tags: string[]) => {
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

const normalizeTyping = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()

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
  const maxWords = incoming.maxWords ?? current?.maxWords
  const compactNote = shortenAnnotationNote(incoming.text, maxWords)
  if (!compactNote) {
    return current ?? { note: '', tone: incoming.tone, maxWords }
  }

  if (!current || !current.note) {
    return { note: compactNote, tone: incoming.tone, maxWords }
  }

  const currentParts = current.note.split(' / ').map((part) => part.trim().toLowerCase())
  if (currentParts.includes(compactNote.toLowerCase())) {
    return {
      note: current.note,
      tone: mergeLiveTone(current.tone, incoming.tone),
      maxWords,
    }
  }

  return {
    note: `${current.note} / ${compactNote}`,
    tone: mergeLiveTone(current.tone, incoming.tone),
    maxWords,
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
    case 'graphs':
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
    if (patternTag === 'graphs' || patternTag === 'dfs-bfs' || patternTag === 'graph-traversal') return 'process frontier until empty'
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
  if (patternTag === 'graphs' || patternTag === 'dfs-bfs' || patternTag === 'graph-traversal') {
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

const appendAlignedNote = (line: string, note: string, maxWords = 16) => {
  const compactNote = shortenAnnotationNote(note, maxWords)
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
    graphs: {
      algorithm: 'code the frontier plus visited loop',
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
    graphs: 'expand the frontier and visit each state once',
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
  exact: boolean,
  elapsedMs: number,
  attemptNumber: number,
  supportLayer: SupportLayer
): RecallAttemptSnapshot => ({
  attemptNumber,
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

const hasUsefulLiveStructure = (trimmedInput: string, structure: LiveStructure) =>
  trimmedInput.length >= 12 && structure.nonEmptyLines >= 2

const codeLines = (value: string) => value.replace(/\r\n/g, '\n').split('\n')

const inferProblemSolvingSignals = (code: string) => {
  const lines = codeLines(code)
  const lowerCode = code.toLowerCase()
  const signals: string[] = []
  if (/^\s*if\b.*\bnot\b/m.test(code) && /return\s+none/i.test(code)) {
    signals.push('handled the empty-input guard')
  }
  if (/\b(deque|queue|q)\s*=/.test(lowerCode) || /\bdeque\s*\(/.test(lowerCode)) {
    signals.push('started a traversal frontier')
  }
  if (/^\s*while\b.*\b(q|queue|stack|deque)\b/im.test(code)) {
    signals.push('set up the traversal loop')
  }
  if (lines.some((line) => /\b(clone|copy|copies|visited|seen|map|mapping|old_to_new|node_to_clone)\b/i.test(line) && /=/.test(line))) {
    signals.push('started tracking original-to-created state, even if the shape still needs repair')
  }
  if (/\b(node\.val|neighbors|neighbor|graph\.get)\b/i.test(code)) {
    signals.push('is reasoning about node identity or neighbor expansion')
  }
  return signals.slice(0, 4)
}

const buildHotkeyEditContext = (previousText: string, nextText: string): HotkeyEditContext => {
  const changedLineIndex = previousText ? firstChangedLineIndex(previousText, nextText) : -1
  const nextLines = codeLines(nextText)
  const previousLines = codeLines(previousText)
  const addedLines = nextLines
    .filter((line) => line.trim() && !previousLines.includes(line))
    .slice(-3)
    .map((line) => line.trim())

  return {
    changedSinceLastHint: Boolean(previousText && previousText !== nextText),
    changedLineNumber: changedLineIndex >= 0 ? changedLineIndex + 1 : null,
    changedLineText: changedLineIndex >= 0 ? (nextLines[changedLineIndex] ?? '').trim() : '',
    addedLines,
    progressSignals: inferProblemSolvingSignals(nextText),
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

const summarizeFlowFocusLine = (line: MultipleChoiceSpecimenFocusLine) => {
  const source = line.expected.trim() || line.actual.trim() || `line ${line.lineNumber}`
  return source.length > 44 ? `${source.slice(0, 41).trimEnd()}...` : source
}

const toMultipleChoiceFocusLines = (reviews: LineReview[]): MultipleChoiceSpecimenFocusLine[] => (
  reviews
    .filter((line): line is LineReview & { status: 'mismatch' | 'missing' | 'extra' } => line.status !== 'match')
    .filter((line) => line.expected.trim().length > 0 || line.actual.trim().length > 0)
    .map((line) => ({
      lineNumber: line.lineNumber,
      expected: line.expected,
      actual: line.actual,
      status: line.status,
    }))
)

const buildFlowGhostTarget = (missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  const targetLines = missedLines
    .map((line) => line.expected)
    .filter((line) => line.trim().length > 0)

  return normalizeTyping(targetLines.join('\n'))
}

const buildFlowGhostScaffold = (fullTarget: string, missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  const fullTargetLines = fullTarget.replace(/\r\n/g, '\n').split('\n')
  const missedLineNumbers = new Set(
    missedLines
      .filter((line) => line.expected.trim().length > 0)
      .map((line) => line.lineNumber)
  )

  return fullTargetLines
    .map((line, index) => {
      if (!missedLineNumbers.has(index + 1)) return line.trimEnd()
      const indentation = line.match(/^\s*/)?.[0] ?? ''
      return indentation
    })
    .join('\n')
}

const extractFlowGhostFocusedInput = (fullInput: string, missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  const inputLines = fullInput.replace(/\r\n/g, '\n').split('\n')
  const focusedLineNumbers = missedLines
    .filter((line) => line.expected.trim().length > 0)
    .map((line) => line.lineNumber)
  if (focusedLineNumbers.length === 0) return normalizeTyping(fullInput)
  const focusedLines = focusedLineNumbers.map((lineNumber) => inputLines[lineNumber - 1] ?? '')

  return normalizeTyping(focusedLines.join('\n'))
}

const firstIncompleteGhostLineNumber = (fullInput: string, missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  const inputLines = fullInput.replace(/\r\n/g, '\n').split('\n')
  return missedLines
    .filter((line) => line.expected.trim().length > 0)
    .map((line) => line.lineNumber)
    .find((lineNumber) => (inputLines[lineNumber - 1] ?? '').trim().length === 0) ?? null
}

const nextGhostLineNumber = (
  currentLineNumber: number,
  fullInput: string,
  missedLines: MultipleChoiceSpecimenFocusLine[]
) => {
  const inputLines = fullInput.replace(/\r\n/g, '\n').split('\n')
  const targetLineNumbers = missedLines
    .filter((line) => line.expected.trim().length > 0)
    .map((line) => line.lineNumber)
  const nextAfterCurrent = targetLineNumbers.find((lineNumber) =>
    lineNumber > currentLineNumber && (inputLines[lineNumber - 1] ?? '').trim().length === 0
  )

  if (nextAfterCurrent) return nextAfterCurrent

  return targetLineNumbers.find((lineNumber) => (inputLines[lineNumber - 1] ?? '').trim().length === 0) ?? null
}

const buildFlowFocusSummary = (cardTitle: string, missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  if (missedLines.length === 0) {
    return `${cardTitle}: full recall was sound, so there is no targeted remediation slice right now.`
  }

  const preview = missedLines
    .slice(0, 2)
    .map((line) => summarizeFlowFocusLine(line))
    .join(' | ')

  return `${cardTitle}: target ${missedLines.length} drifted line${missedLines.length === 1 ? '' : 's'}${preview ? `, starting with ${preview}` : ''}.`
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
    .trimEnd()

const stripHashAnnotationComments = (code: string) =>
  code
    .split('\n')
    .map((line) => line.split('#', 1)[0].trimEnd())
    .join('\n')
    .trimEnd()

const flowTargetForCard = (card: Flashcard) => {
  const generatedTarget = card.templateTargets?.algorithm?.trim()
  const resolvedTarget = (generatedTarget || card.solution).replace('{{missing}}', card.missing)
  return normalizeTyping(stripHashAnnotationComments(stripInlineAnnotationNotes(resolvedTarget)))
}

const initialFlowFocus = (card: Flashcard): MultipleChoiceSpecimenFocus => {
  const target = flowTargetForCard(card)
  return {
    sequenceStage: 'recall',
    focusSummary: `Establish the core decisions in ${card.title}.`,
    missedLines: target.split('\n').flatMap((expected, index) => expected.trim()
      ? [{ lineNumber: index + 1, expected, actual: '', status: 'missing' as const }]
      : []),
  }
}

const nextFlowAnchor = (deck: Flashcard[], currentCardId: string, completedAnchorIds: string[]) => {
  if (deck.length < 2) return null
  const currentIndex = Math.max(0, deck.findIndex((item) => item.id === currentCardId))
  const completed = new Set([...completedAnchorIds, currentCardId])
  for (let offset = 1; offset < deck.length; offset += 1) {
    const candidate = deck[(currentIndex + offset) % deck.length]
    if (!completed.has(candidate.id)) return candidate
  }
  return deck[(currentIndex + 1) % deck.length]
}

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

const capitalizeInlineTask = (value: string) => {
  const trimmed = value.trim().replace(/[.]+$/, '')
  return trimmed ? `${trimmed[0]?.toUpperCase()}${trimmed.slice(1)}.` : ''
}

const fallbackInlineTaskForLine = (line: string) => {
  const trimmed = line.trim()
  if (/^(async\s+)?def\b|^(export\s+)?(async\s+)?function\b/.test(trimmed)) {
    return 'Define a function that accepts the inputs needed for this problem.'
  }
  if (/^for\b/.test(trimmed)) return 'Visit the next part of the input while keeping the current item available.'
  if (/^while\b/.test(trimmed)) return 'Repeat the core step while its controlling condition still holds.'
  if (/^(if|elif)\b/.test(trimmed)) return 'Check the condition that decides whether this path can continue.'
  if (/^else\b/.test(trimmed)) return 'Handle the remaining case.'
  if (/^return\s+(true|True)\b/.test(trimmed)) return 'Report success once every required step has held.'
  if (/^return\s+(false|False)\b/.test(trimmed)) return 'Stop and report that the goal cannot be completed.'
  if (/^return\b/.test(trimmed)) return 'Return the result produced by the completed state.'
  if (/^[\w,[\]().\s]+\s*=\s*/.test(trimmed)) return 'Set up or update the state needed for the next decision.'
  if (/\.(append|add|push|enqueue)\(/.test(trimmed)) return 'Record the current item so it can contribute later.'
  if (/\.(pop|remove|discard|dequeue)\(/.test(trimmed)) return 'Remove the item that no longer belongs in the active state.'
  return 'Carry out the next state-changing step.'
}

const buildInlineTaskProgression = (plainTarget: string, inlineTarget: string) => {
  const inlineRows = inlineTarget
    .split('\n')
    .map((line) => splitInlineAnnotationLine(line))
    .filter((parts) => parts.code.trim())

  return plainTarget
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      const note = inlineRows[index]?.note.trim() ?? ''
      return note ? capitalizeInlineTask(note) : fallbackInlineTaskForLine(line)
    })
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

type MicroDrillContent = {
  prompt: string
  code: string
  language: string
}

const parseMicroDrillContent = (text: string): MicroDrillContent => {
  const segments = parseMarkdownCodeSegments(text)
  const codeSegments = segments.filter((segment): segment is Extract<MarkdownCodeSegment, { type: 'code' }> => segment.type === 'code')
  return {
    prompt: segments
      .filter((segment): segment is Extract<MarkdownCodeSegment, { type: 'text' }> => segment.type === 'text')
      .map((segment) => segment.text)
      .join('\n\n')
      .trim(),
    code: codeSegments.map((segment) => segment.code).join('\n\n').trim(),
    language: codeSegments[0]?.language ?? 'python',
  }
}

function MicroDrillBlankEditor({ template, language, syntaxTheme, theme, onAnswerChange, disabled = false }: {
  template: string
  language: string
  syntaxTheme: Record<string, CSSProperties>
  theme: AppTheme
  onAnswerChange?: (answer: { code: string; complete: boolean }) => void
  disabled?: boolean
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [fallbackValue, setFallbackValue] = useState(template)
  const lines = useMemo(() => template.split('\n'), [template])
  const blankCount = useMemo(() => (template.match(/_{3,}/g) ?? []).length, [template])

  useEffect(() => {
    let index = 0
    const code = template.replace(/_{3,}/g, () => answers[index++] ?? '')
    onAnswerChange?.({ code: blankCount ? code : fallbackValue, complete: blankCount ? Array.from({ length: blankCount }, (_, i) => answers[i]?.trim()).every(Boolean) : Boolean(fallbackValue.trim()) })
  }, [answers, blankCount, fallbackValue, onAnswerChange, template])

  if (blankCount === 0) {
    return (
      <RecallCodeEditor
        value={fallbackValue}
        language={language}
        theme={theme}
        editable={!disabled}
        placeholder="Complete the code"
        lineMeta={[]}
        minHeight={Math.max(lines.length * 20 + 30, 180)}
        intellisense={false}
        commonPatterns={false}
        onChange={setFallbackValue}
        onSubmitHotkey={() => undefined}
      />
    )
  }

  return (
    <div className="micro-drill-code" role="group" aria-label={`Editable ${language} fill-in-the-blank code`}>
      <SyntaxHighlighter
        language={language}
        style={syntaxTheme}
        customStyle={{ margin: 0, padding: 0, background: 'transparent', font: 'inherit' }}
        codeTagProps={{ style: { font: 'inherit' } }}
        wrapLines
        renderer={({ rows, stylesheet }) => {
          let blankIndex = 0
          const renderNode = (node: rendererNode, key: string, lineIndex: number): ReactNode => {
            if (node.type === 'text') {
              return String(node.value ?? '').split(/(_{3,})/g).map((part, partIndex) => {
                if (!/^_{3,}$/.test(part)) return part
                const currentBlank = blankIndex++
                const value = answers[currentBlank] ?? ''
                return (
                  <input
                    key={`${key}-${partIndex}`}
                    className="micro-drill-blank"
                    disabled={disabled}
                    value={value}
                    onChange={(event) => setAnswers((current) => ({ ...current, [currentBlank]: event.target.value }))}
                    aria-label={`Blank ${currentBlank + 1}, line ${lineIndex + 1}`}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoFocus={currentBlank === 0}
                    spellCheck={false}
                    style={{ width: `${Math.max(value.length + 1, Math.ceil(part.length * 0.72))}ch` }}
                  />
                )
              })
            }
            const classes = node.properties?.className ?? []
            const style = Object.assign({}, ...classes.map((name: string) => stylesheet[name]))
            return (
              <span key={key} style={style}>
                {node.children?.map((child, index) => renderNode(child, `${key}-${index}`, lineIndex))}
              </span>
            )
          }
          return rows.map((row, lineIndex) => (
            <span className="micro-drill-code-line" key={lineIndex}>
              <span className="micro-drill-line-number" aria-hidden="true">{lineIndex + 1}</span>
              <span className="micro-drill-code-content">{renderNode(row, `${lineIndex}`, lineIndex)}</span>
            </span>
          ))
        }}
      >
        {template}
      </SyntaxHighlighter>
    </div>
  )
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

function MicroDrillInstructions({ text }: { text: string }) {
  return (
    <div className="micro-drill-instructions">
      {text.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
        const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*$/)
        if (heading) {
          return (
            <h3 className="micro-drill-instruction-heading" key={index}>
              {renderInlineMarkdownText(heading[1].replace(/\s+#+\s*$/, ''))}
            </h3>
          )
        }
        return <span key={index}>{renderInlineMarkdownText(line)}</span>
      })}
    </div>
  )
}

function MarkdownCodeContent({
  text,
  syntaxTheme,
  theme,
  compact = false,
  editorBlocks = false,
}: {
  text: string
  syntaxTheme: Record<string, CSSProperties>
  theme?: AppTheme
  compact?: boolean
  editorBlocks?: boolean
}) {
  const Wrapper = editorBlocks ? 'div' : 'span'

  return (
    <Wrapper className={compact ? 'multiple-choice-markdown compact' : 'multiple-choice-markdown'}>
      {parseMarkdownCodeSegments(text).map((segment, index) => {
        if (segment.type === 'code') {
          const normalizedCode = normalizePythonCodeForDisplay(segment.code, segment.language)
          const lineCount = Math.max(normalizedCode.split('\n').length, 1)
          const snippetMinHeight = Math.min(Math.max(lineCount * 19 + 30, 82), 240)

          if (editorBlocks && theme) {
            return (
              <div key={index} className="multiple-choice-code-editor-block">
                <RecallCodeEditor
                  value={normalizedCode}
                  language={segment.language}
                  theme={theme}
                  editable={false}
                  placeholder=""
                  lineMeta={[]}
                  minHeight={snippetMinHeight}
                  intellisense={false}
                  commonPatterns={false}
                  className="recall-code-editor-snippet"
                  onChange={() => undefined}
                  onSubmitHotkey={() => undefined}
                />
              </div>
            )
          }

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
                {normalizedCode}
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
    </Wrapper>
  )
}

type FlowMicroDrill = { prompt: string; template: string; solution: string; language: string }

type FlowMicroDrillPrimaryActionState = {
  interactionKey: string
  ready: boolean
  failed: boolean
  complete: boolean
  saving: boolean
  submitted: boolean
}

const EMPTY_FLOW_MICRODRILL_ACTION_STATE: FlowMicroDrillPrimaryActionState = {
  interactionKey: '',
  ready: false,
  failed: false,
  complete: false,
  saving: false,
  submitted: false,
}

function FlowMicroDrillCard({ title, prompt, target, focus, rep, context, provider, theme, syntaxTheme, actionKey, onSave, primaryActionRef, onPrimaryActionStateChange }: {
  title: string; prompt: string; target: string; focus: string; rep: number; provider: string
  context: FlowGenerationContext
  theme: AppTheme; syntaxTheme: Record<string, CSSProperties>
  actionKey: string
  onSave: (drill: FlowMicroDrill, answer: string, elapsedMs: number, interactionId: string) => Promise<SubmissionSaveResponse | null>
  primaryActionRef: { current: () => void }
  onPrimaryActionStateChange: (state: FlowMicroDrillPrimaryActionState) => void
}) {
  const [drill, setDrill] = useState<FlowMicroDrill | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [answer, setAnswer] = useState({ code: '', complete: false })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SubmissionSaveResponse | null>(null)
  const startedAt = useRef(Date.now())
  const savingRef = useRef(false)
  const interactionId = useRef(createInteractionId())
  const generationContext = useRef(context).current
  useEffect(() => {
    const controller = new AbortController()
    setDrill(null)
    setError('')
    void (async () => {
      try {
        const response = await fetch(apiUrl('/api/coach/micro-drill'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ cardTitle: title, prompt, target, focus, rep, ...generationContext, llmProvider: provider }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Microdrill generation failed. Try again.')
        if (!controller.signal.aborted) {
          setDrill(payload as FlowMicroDrill)
          startedAt.current = Date.now()
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to generate microdrill.')
      }
    })()
    return () => controller.abort()
  }, [title, prompt, target, focus, rep, generationContext, provider, retry])

  const submit = async () => {
    if (!drill || !answer.complete || savingRef.current || result) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const saved = await onSave(drill, answer.code, Math.max(1, Date.now() - startedAt.current), interactionId.current)
      if (!saved || !saved.saved) throw new Error('Your rep could not be saved. Please try again.')
      setResult(saved)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to submit microdrill.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  useEffect(() => {
    primaryActionRef.current = () => {
      void submit()
    }
    return () => {
      primaryActionRef.current = () => undefined
    }
  })

  useEffect(() => {
    onPrimaryActionStateChange({
      interactionKey: actionKey,
      ready: Boolean(drill),
      failed: Boolean(error && !drill),
      complete: answer.complete,
      saving,
      submitted: Boolean(result),
    })
  }, [actionKey, answer.complete, drill, error, onPrimaryActionStateChange, result, saving])

  return (
    <div className="card-grid micro-drill-card-grid drill-fade-in">
      <div className="panel micro-drill-question-card">
        <div className="micro-drill-header"><span className="micro-drill-eyebrow">Microdrill · Rep {rep}</span></div>
        {drill ? <div className="micro-drill-prompt"><MicroDrillInstructions text={drill.prompt} /></div> : !error && <p role="status">Preparing your microdrill…</p>}
        {error && <p role="alert">{error}</p>}
        {!drill && error && <button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Try again</button>}
        {result && <div className="submission-feedback-detail" role="status">
          <p>{result.evaluation.feedback.fullFeedback || (result.successful ? 'Sound. Rep complete.' : 'Rep logged. Review the focused decision before continuing.')}</p>
          {result.feedbackUnavailable && <p>{result.feedbackUnavailable.message}</p>}
        </div>}
      </div>
      {drill && <div className="panel micro-drill-answer-card">
        <span className="answer-label">Fill only the blanks</span>
        <MicroDrillBlankEditor template={drill.template} language={drill.language} theme={theme} syntaxTheme={syntaxTheme} onAnswerChange={setAnswer} disabled={saving || Boolean(result)} />
        <p className="typing-help">Tab moves to the next blank.</p>
      </div>}
    </div>
  )
}

function FlowCoachTransition({ transition }: { transition: PracticeFlowTransitionState }) {
  const fromLabel = transition.fromStage ? FLOW_COACH_LABELS[transition.fromStage] : 'Start'
  const toLabel = FLOW_COACH_LABELS[transition.toStage]

  return (
    <section className="flow-transition-card" role="status" aria-live="polite" aria-label={`Coach transition to ${toLabel}`}>
      <div className="flow-transition-topline">
        <span className="flow-transition-eyebrow">Coach · Next modality</span>
        <div className="flow-transition-route" aria-label={`${fromLabel} to ${toLabel}`}>
          <span>{fromLabel}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 5.25 6.75 6.75L9 18.75" />
          </svg>
          <strong>{toLabel}</strong>
        </div>
      </div>
      <div className="flow-transition-copy">
        <h2>{transition.headline}</h2>
        <p>{transition.detail}</p>
      </div>
      <div className="flow-transition-status">
        <span className="flow-transition-status-dot" aria-hidden="true" />
        <span>{transition.status}</span>
      </div>
      <div className="flow-transition-progress" aria-hidden="true"><span /></div>
    </section>
  )
}

function App() {
  const { theme } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const questionType = 'skill-map' as const
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('recall')
  const [mcqSourceSpecimen, setMcqSourceSpecimen] = useState<MultipleChoiceSpecimenContext | null>(null)
  const [multipleChoiceDifficulty] = useState<MultipleChoiceDifficulty>('Med.')
  const [enabledTemplateModes, setEnabledTemplateModes] = useState<TemplateMode[]>(() => [...DEFAULT_TEMPLATE_MODES])
  const [supportLayer, setSupportLayer] = useState<SupportLayer>('none')
  const [skillMapDeck, setSkillMapDeck] = useState<Flashcard[]>([])
  const [catalogPlaylists, setCatalogPlaylists] = useState<PracticePlaylist[] | null>(null)
  const [catalogSkillMap, setCatalogSkillMap] = useState<SkillMapNode[] | null>(null)
  const [skillMapLoading, setSkillMapLoading] = useState(false)
  const [skillMapError, setSkillMapError] = useState('')
  const [skillMapRefreshToken, setSkillMapRefreshToken] = useState(0)
  const [skillMapSessionVersion, setSkillMapSessionVersion] = useState(0)
  const [multipleChoiceDeck, setMultipleChoiceDeck] = useState<MultipleChoiceCard[]>([])
  const [multipleChoiceLoading, setMultipleChoiceLoading] = useState(false)
  const [multipleChoiceError, setMultipleChoiceError] = useState('')
  const [multipleChoiceRefreshToken, setMultipleChoiceRefreshToken] = useState(0)
  const [multipleChoiceSessionVersion, setMultipleChoiceSessionVersion] = useState(0)
  const [recallTargetMode] = useState<RecallTargetMode>('algorithm')
  const [inlineEnabled, setInlineEnabled] = useState(false)
  const [inlineLens] = useState<InlineLens>('pattern')
  const [inlineTaskProgress, setInlineTaskProgress] = useState(0)
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const [relatedDrawerOpen, setRelatedDrawerOpen] = useState(false)
  const [flowDrawerOpen, setFlowDrawerOpen] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  const flowInteractionVersionRef = useRef(0)
  const [flowConfig, setFlowConfig] = useState(loadFlowConfig)
  const [practiceFlow, setPracticeFlow] = useState<PracticeFlowState | null>(null)
  const [flowTransition, setFlowTransition] = useState<PracticeFlowTransitionState | null>(null)
  const [flowAttempts, setFlowAttempts] = useState<FlowAttempt[]>([])
  const flowAttemptsRef = useRef<FlowAttempt[]>([])
  const [flowHistoryLoading, setFlowHistoryLoading] = useState(false)
  const [flowHistoryError, setFlowHistoryError] = useState('')
  const [flowMultipleChoiceDeck, setFlowMultipleChoiceDeck] = useState<MultipleChoiceCard[]>([])
  const [flowMultipleChoiceLoading, setFlowMultipleChoiceLoading] = useState(false)
  const [flowMultipleChoiceError, setFlowMultipleChoiceError] = useState('')
  const [flowMultipleChoicePosition, setFlowMultipleChoicePosition] = useState(0)
  const [flowMultipleChoiceSelectedChoiceId, setFlowMultipleChoiceSelectedChoiceId] = useState('')
  const [flowMultipleChoiceStartedAt, setFlowMultipleChoiceStartedAt] = useState<number | null>(null)
  const [flowMultipleChoiceSubmittedByCard, setFlowMultipleChoiceSubmittedByCard] = useState<Record<string, string>>({})
  const [flowMicroDrillPrimaryActionState, setFlowMicroDrillPrimaryActionState] = useState<FlowMicroDrillPrimaryActionState>(EMPTY_FLOW_MICRODRILL_ACTION_STATE)
  const flowMicroDrillPrimaryActionRef = useRef<() => void>(() => undefined)

  const [sessionOrder, setSessionOrder] = useState<number[]>([])
  const [sessionPosition, setSessionPosition] = useState(0)
  const [sessionFinished, setSessionFinished] = useState(false)
  const [sessionResults, setSessionResults] = useState<Record<string, boolean>>({})
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
  const [liveCoachFeedbackMeta, setLiveCoachFeedbackMeta] = useState<LiveFeedbackMeta>({ trigger: 'auto', hintDepth: 0, cursorLineNumber: null })
  const [, setLiveCoachLoading] = useState(false)
  const [liveCoachError, setLiveCoachError] = useState('')
  const [liveCoachTuning, setLiveCoachTuning] = useState(() => loadStoredLiveCoachTuning())
  const [submissionTuning, setSubmissionTuning] = useState(() => loadStoredSubmissionTuning())
  const [codeEditorTuning] = useState(() => loadStoredCodeEditorTuning())
  const syntaxTheme = theme === 'light-high-contrast' ? vs : vscDarkPlus
  const liveFeedbackEnabled = LIVE_FEEDBACK_ENABLED && liveCoachTuning.enabled
  const [coachFeedback, setCoachFeedback] = useState<CoachAttemptFeedback | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState('')
  const [submissionFailureModal, setSubmissionFailureModal] = useState<SubmissionFailureModalState | null>(null)
  const [sessionPlan, setSessionPlan] = useState<CoachSessionPlan | null>(null)
  const [sessionPlanLoading, setSessionPlanLoading] = useState(false)
  const [sessionPlanError, setSessionPlanError] = useState('')
  const mcqTuning = useMemo(() => loadStoredMcqTuning(), [])
  const googlePlaylistTuning = useMemo(() => loadStoredGooglePlaylistTuning(), [])
  const multipleChoiceQuestionCount = mcqTuning.questionCount
  const mainInputRef = useRef<RecallCodeEditorHandle | null>(null)
  const lastCardMoveKeyRef = useRef<{ key: 'ArrowLeft' | 'ArrowRight', pressedAt: number } | null>(null)
  const shouldFocusMainInputRef = useRef(false)
  const pendingGhostFocusLineRef = useRef<number | null>(null)
  const previewCodeContainerRef = useRef<HTMLDivElement | null>(null)
  const cardContainerRef = useRef<HTMLElement | null>(null)
  const [recallMinHeight, setRecallMinHeight] = useState<number | undefined>(undefined)
  const [cardFlowPanelMaxHeight, setCardFlowPanelMaxHeight] = useState<number | undefined>(undefined)
  const currentCardIdRef = useRef('')
  const liveCoachRequestVersionRef = useRef(0)
  const recallEvaluationPendingRef = useRef(false)
  const liveCoachSnapshotRef = useRef<LiveCoachSnapshot | null>(null)
  const lastLiveCoachDecisionKeyRef = useRef('')
  const stuckHintDepthRef = useRef(0)
  const lastStuckHintInputRef = useRef('')
  const lastMainInputEditAtRef = useRef(0)
  const skillMapDeckRequestVersionRef = useRef(0)
  const multipleChoiceDeckRequestVersionRef = useRef(0)
  const flowMultipleChoiceDeckRequestVersionRef = useRef(0)
  const focusedPatternSlug = searchParams.get('focusPattern')?.trim() || ''
  const focusedTagSlug = searchParams.get('focusTag')?.trim() || ''
  const focusedModeParam = searchParams.get('focusMode')?.trim() || ''
  const requestedPlaylistSlug = searchParams.get('playlist')?.trim() || ''
  const focusedMethodParams = searchParams.getAll('focusMethod').map((method) => method.trim()).filter(Boolean)
  useEffect(() => {
    let cancelled = false
    const loadCatalogPlaylists = async () => {
      try {
        const response = await fetch(apiUrl('/api/catalog/playlists'))
        if (!response.ok) return
        const payload = await response.json() as { playlists?: PracticePlaylist[] }
        if (!cancelled && Array.isArray(payload.playlists) && payload.playlists.length > 0) {
          setCatalogPlaylists(payload.playlists)
        }
      } catch {
        // Keep the local catalog fallback available when the API is unavailable.
      }
    }

    void loadCatalogPlaylists()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadSkillMap = async () => {
      try {
        const response = await fetch(apiUrl('/api/skill-map'))
        if (!response.ok) return
        const payload = await response.json() as SkillMapNode[]
        if (!cancelled && Array.isArray(payload) && payload.length > 0) {
          setCatalogSkillMap(payload)
        }
      } catch {
        // Keep the local taxonomy fallback available when the API is unavailable.
      }
    }

    void loadSkillMap()
    return () => {
      cancelled = true
    }
  }, [])

  const availablePlaylists = catalogPlaylists ?? practicePlaylists
  const availableSkillMap = catalogSkillMap ?? skillMap
  const requestedPlaylist = useMemo(
    () => availablePlaylists.find((playlist) => playlist.slug === requestedPlaylistSlug) ?? null,
    [availablePlaylists, requestedPlaylistSlug]
  )
  const focusedPatternNode = useMemo(
    () => availableSkillMap.find((node) => patternToSlug(node.algorithm) === focusedPatternSlug) ?? null,
    [availableSkillMap, focusedPatternSlug]
  )
  const focusedTemplateMode = useMemo<TemplateMode | null>(() => {
    if (TEMPLATE_MODE_ORDER.includes(focusedModeParam as TemplateMode)) {
      return focusedModeParam as TemplateMode
    }
    return null
  }, [focusedModeParam])
  const requestedSkillMap = useMemo<SkillMapNode[]>(() => {
    if (requestedPlaylist) return playlistQuestionsToSkillMap(requestedPlaylist)
    if (!focusedPatternNode) return availableSkillMap
    const focusedMethodSet = new Set(focusedMethodParams)
    const focusedMethods = focusedMethodSet.size > 0
      ? focusedPatternNode.skills.filter((method) => focusedMethodSet.has(method))
      : focusedPatternNode.skills
    const requestedMethods = focusedMethods.length > 0 ? focusedMethods : focusedPatternNode.skills
    return requestedMethods.map((method) => ({
      algorithm: focusedPatternNode.algorithm,
      skills: [method],
    }))
  }, [availableSkillMap, focusedMethodParams, focusedPatternNode, requestedPlaylist])
  const requestedSkillMapSignature = useMemo(
    () => JSON.stringify(requestedSkillMap),
    [requestedSkillMap]
  )
  const requestedTemplateMode = focusedTemplateMode ?? DEFAULT_TEMPLATE_MODES[0]
  const requestedTemplateTargets = useMemo(() => {
    const targets: Record<string, Partial<Record<TemplateMode, string>>> = {}
    requestedSkillMap.forEach((node) => {
      const patternSlug = patternToSlug(node.algorithm)
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
  const focusedPatternLabel = focusedPatternNode?.algorithm ?? patternLabelFromSlug(focusedPatternSlug)
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

      if (requestedPlaylist.staticDeck) {
        const staticOrder = requestedPlaylist.slug === 'google' ? googlePlaylistTuning.order : 'mastery'
        const payload = await requestStaticPlaylistDrills(requestedPlaylist.slug, staticOrder)
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
      if (requestedPlaylist?.staticDeck) {
        if (skillMapDeckRequestVersionRef.current !== requestVersion) return
        setSkillMapDeck([])
        setSkillMapSessionVersion((prev) => prev + 1)
        setSkillMapError('Static playlist is unavailable right now.')
        return
      }

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

    if (!mcqSourceSpecimen) {
      setMultipleChoiceLoading(false)
      return
    }
    const specimenContext = mcqSourceSpecimen
    const cardBasedSkillMap: SkillMapNode[] = [{
      algorithm: specimenContext.algorithm,
      skills: [specimenContext.cardTitle, ...specimenContext.tags.filter((tag) => tag !== 'skill-map').slice(0, 4)],
    }]
    const sourceMode = 'card'
    const flowMode = mcqTuning.flowMode

    const requestBody: MultipleChoiceDrillsRequest = {
      questionType: `skill-map-mcq:${sourceMode}:${flowMode}`,
      count: multipleChoiceQuestionCount,
      skillMap: cardBasedSkillMap,
      difficulty: multipleChoiceDifficulty,
      sourceMode,
      flowMode,
      specimen: specimenContext,
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

  const fetchFlowMultipleChoiceDeck = async () => {
    if (!practiceFlow) return

    flowMultipleChoiceDeckRequestVersionRef.current += 1
    const requestVersion = flowMultipleChoiceDeckRequestVersionRef.current
    setFlowMultipleChoiceLoading(true)
    setFlowMultipleChoiceError('')
    setFlowMultipleChoiceDeck([])
    setFlowMultipleChoicePosition(0)
    setFlowMultipleChoiceSelectedChoiceId('')
    setFlowMultipleChoiceStartedAt(null)
    setFlowMultipleChoiceSubmittedByCard({})

    const cardPatternSlug = getPrimaryPatternTag(card.tags)
    const specimenPattern = cardPatternSlug ? patternLabelFromSlug(cardPatternSlug) : card.title
    const cardBasedSkillMap: SkillMapNode[] = [{
      algorithm: specimenPattern || 'Algorithm',
      skills: [card.title, ...card.tags.filter((tag) => tag !== 'skill-map').slice(0, 4)],
    }]
    const specimenContext: MultipleChoiceSpecimenContext = {
      cardId: card.id,
      cardTitle: card.title,
      algorithm: specimenPattern || 'Algorithm',
      prompt: practicePrompt,
      target: practiceTarget,
      tags: card.tags,
      focus: {
        sequenceStage: 'multiple-choice',
        focusSummary: practiceFlow.focus.focusSummary,
        missedLines: practiceFlow.focus.missedLines,
        ...flowGenerationContext,
      },
    }

    const requestBody: MultipleChoiceDrillsRequest = {
      questionType: `skill-map-mcq:card:progressive:flow-${practiceFlow.runId}-step-${practiceFlow.step}`,
      count: 1,
      skillMap: cardBasedSkillMap,
      difficulty: flowGenerationContext.phase === 'challenge' || flowGenerationContext.phase === 'mastered'
        ? 'Hard'
        : multipleChoiceDifficulty,
      sourceMode: 'card',
      flowMode: 'progressive',
      specimen: specimenContext,
      llmProvider: requestLlmProvider,
    }

    try {
      const payload = await requestMultipleChoiceDrills(requestBody)
      if (flowMultipleChoiceDeckRequestVersionRef.current !== requestVersion) return
      setFlowMultipleChoiceDeck(payload.drills)
      setFlowMultipleChoiceStartedAt(Date.now())
    } catch (error) {
      if (flowMultipleChoiceDeckRequestVersionRef.current !== requestVersion) return
      setFlowMultipleChoiceDeck([])
      setFlowMultipleChoiceError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Targeted multiple choice generation is unavailable right now.'
      )
    } finally {
      if (flowMultipleChoiceDeckRequestVersionRef.current === requestVersion) {
        setFlowMultipleChoiceLoading(false)
      }
    }
  }

  const startSession = (deckLength: number) => {
    setSessionOrder(Array.from({ length: deckLength }, (_, idx) => idx))
    setSessionPosition(0)
    setSessionFinished(false)
    setSessionResults({})
    setSessionElapsedByCard({})
    setSessionPlanRequested(false)

    setMainPhase('preview')
    setRecallMinHeight(undefined)
    setMainInput('')
    setInlineTaskProgress(0)
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setMultipleChoiceSelectedChoiceId('')
    setMultipleChoiceStartedAt(Date.now())
    setMultipleChoiceSubmittedByCard({})
    setCurrentInteractionId('')
    setMainRecallHistoryByCard({})
    setLiveCoachFeedback(null)
    setLiveCoachFeedbackMeta({ trigger: 'auto', hintDepth: 0, cursorLineNumber: null })
    setLiveCoachLoading(false)
    setLiveCoachError('')
    liveCoachRequestVersionRef.current = 0
    liveCoachSnapshotRef.current = null
    lastLiveCoachDecisionKeyRef.current = ''
    stuckHintDepthRef.current = 0
    lastStuckHintInputRef.current = ''
    lastMainInputEditAtRef.current = 0
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
  }, [focusedPatternSlug, focusedTagSlug, googlePlaylistTuning.order, llmProvider, requestLlmProvider, requestedQuestionType, requestedSkillMapSignature, requestedTemplateMode, skillMapRefreshToken])

  useEffect(() => {
    if (practiceMode !== 'multiple-choice') return
    if (!mcqSourceSpecimen) return
    void fetchMultipleChoiceDeck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceMode, llmProvider, requestedQuestionType, multipleChoiceDifficulty, multipleChoiceQuestionCount, multipleChoiceRefreshToken, mcqTuning.flowMode, mcqSourceSpecimen])

  useEffect(() => {
    if (!practiceFlow || practiceFlow.stage !== 'multiple-choice') return
    if (flowMultipleChoiceDeck.length > 0) return
    void fetchFlowMultipleChoiceDeck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceFlow?.stage, practiceFlow?.step, practiceFlow?.runId, multipleChoiceDifficulty, requestLlmProvider])

  useEffect(() => {
    saveStoredLiveCoachTuning(liveCoachTuning)
  }, [liveCoachTuning])

  useEffect(() => {
    saveStoredSubmissionTuning(submissionTuning)
  }, [submissionTuning])

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

  useEffect(() => {
    const cardElement = cardContainerRef.current
    if (!cardElement) return undefined

    const updateCardFlowPanelMaxHeight = () => {
      const nextHeight = Math.max(0, Math.round(cardElement.getBoundingClientRect().height))
      setCardFlowPanelMaxHeight((currentHeight) => (
        currentHeight === nextHeight ? currentHeight : nextHeight
      ))
    }

    updateCardFlowPanelMaxHeight()

    const resizeObserver = new ResizeObserver(updateCardFlowPanelMaxHeight)
    resizeObserver.observe(cardElement)
    window.addEventListener('resize', updateCardFlowPanelMaxHeight)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateCardFlowPanelMaxHeight)
    }
  }, [])

  const currentDeckIndex = sessionOrder[sessionPosition] ?? 0
  const card = (practiceFlow ? filteredDeck.find(item => item.id === practiceFlow.anchorCardId) : filteredDeck[currentDeckIndex]) ?? filteredDeck[0] ?? emptySkillMapCard
  const currentFlowAttempts = useMemo(
    () => practiceFlow ? flowAttempts.filter((attempt) => attempt.anchorCardId === practiceFlow.anchorCardId) : [],
    [flowAttempts, practiceFlow]
  )
  const flowMastery = useMemo(() => summarizeFlowMastery(currentFlowAttempts), [currentFlowAttempts])
  const flowGenerationContext = useMemo(() => buildFlowGenerationContext(currentFlowAttempts), [currentFlowAttempts])
  const multipleChoiceCard = multipleChoiceDeck[currentDeckIndex] ?? multipleChoiceDeck[0] ?? null
  const flowMultipleChoiceCard = flowMultipleChoiceDeck[flowMultipleChoicePosition] ?? flowMultipleChoiceDeck[0] ?? null
  const isFlowActive = practiceFlow !== null
  const currentPracticeMode: PracticeMode = practiceFlow
    ? (practiceFlow.stage === 'multiple-choice' ? 'multiple-choice' : 'recall')
    : practiceMode
  const effectiveSupportLayer: SupportLayer = practiceFlow?.stage === 'ghost' ? 'ghost-reps' : supportLayer
  const activeMultipleChoiceCard = isFlowActive ? flowMultipleChoiceCard : multipleChoiceCard
  const activeCardId = currentPracticeMode === 'multiple-choice' ? activeMultipleChoiceCard?.id ?? '' : card.id
  const activeCardTitle = currentPracticeMode === 'multiple-choice' ? activeMultipleChoiceCard?.title ?? 'Multiple Choice' : card.title
  const activeCardDifficulty = currentPracticeMode === 'multiple-choice' ? activeMultipleChoiceCard?.difficulty ?? multipleChoiceDifficulty : card.difficulty
  const activeCardTags = currentPracticeMode === 'multiple-choice' ? activeMultipleChoiceCard?.tags ?? [] : card.tags
  const headerCardTitle = isFlowActive ? practiceFlow?.anchorTitle ?? card.title : activeCardTitle
  const headerCardDifficulty = isFlowActive ? card.difficulty : activeCardDifficulty
  const headerCardDifficultyLabel = headerCardDifficulty === 'Med.' ? 'Medium' : headerCardDifficulty
  const headerCardTags = isFlowActive ? card.tags : activeCardTags
  const isCoreAlgorithmCard = headerCardTags.includes('core-algorithm')
  const isMetaCard = headerCardTags.includes('core-meta') || headerCardTags.includes('meta')
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
      return normalizeInlineTemplateTarget(generatedTarget.replace('{{missing}}', card.missing), primaryPatternTag, inlineLens)
    }
    return normalizeInlineTemplateTarget(selectedPracticeBaseTarget, primaryPatternTag, inlineLens)
  }, [card.missing, card.templateTargets, inlineLens, primaryPatternTag, recallTargetMode, selectedPracticeBaseTarget])
  const plainPracticeTarget = useMemo(
    () => normalizeTyping(stripHashAnnotationComments(stripInlineAnnotationNotes(selectedPracticeBaseTarget))),
    [selectedPracticeBaseTarget]
  )
  const inlineTaskProgression = useMemo(
    () => buildInlineTaskProgression(plainPracticeTarget, inlinePracticeTarget),
    [inlinePracticeTarget, plainPracticeTarget]
  )
  const practiceTarget = plainPracticeTarget
  const generatedPracticePrompt =
    (recallTargetMode === 'coreShape' ? card.templatePrompts?.coreShape?.trim() : card.templatePrompts?.algorithm?.trim())
    || card.prompt.trim()
  const practicePrompt = useMemo(
    () => generatedPracticePrompt || buildPracticePrompt(currentTemplateMode, primaryPatternTag),
    [currentTemplateMode, generatedPracticePrompt, primaryPatternTag]
  )
  const skeletonReference = card.skeletonApplicability ?? null
  const submissionFeedbackDetailId = `submission-feedback-detail-${card.id}`
  const tagsListId = `card-tags-${card.id}`

  const flowGhostTarget = useMemo(
    () => buildFlowGhostTarget(practiceFlow?.focus.missedLines ?? []),
    [practiceFlow]
  )
  const flowGhostScaffold = useMemo(
    () => buildFlowGhostScaffold(practiceTarget, practiceFlow?.focus.missedLines ?? []),
    [practiceFlow, practiceTarget]
  )
  const currentRecallSubmissionInput = useMemo(
    () => practiceFlow?.stage === 'ghost'
      ? extractFlowGhostFocusedInput(mainInput, practiceFlow.focus.missedLines)
      : normalizeTyping(mainInput),
    [mainInput, practiceFlow]
  )
  const activeRecallTarget = practiceFlow?.stage === 'ghost' && flowGhostTarget ? flowGhostTarget : practiceTarget
  const currentQuestionType = `${requestedQuestionType}:${recallTargetMode}${inlineEnabled ? `:${inlineLens}` : ''}`
  const currentMultipleChoiceQuestionType = isFlowActive
    ? `skill-map-mcq:card:progressive:flow-cycle-${practiceFlow?.cycle ?? 1}`
    : `skill-map-mcq:card:${mcqTuning.flowMode}`
  const currentSkillTags = useMemo(
    () => [
      ...card.tags,
      `template-${currentTemplateMode}`,
      `target-${recallTargetMode}`,
      ...(inlineEnabled ? [`inline-${inlineLens}`] : []),
      ...(isFlowActive && practiceFlow
        ? ['mode-flow', `flow-stage-${practiceFlow.stage}`, `flow-cycle-${practiceFlow.cycle}`]
        : []),
    ],
    [card.tags, currentTemplateMode, inlineEnabled, inlineLens, isFlowActive, practiceFlow, recallTargetMode]
  )
  const currentRecallHistoryKey = `${card.id}:${currentTemplateMode}:${recallTargetMode}:${inlineEnabled ? inlineLens : 'plain'}`
  const currentMultipleChoiceSkillTags = useMemo(
    () => [
      ...(activeMultipleChoiceCard?.tags ?? []),
      'mode-multiple-choice',
      'source-card',
      `flow-${isFlowActive ? 'progressive' : mcqTuning.flowMode}`,
      `difficulty-${multipleChoiceDifficulty === 'Hard' ? 'hard' : 'med'}`,
      ...(isFlowActive && practiceFlow ? ['mode-flow', `flow-cycle-${practiceFlow.cycle}`] : []),
    ],
    [activeMultipleChoiceCard?.tags, isFlowActive, mcqTuning.flowMode, multipleChoiceDifficulty, practiceFlow]
  )
  const visibleCardTags = useMemo(
    () => headerCardTags.filter((tag) => tag !== 'skill-map' && tag !== 'skill-map-mcq'),
    [headerCardTags]
  )

  currentCardIdRef.current = activeCardId

  const handleTagClick = (tag: string) => {
    setTagsExpanded(false)
    setSearchParams(tag === focusedTagSlug ? {} : { focusTag: tag })
  }

  const hasRecallDeck = filteredDeck.length > 0
  const hasMultipleChoiceDeck = isFlowActive ? flowMultipleChoiceDeck.length > 0 : multipleChoiceDeck.length > 0
  const hasDeck = currentPracticeMode === 'multiple-choice' ? hasMultipleChoiceDeck : hasRecallDeck
  const activeLoading = currentPracticeMode === 'multiple-choice'
    ? (isFlowActive ? flowMultipleChoiceLoading : multipleChoiceLoading)
    : skillMapLoading
  const activeError = currentPracticeMode === 'multiple-choice'
    ? (isFlowActive ? flowMultipleChoiceError : multipleChoiceError)
    : skillMapError
  const isGhostRepsEnabled = effectiveSupportLayer === 'ghost-reps'
  const currentInlineTask = inlineEnabled && mainPhase === 'typing' && !isGhostRepsEnabled
    ? inlineTaskProgression[inlineTaskProgress]
    : undefined
  const hasAnsweredCurrent = !isFlowActive && Boolean(activeCardId && Object.prototype.hasOwnProperty.call(sessionResults, activeCardId))
  const sessionCounterText =
    isFlowActive && practiceFlow
      ? `${FLOW_LABELS[practiceFlow.stage]} · ${practiceFlow.step + 1}`
      : sessionOrder.length === 0
      ? '0 / 0'
      : `${Math.min(sessionPosition + 1, Math.max(sessionOrder.length, 1))} / ${sessionOrder.length}`
  const practiceHistoryHref = useMemo(() => {
    if (!hasDeck) return '/practice-history'

    if (currentPracticeMode === 'multiple-choice' && activeMultipleChoiceCard) {
      const searchParams = new URLSearchParams({
        cardId: activeMultipleChoiceCard.id,
        cardTitle: activeMultipleChoiceCard.title,
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
    currentPracticeMode,
    activeMultipleChoiceCard,
    currentMultipleChoiceQuestionType,
    currentMultipleChoiceSkillTags,
    currentQuestionType,
    currentSkillTags,
    hasDeck,
  ])
  const currentTemplateLabel = TEMPLATE_MODE_LABELS[currentTemplateMode]
  const activeRecallLabel = recallTargetMode === 'coreShape' ? 'Core shape' : currentTemplateLabel
  const practiceLanguage = codeEditorTuning.language
  const targetedGhostLineCount = practiceFlow?.focus.missedLines.filter((line) => line.expected.trim().length > 0).length ?? 0
  const practiceInputLabel = recallTargetMode === 'coreShape'
    ? 'Type the core shape from memory'
    : 'Type the full algorithm from memory'
  const supportedPracticeInputLabel = isGhostRepsEnabled
    ? practiceFlow?.stage === 'ghost'
      ? `Type only the ${targetedGhostLineCount || practiceFlow.focus.missedLines.length} targeted line${(targetedGhostLineCount || practiceFlow.focus.missedLines.length) === 1 ? '' : 's'} from memory`
      : `${practiceInputLabel} with Ghost Reps`
    : practiceInputLabel
  const practicePlaceholder = recallTargetMode === 'coreShape'
    ? 'Type the reusable skeleton from memory...'
    : 'Type the full algorithm from memory...'
  const supportedPracticePlaceholder = isGhostRepsEnabled
    ? practiceFlow?.stage === 'ghost'
      ? 'Trace only the lines you missed on the last recall...'
      : `Trace the faint ${activeRecallLabel.toLowerCase()} target here...`
    : practicePlaceholder
  const relatedLeetCodeSet = useMemo(
    () => currentPracticeMode === 'recall'
      ? resolveRelatedLeetCodeSet({
          title: card.title,
          examples: card.plainEnglishPromptDetail?.leetcodeExamples ?? [],
        })
      : null,
    [card.plainEnglishPromptDetail?.leetcodeExamples, card.title, currentPracticeMode]
  )

  useEffect(() => {
    setRelatedDrawerOpen(false)
  }, [card.id, currentTemplateMode, relatedLeetCodeSet?.heading])

  const completeCardInSession = (isCorrect: boolean, elapsedMs?: number) => {
    if (!activeCardId) return
    setSessionResults((prevResults) => {
      const next = { ...prevResults, [activeCardId]: isCorrect }
      if (Object.keys(next).length >= sessionOrder.length) {
        setSessionFinished(true)
      }
      return next
    })
    if (elapsedMs !== undefined) {
      setSessionElapsedByCard((prev) => ({ ...prev, [activeCardId]: elapsedMs }))
    }
  }

  const addFlowAttempts = (incoming: FlowAttempt[]) => {
    const merged = mergeFlowAttempts(flowAttemptsRef.current, incoming)
    flowAttemptsRef.current = merged
    setFlowAttempts(merged)
    return merged
  }

  const loadFlowHistoryForCard = async (anchorCard: Flashcard) => {
    setFlowHistoryLoading(true)
    setFlowHistoryError('')
    try {
      const loaded = await requestFlowAttemptHistory(anchorCard)
      return addFlowAttempts(loaded).filter((attempt) => attempt.anchorCardId === anchorCard.id)
    } catch {
      setFlowHistoryError('Previous attempts are unavailable; this flow will adapt from the current run.')
      return flowAttemptsRef.current.filter((attempt) => attempt.anchorCardId === anchorCard.id)
    } finally {
      setFlowHistoryLoading(false)
    }
  }

  const currentFlowSignals = (): Record<string, unknown> | undefined => {
    if (!practiceFlow) return undefined
    return {
      runId: practiceFlow.runId,
      anchorCardId: practiceFlow.anchorCardId,
      anchorTitle: practiceFlow.anchorTitle,
      stage: practiceFlow.stage,
      step: practiceFlow.step,
      cycle: practiceFlow.cycle,
      phase: flowMastery.phase,
      proficiency: flowMastery.proficiency,
      successfulModalities: flowMastery.successfulModalities,
      weaknessSummary: flowMastery.weaknesses.join('; '),
      completedAnchorCount: practiceFlow.completedAnchorIds.length,
    }
  }

  const recordFlowSubmission = ({
    response,
    flowSignals,
    modality,
    modalitySignals,
    elapsedMs,
    interactionId,
    question,
  }: {
    response: SubmissionSaveResponse
    flowSignals: Record<string, unknown>
    modality: SubmissionModality
    modalitySignals: Record<string, unknown>
    elapsedMs: number
    interactionId: string
    question: string
  }) => {
    const anchorCardId = String(flowSignals.anchorCardId ?? '')
    if (!anchorCardId || !response.saved) return
    const missedLineCount = Number(modalitySignals.missedLineCount ?? 0)
    const evaluation = response.evaluation as unknown as Record<string, unknown>
    addFlowAttempts([{
      attemptId: response.attemptId,
      interactionId,
      anchorCardId,
      modality,
      successful: response.successful,
      score: flowEvaluationScore(evaluation),
      elapsedMs,
      missedLineCount: Number.isFinite(missedLineCount) ? Math.max(0, missedLineCount) : 0,
      weaknesses: compactFeedbackItems([
        ...flowEvaluationWeaknesses(evaluation, missedLineCount),
        flowModalityWeakness(modality, response.successful),
      ]),
      question,
      createdAt: new Date().toISOString(),
    }])
  }

  const submitAttemptToServer = async (payload: AttemptPayload) => {
    const flowSignals = currentFlowSignals()
    try {
      const response = await fetch(apiUrl('/api/attempts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          cardTitle: card.title,
          question: payload.question ?? practicePrompt,
          questionType: payload.microdrill ? `${currentQuestionType}:microdrill` : currentQuestionType,
          categoryTags: currentSkillTags,
          correctAnswer: payload.correctAnswer,
          userAnswer: payload.userAnswer,
          mode: payload.mode,
          elapsedMs: payload.elapsedMs,
          sessionId: payload.sessionId ?? (flowSignals?.runId as string | undefined),
          interactionId: payload.interactionId,
          generatedCardId: card.id,
          generatedCard: { ...card, prompt: payload.question ?? practicePrompt },
          templateMode: payload.templateMode,
          supportLayer: payload.supportLayer,
          modality: payload.modality,
          signals: {
            ...(payload.signals ?? {}),
            ...(flowSignals ? { flow: flowSignals } : {}),
            modality: {
              ...(payload.signals?.modality ?? {}),
              kind: payload.modality,
            },
          },
          liveCoachUsed: payload.liveCoachUsed,
          targetSource: isFlowActive ? 'recall-miss' : 'skill-map',
          targetControl: isFlowActive ? 'system' : 'user',
          formatControl: isFlowActive ? 'system' : 'user',
          submissionTuning: isFlowActive ? { ...submissionTuning, microDrillEnabled: false } : submissionTuning,
          llmProvider: requestLlmProvider,
        }),
      })
      if (!response.ok) throw new Error('Unable to submit attempt')
      const saved = (await response.json()) as SubmissionSaveResponse
      if (flowSignals) {
        recordFlowSubmission({
          response: saved,
          flowSignals,
          modality: payload.modality,
          modalitySignals: payload.signals?.modality ?? {},
          elapsedMs: payload.elapsedMs,
          interactionId: payload.interactionId,
          question: payload.question ?? practicePrompt,
        })
      }
      return saved
    } catch {
      return null
    }
  }

  const submitMultipleChoiceAttemptToServer = async (payload: {
    interactionId: string
    selectedChoice: MultipleChoiceChoice
    correctChoice: MultipleChoiceChoice
    correct: boolean
    elapsedMs: number
  }) => {
    if (!activeMultipleChoiceCard) return
    const flowSignals = currentFlowSignals()
    try {
      const response = await fetch(apiUrl('/api/attempts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: activeMultipleChoiceCard.id,
          cardTitle: activeMultipleChoiceCard.title,
          question: activeMultipleChoiceCard.question,
          questionType: currentMultipleChoiceQuestionType,
          categoryTags: currentMultipleChoiceSkillTags,
          correctAnswer: `${payload.correctChoice.id}. ${payload.correctChoice.text}`,
          userAnswer: `${payload.selectedChoice.id}. ${payload.selectedChoice.text}`,
          mode: 'main-recall',
          elapsedMs: payload.elapsedMs,
          sessionId: flowSignals?.runId,
          interactionId: payload.interactionId,
          generatedCardId: activeMultipleChoiceCard.id,
          generatedCard: {
            ...activeMultipleChoiceCard,
            cardMode: 'multiple-choice',
            prompt: activeMultipleChoiceCard.question,
          },
          templateMode: 'algorithm',
          supportLayer: 'none',
          modality: 'mcq',
          signals: {
            ...(flowSignals ? { flow: flowSignals } : {}),
            modality: {
              kind: 'mcq',
              correct: payload.correct,
              selectedChoiceId: payload.selectedChoice.id,
              correctChoiceId: payload.correctChoice.id,
            },
          },
          liveCoachUsed: false,
          targetSource: 'recall-miss',
          targetControl: isFlowActive ? 'system' : 'user',
          formatControl: isFlowActive ? 'system' : 'user',
          submissionTuning,
          llmProvider: requestLlmProvider,
        }),
      })
      if (!response.ok) throw new Error('Unable to submit attempt')
      const saved = (await response.json()) as SubmissionSaveResponse
      if (flowSignals) {
        recordFlowSubmission({
          response: saved,
          flowSignals,
          modality: 'mcq',
          modalitySignals: {
            correct: payload.correct,
            selectedChoiceId: payload.selectedChoice.id,
            correctChoiceId: payload.correctChoice.id,
          },
          elapsedMs: payload.elapsedMs,
          interactionId: payload.interactionId,
          question: activeMultipleChoiceCard.question,
        })
      }
      return saved
    } catch {
      // silently fail
      return null
    }
  }

  const resetPerCardInteraction = () => {
    setMainPhase('preview')
    setRecallMinHeight(undefined)
    setMainInput('')
    setInlineTaskProgress(0)
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setMultipleChoiceSelectedChoiceId('')
    setMultipleChoiceStartedAt(Date.now())
    setFlowMultipleChoiceSelectedChoiceId('')
    setFlowMultipleChoiceStartedAt(Date.now())
    setCurrentInteractionId('')
    setLiveCoachFeedback(null)
    setLiveCoachFeedbackMeta({ trigger: 'auto', hintDepth: 0, cursorLineNumber: null })
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setLiveCoachUsedThisAttempt(false)
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSubmissionFailureModal(null)
    setTagsExpanded(false)
    liveCoachRequestVersionRef.current = 0
    liveCoachSnapshotRef.current = null
    lastLiveCoachDecisionKeyRef.current = ''
    stuckHintDepthRef.current = 0
    lastStuckHintInputRef.current = ''
    lastMainInputEditAtRef.current = 0
    pendingGhostFocusLineRef.current = null
  }

  const resetFlowMultipleChoiceState = () => {
    setFlowMultipleChoiceDeck([])
    setFlowMultipleChoiceLoading(false)
    setFlowMultipleChoiceError('')
    setFlowMultipleChoicePosition(0)
    setFlowMultipleChoiceSelectedChoiceId('')
    setFlowMultipleChoiceStartedAt(null)
    setFlowMultipleChoiceSubmittedByCard({})
    flowMultipleChoiceDeckRequestVersionRef.current += 1
  }

  const beginPracticeFlowTransition = ({
    fromStage,
    toStage,
    anchorCardId,
    step,
    mode,
    latestAttempt,
    newAnchor = false,
  }: {
    fromStage: FlowStage | null
    toStage: FlowStage
    anchorCardId: string
    step: number
    mode: FlowConfig['mode']
    latestAttempt?: FlowAttempt
    newAnchor?: boolean
  }) => {
    const copy = buildFlowTransitionCopy({ fromStage, toStage, mode, latestAttempt, newAnchor })
    setFlowMicroDrillPrimaryActionState(EMPTY_FLOW_MICRODRILL_ACTION_STATE)
    setFlowTransition({
      id: createInteractionId(),
      fromStage,
      toStage,
      anchorCardId,
      step,
      startedAt: Date.now(),
      ...copy,
    })
  }

  const startPracticeFlow = async () => {
    flowInteractionVersionRef.current += 1
    const flowInteractionVersion = flowInteractionVersionRef.current
    if (!hasRecallDeck || sessionFinished) return
    saveFlowConfig(flowConfig)
    const history = await loadFlowHistoryForCard(card)
    if (flowInteractionVersionRef.current !== flowInteractionVersion) return
    const first = nextFlowStep(flowConfig, 0, Math.random, history)
    const runId = createInteractionId()
    setPracticeMode('recall')
    setSupportLayer('none')
    resetFlowMultipleChoiceState()
    beginPracticeFlowTransition({
      fromStage: null,
      toStage: first.stage,
      anchorCardId: card.id,
      step: 0,
      mode: flowConfig.mode,
    })
    setPracticeFlow({
      anchorCardId: card.id,
      anchorTitle: card.title,
      ...first,
      config: structuredClone(flowConfig),
      step: 0,
      runId,
      focus: initialFlowFocus(card),
      completedAnchorIds: [],
    })
    resetPerCardInteraction()
  }

  const stopPracticeFlow = () => {
    flowInteractionVersionRef.current += 1
    setPracticeFlow(null)
    setFlowTransition(null)
    setSupportLayer('none')
    resetFlowMultipleChoiceState()
    setPracticeMode('recall')
    resetPerCardInteraction()
  }

  const advancePracticeFlow = async () => {
    if (!practiceFlow || flowTransition) return
    flowInteractionVersionRef.current += 1
    const flowInteractionVersion = flowInteractionVersionRef.current
    const step = practiceFlow.step + 1
    const anchorHistory = flowAttemptsRef.current.filter((attempt) => attempt.anchorCardId === practiceFlow.anchorCardId)
    const mastery = summarizeFlowMastery(anchorHistory)
    if (practiceFlow.config.mode === 'adaptive' && mastery.mastered) {
      const nextAnchor = nextFlowAnchor(filteredDeck, practiceFlow.anchorCardId, practiceFlow.completedAnchorIds)
      if (nextAnchor) {
        beginPracticeFlowTransition({
          fromStage: practiceFlow.stage,
          toStage: 'recall',
          anchorCardId: nextAnchor.id,
          step,
          mode: practiceFlow.config.mode,
          latestAttempt: anchorHistory.at(-1),
          newAnchor: true,
        })
        await loadFlowHistoryForCard(nextAnchor)
        if (flowInteractionVersionRef.current !== flowInteractionVersion) return
        setPracticeFlow({
          ...practiceFlow,
          anchorCardId: nextAnchor.id,
          anchorTitle: nextAnchor.title,
          stage: 'recall',
          cycle: practiceFlow.cycle + 1,
          step,
          focus: initialFlowFocus(nextAnchor),
          completedAnchorIds: [...practiceFlow.completedAnchorIds, practiceFlow.anchorCardId],
        })
        setSupportLayer('none')
        resetFlowMultipleChoiceState()
        resetPerCardInteraction()
        return
      }
    }
    const next = nextFlowStep(practiceFlow.config, step, Math.random, anchorHistory)
    beginPracticeFlowTransition({
      fromStage: practiceFlow.stage,
      toStage: next.stage,
      anchorCardId: practiceFlow.anchorCardId,
      step,
      mode: practiceFlow.config.mode,
      latestAttempt: anchorHistory.at(-1),
    })
    setPracticeFlow({ ...practiceFlow, ...next, step })
    setSupportLayer('none')
    resetFlowMultipleChoiceState()
    resetPerCardInteraction()
  }

  const advanceFlowMultipleChoice = advancePracticeFlow

  const switchPracticeFlowStage = (nextStage: PracticeFlowStage) => {
    if (!practiceFlow || flowTransition || practiceFlow.stage === nextStage || mainPhase === 'typing') return
    flowInteractionVersionRef.current += 1
    const anchorHistory = flowAttemptsRef.current.filter((attempt) => attempt.anchorCardId === practiceFlow.anchorCardId)
    beginPracticeFlowTransition({
      fromStage: practiceFlow.stage,
      toStage: nextStage,
      anchorCardId: practiceFlow.anchorCardId,
      step: practiceFlow.step,
      mode: practiceFlow.config.mode,
      latestAttempt: anchorHistory.at(-1),
    })
    setPracticeFlow({ ...practiceFlow, stage: nextStage })
    setSupportLayer('none')
    resetFlowMultipleChoiceState()
    resetPerCardInteraction()
  }

  const toggleInlineHelper = () => {
    if (!INLINE_FEEDBACK_ENABLED) return
    setInlineEnabled((prev) => !prev)
    if (mainPhase !== 'preview') {
      resetPerCardInteraction()
    }
  }

  useEffect(() => {
    resetPerCardInteraction()
    if (practiceFlow?.stage === 'recall' || practiceFlow?.stage === 'ghost') {
      startMainRecall()
    }
    // Flow stages should begin as soon as they are selected; standalone recall still begins from preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCardId, currentPracticeMode, flowMultipleChoicePosition, practiceFlow?.cycle, practiceFlow?.stage, practiceFlow?.step, sessionPosition])

  const flowTransitionReady = useMemo(() => {
    if (!flowTransition || !practiceFlow) return false
    if (
      practiceFlow.anchorCardId !== flowTransition.anchorCardId
      || practiceFlow.step !== flowTransition.step
      || practiceFlow.stage !== flowTransition.toStage
    ) return false

    if (flowTransition.toStage === 'recall' || flowTransition.toStage === 'ghost') {
      return mainPhase === 'typing'
    }
    if (flowTransition.toStage === 'multiple-choice') {
      return flowMultipleChoiceDeck.length > 0
        || Boolean(flowMultipleChoiceError && !flowMultipleChoiceLoading)
    }

    const interactionKey = `${practiceFlow.runId}-${practiceFlow.step}`
    return flowMicroDrillPrimaryActionState.interactionKey === interactionKey
      && (flowMicroDrillPrimaryActionState.ready || flowMicroDrillPrimaryActionState.failed)
  }, [
    flowMicroDrillPrimaryActionState,
    flowMultipleChoiceDeck.length,
    flowMultipleChoiceError,
    flowMultipleChoiceLoading,
    flowTransition,
    mainPhase,
    practiceFlow,
  ])

  useEffect(() => {
    if (!flowTransition || !flowTransitionReady) return
    const transitionId = flowTransition.id
    const delay = Math.max(0, FLOW_TRANSITION_MINIMUM_MS - (Date.now() - flowTransition.startedAt))
    const timeoutId = window.setTimeout(() => {
      setFlowTransition((current) => current?.id === transitionId ? null : current)
      if (flowTransition.toStage === 'recall' || flowTransition.toStage === 'ghost') {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          if (flowTransition.toStage === 'ghost') {
            const firstTargetLine = firstIncompleteGhostLineNumber(flowGhostScaffold, practiceFlow?.focus.missedLines ?? [])
            if (firstTargetLine) {
              mainInputRef.current?.focusLine(firstTargetLine)
              return
            }
          }
          mainInputRef.current?.focusEnd()
        }))
      }
    }, delay)
    return () => window.clearTimeout(timeoutId)
  }, [flowGhostScaffold, flowTransition, flowTransitionReady, practiceFlow?.focus.missedLines])

  useEffect(() => {
    if (mainPhase !== 'typing') return
    const pendingGhostLine = pendingGhostFocusLineRef.current
    if (pendingGhostLine !== null) {
      pendingGhostFocusLineRef.current = null
      window.requestAnimationFrame(() => {
        mainInputRef.current?.focusLine(pendingGhostLine)
      })
      return
    }
    if (!shouldFocusMainInputRef.current) return
    shouldFocusMainInputRef.current = false
    window.requestAnimationFrame(() => {
      mainInputRef.current?.focusEnd()
    })
  }, [mainPhase, mainInput])

  const handleGhostRepEnterKey = (context: { value: string, cursorLineNumber: number }) => {
    if (practiceFlow?.stage !== 'ghost' || mainPhase !== 'typing') return false
    const nextLineNumber = nextGhostLineNumber(context.cursorLineNumber, context.value, practiceFlow.focus.missedLines)
    if (!nextLineNumber) return false
    mainInputRef.current?.focusLine(nextLineNumber)
    return true
  }

  const startMainRecall = () => {
    if (!hasDeck || hasAnsweredCurrent || sessionFinished) return
    if (previewCodeContainerRef.current) {
      setRecallMinHeight(previewCodeContainerRef.current.offsetHeight)
    }
    setMainPhase('typing')
    setMainStartedAt(Date.now())
    setInlineTaskProgress(0)
    if (practiceFlow?.stage === 'ghost') {
      setMainInput(flowGhostScaffold)
      pendingGhostFocusLineRef.current = firstIncompleteGhostLineNumber(flowGhostScaffold, practiceFlow.focus.missedLines)
    } else {
      setMainInput('')
      pendingGhostFocusLineRef.current = null
    }
    setCurrentInteractionId(createInteractionId())
    lastMainInputEditAtRef.current = Date.now()
    liveCoachSnapshotRef.current = null
    lastLiveCoachDecisionKeyRef.current = ''
    stuckHintDepthRef.current = 0
    lastStuckHintInputRef.current = ''
    setLiveCoachFeedbackMeta({ trigger: 'auto', hintDepth: 0, cursorLineNumber: null })
  }

  const handleMainInputChange = (nextValue: string, context: { cursorLineNumber: number }) => {
    if (mainPhase !== 'typing') return
    setMainInput(nextValue)
    if (inlineEnabled && !isGhostRepsEnabled) {
      const completedLineCount = nextValue
        .split('\n')
        .slice(0, Math.max(context.cursorLineNumber - 1, 0))
        .filter((line) => line.trim().length > 0)
        .length
      setInlineTaskProgress((current) => Math.max(current, completedLineCount))
    }
    lastMainInputEditAtRef.current = Date.now()
  }

  const fetchLiveCoachFeedback = async (payload: {
    interactionId: string
    expectedAnswer: string
    userAnswer: string
    elapsedMs: number
    exact: boolean
    previousAttempts: RecallAttemptSnapshot[]
    liveStructure: LiveStructure
    trigger?: LiveFeedbackTrigger
    hintDepth?: number
    cursorLineNumber?: number | null
    editContext?: HotkeyEditContext
  }) => {
    if (!liveFeedbackEnabled) return
    const trigger = payload.trigger ?? 'auto'
    const hintDepth = trigger === 'hotkey-stuck' ? Math.max(1, payload.hintDepth ?? 1) : 0
    const cursorLineNumber = payload.cursorLineNumber ?? null
    const requestCardId = card.id
    liveCoachRequestVersionRef.current += 1
    const requestVersion = liveCoachRequestVersionRef.current
    setLiveCoachLoading(true)
    setLiveCoachError('')
    try {
      const response = await fetch(apiUrl('/api/coach/live-feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          cardTitle: card.title,
          prompt: practicePrompt,
          expectedAnswer: payload.expectedAnswer,
          userAnswer: payload.userAnswer,
          elapsedMs: payload.elapsedMs,
          exact: payload.exact,
          interactionId: payload.interactionId,
          skillTags: currentSkillTags,
          previousAttempts: payload.previousAttempts.map((attempt) => ({
            attemptNumber: attempt.attemptNumber,
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
            trigger,
            hintDepth,
            cursorLineNumber,
            editContext: payload.editContext ?? null,
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
      setLiveCoachFeedbackMeta({ trigger, hintDepth, cursorLineNumber })
      setLiveCoachUsedThisAttempt(true)
    } catch {
      if (currentCardIdRef.current !== requestCardId || liveCoachRequestVersionRef.current !== requestVersion) return
      setLiveCoachError('Live coach unavailable right now.')
      setLiveCoachFeedbackMeta({ trigger, hintDepth, cursorLineNumber })
      setLiveCoachFeedback(null)
    } finally {
      if (currentCardIdRef.current === requestCardId && liveCoachRequestVersionRef.current === requestVersion) {
        setLiveCoachLoading(false)
      }
    }
  }

  const requestLiveCoachFeedback = useEffectEvent(fetchLiveCoachFeedback)
  const toggleLiveFeedback = () => {
    if (!LIVE_FEEDBACK_ENABLED) return
    setLiveCoachTuning((prev) => ({ ...prev, enabled: !prev.enabled }))
  }

  const toggleMicroDrill = () => {
    setSubmissionTuning((prev) => ({
      ...prev,
      microDrillEnabled: !prev.microDrillEnabled,
    }))
  }

  const fetchSessionPlan = async () => {
    if (sessionPlanRequested) return
    setSessionPlanRequested(true)
    setSessionPlanLoading(true)
    setSessionPlanError('')

    try {
      const weakCards = Object.entries(sessionResults)
        .filter(([, successful]) => !successful)
        .map(([cardId]) => {
          const found = filteredDeck.find((item) => item.id === cardId)
          return {
            cardId,
            cardTitle: found?.title ?? '',
            elapsedMs: sessionElapsedByCard[cardId] ?? 0,
          }
        })
        .slice(0, 5)

      const response = await fetch(apiUrl('/api/coach/session-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'main-recall',
          questionType: requestedQuestionType,
          attempts,
          correctCount,
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
    if (
      currentPracticeMode !== 'recall'
      || !hasDeck
      || hasAnsweredCurrent
      || sessionFinished
      || mainPhase !== 'typing'
      || recallEvaluationPendingRef.current
    ) return

    const flowInteractionVersion = flowInteractionVersionRef.current
    const startedAt = mainStartedAt ?? Date.now()
    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const elapsedMs = Math.max(Date.now() - startedAt, 1)
    const normalizedInput = currentRecallSubmissionInput
    const normalizedInputLines = normalizedInput.split('\n')
    const normalizedTarget = activeRecallTarget
    const isGhostRep = effectiveSupportLayer === 'ghost-reps'
    const lineReviews = computeLineReview(normalizedTarget, normalizedInput).reviews
    const missedLineCount = lineReviews.filter((line) => line.status !== 'match').length
    recallEvaluationPendingRef.current = true
    if (!isGhostRep) {
      setCoachFeedback(null)
      setCoachLoading(true)
      setCoachError('')
      setSubmissionFailureModal(null)
    }
    const submission = await submitAttemptToServer({
      mode: 'main-recall',
      correctAnswer: normalizedTarget,
      userAnswer: normalizedInput,
      elapsedMs,
      interactionId,
      templateMode: currentTemplateMode,
      supportLayer: effectiveSupportLayer,
      liveCoachUsed: liveCoachUsedThisAttempt,
      modality: isGhostRep ? 'ghost-rep' : 'total-recall',
      signals: {
        modality: {
          exact: normalizedInput === normalizedTarget,
          targetLineCount: normalizedTarget.split('\n').filter((line) => line.trim().length > 0).length,
          submittedLineCount: normalizedInputLines.filter((line) => line.trim().length > 0).length,
          missedLineCount,
          ...(isGhostRep && practiceFlow
            ? { focusedLineNumbers: practiceFlow.focus.missedLines.map((line) => line.lineNumber) }
            : {}),
        },
      },
    })
      .finally(() => {
        recallEvaluationPendingRef.current = false
        if (flowInteractionVersionRef.current === flowInteractionVersion) setCoachLoading(false)
      })
    if (flowInteractionVersionRef.current !== flowInteractionVersion) return
    if (practiceFlow && !submission?.saved) {
      setCoachError('Your rep could not be saved. Submit again to continue.')
      return
    }
    const sound = submission?.successful ?? normalizedInput === normalizedTarget
    const storedFeedback = submission?.evaluation?.feedback ?? {}
    const feedback = Object.keys(storedFeedback).length > 0
      ? storedFeedback as CoachAttemptFeedback
      : null
    if (!isGhostRep) {
      setCoachFeedback(feedback)
      if (!submission) {
        setCoachError('Submission evaluation unavailable for this attempt.')
      }
      if (submission?.feedbackUnavailable) {
        setSubmissionFailureModal({
          providerLabel: configuredProviderLabel,
          message: submission.feedbackUnavailable.message,
        })
      }
    }
    const closeEnough = !isGhostRep && sound
    const historyKey = currentRecallHistoryKey
    const currentHistory = mainRecallHistoryByCard[historyKey] ?? []
    const attemptSnapshot = summarizeRecallAttempt(
      normalizedInputLines,
      sound,
      elapsedMs,
      currentHistory.length + 1,
      effectiveSupportLayer
    )
    setMainCloseEnough(closeEnough)
    setMainPhase('submitted')
    setMainRecallHistoryByCard((prev) => ({
      ...prev,
      [historyKey]: [...(prev[historyKey] ?? []), attemptSnapshot],
    }))

    if (practiceFlow) {
      if (practiceFlow.stage === 'recall') {
        const missedLines = toMultipleChoiceFocusLines(lineReviews)
        setPracticeFlow((current) => current ? {
          ...current,
          focus: {
            sequenceStage: 'recall',
            focusSummary: buildFlowFocusSummary(card.title, missedLines),
            missedLines,
          },
        } : current)
      }
      return
    }

    if (!isGhostRep && closeEnough) {
      completeCardInSession(sound, elapsedMs)
    }
  }

  const submitMultipleChoice = async () => {
    const selectedChoiceId = isFlowActive ? flowMultipleChoiceSelectedChoiceId : multipleChoiceSelectedChoiceId
    const activeStartedAt = isFlowActive ? flowMultipleChoiceStartedAt : multipleChoiceStartedAt
    if (
      currentPracticeMode !== 'multiple-choice' ||
      !activeMultipleChoiceCard ||
      !hasDeck ||
      hasAnsweredCurrent ||
      sessionFinished ||
      !selectedChoiceId
    ) {
      return
    }

    const selectedChoice = activeMultipleChoiceCard.choices.find((choice) => choice.id === selectedChoiceId)
    const correctChoice = activeMultipleChoiceCard.choices.find((choice) => choice.id === activeMultipleChoiceCard.correctChoiceId)
    if (!selectedChoice || !correctChoice) return

    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const elapsedMs = Math.max(Date.now() - (activeStartedAt ?? Date.now()), 1)
    const correct = selectedChoice.id === correctChoice.id

    if (isFlowActive && practiceFlow) {
      setFlowMultipleChoiceSubmittedByCard((prev) => ({
        ...prev,
        [activeMultipleChoiceCard.id]: selectedChoice.id,
      }))

    } else {
      setMultipleChoiceSubmittedByCard((prev) => ({
        ...prev,
        [activeMultipleChoiceCard.id]: selectedChoice.id,
      }))
      completeCardInSession(correct, elapsedMs)
    }

    const saved = await submitMultipleChoiceAttemptToServer({
      interactionId,
      selectedChoice,
      correctChoice,
      correct,
      elapsedMs,
    })
    if (isFlowActive && !saved?.saved) {
      setFlowMultipleChoiceSubmittedByCard((current) => {
        const next = { ...current }
        delete next[activeMultipleChoiceCard.id]
        return next
      })
      setFlowMultipleChoiceError('Your answer could not be saved. Submit again before continuing.')
    }
  }

  const reviseMainRecall = () => {
    if (practiceFlow) return
    if (!hasDeck || hasAnsweredCurrent || sessionFinished || mainPhase !== 'submitted' || mainCloseEnough) return
    setMainPhase('typing')
    setInlineTaskProgress((current) => Math.max(
      current,
      mainInput.split('\n').filter((line) => line.trim().length > 0).length
    ))
    setMainStartedAt(Date.now())
    setCurrentInteractionId(createInteractionId())
    lastMainInputEditAtRef.current = Date.now()
    liveCoachSnapshotRef.current = null
    lastLiveCoachDecisionKeyRef.current = ''
  }

  const repeatGhostRep = () => {
    if (!hasDeck || hasAnsweredCurrent || sessionFinished || mainPhase !== 'submitted') return
    shouldFocusMainInputRef.current = !practiceFlow || practiceFlow.stage !== 'ghost'
    setMainPhase('typing')
    setInlineTaskProgress(0)
    if (practiceFlow?.stage === 'ghost') {
      setMainInput(flowGhostScaffold)
      pendingGhostFocusLineRef.current = firstIncompleteGhostLineNumber(flowGhostScaffold, practiceFlow.focus.missedLines)
    } else {
      setMainInput('')
      pendingGhostFocusLineRef.current = null
    }
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
    if (isFlowActive) return
    if (practiceMode === 'multiple-choice') {
      setMultipleChoiceRefreshToken((prev) => prev + 1)
      return
    }
    setSkillMapRefreshToken((prev) => prev + 1)
  }

  const goNext = () => {
    if (isFlowActive) return
    if (sessionFinished) return
    setSessionPosition((prev) => Math.min(prev + 1, Math.max(sessionOrder.length - 1, 0)))
  }

  const goPrev = () => {
    if (isFlowActive) return
    setSessionPosition((prev) => Math.max(prev - 1, 0))
  }

  const attempts = Object.keys(sessionResults).length
  const correctCount = Object.values(sessionResults).filter(Boolean).length
  const canGoNext = !isFlowActive && sessionPosition < sessionOrder.length - 1
  const canGoPrev = !isFlowActive && sessionPosition > 0

  useEffect(() => {
    if (!sessionFinished) return
    if (currentPracticeMode === 'multiple-choice') return
    void fetchSessionPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPracticeMode, sessionFinished])

  const liveStructure = useMemo(
    () => analyzeLiveStructure(mainInput, currentTemplateMode),
    [currentTemplateMode, mainInput]
  )
  const currentCardRecallHistory = useMemo(
    () => mainRecallHistoryByCard[currentRecallHistoryKey] ?? [],
    [currentRecallHistoryKey, mainRecallHistoryByCard]
  )
  const inlineLiveNotes = useMemo(() => {
    if (mainPhase !== 'typing' || !liveFeedbackEnabled) return []
    const sourceLines = (mainInput || '').split('\n')
    const isStuckHint = liveCoachFeedbackMeta.trigger === 'hotkey-stuck'
    const preferredIndex = isStuckHint && liveCoachFeedbackMeta.cursorLineNumber
      ? liveCoachFeedbackMeta.cursorLineNumber - 1
      : liveCoachSnapshotRef.current?.changedLine ?? sourceLines.length - 1
    const anchoredFallback = findNearestWrittenLineIndex(sourceLines, preferredIndex)

    if (liveCoachError) {
      return [{
        text: liveCoachError,
        sourceLineNumber: anchoredFallback >= 0 ? anchoredFallback + 1 : null,
        tone: 'negative',
        maxWords: isStuckHint ? 14 : undefined,
      }] satisfies LiveInlineNote[]
    }
    if (!liveCoachFeedback) return []

    const stuckDepth = Math.max(1, liveCoachFeedbackMeta.hintDepth)
    const candidateNotes = isStuckHint
      ? stuckDepth === 1
        ? [
            { text: liveCoachFeedback.affirmation ?? '', tone: 'positive' as const },
            ...liveCoachFeedback.strengths.map((text) => ({ text, tone: 'positive' as const })),
            { text: liveCoachFeedback.diagnosis, tone: 'neutral' as const },
          ]
        : stuckDepth === 2
          ? [
              { text: liveCoachFeedback.keepInMind ?? '', tone: 'neutral' as const },
              { text: liveCoachFeedback.why ?? '', tone: 'neutral' as const },
              { text: liveCoachFeedback.affirmation ?? '', tone: 'positive' as const },
              ...liveCoachFeedback.strengths.map((text) => ({ text, tone: 'positive' as const })),
              { text: liveCoachFeedback.diagnosis, tone: 'neutral' as const },
            ]
          : [
              { text: liveCoachFeedback.why ?? '', tone: 'neutral' as const },
              { text: liveCoachFeedback.diagnosis, tone: 'neutral' as const },
              { text: liveCoachFeedback.keepInMind ?? '', tone: 'neutral' as const },
              ...liveCoachFeedback.strengths.map((text) => ({ text, tone: 'positive' as const })),
            ]
      : [
          { text: liveCoachFeedback.affirmation ?? '', tone: 'positive' as const },
          ...liveCoachFeedback.strengths.map((text) => ({ text, tone: 'positive' as const })),
          { text: liveCoachFeedback.why, tone: 'neutral' as const },
          { text: liveCoachFeedback.diagnosis, tone: 'negative' as const },
          { text: liveCoachFeedback.primaryFocus, tone: 'negative' as const },
          { text: liveCoachFeedback.nextMove, tone: 'negative' as const },
          { text: liveCoachFeedback.immediateCorrection, tone: 'negative' as const },
        ]

    const seenNotes = new Set<string>()
    const notes: LiveInlineNote[] = []
    for (const candidate of candidateNotes) {
      const maxWords = isStuckHint ? 14 : undefined
      const note = shortenAnnotationNote(candidate.text ?? '', maxWords)
      if (!note) continue
      const noteKey = note.toLowerCase()
      if (seenNotes.has(noteKey)) continue
      seenNotes.add(noteKey)

      const anchoredIndex = isStuckHint && candidate.tone !== 'positive'
        ? anchoredFallback
        : findBestLiveNoteAnchorLine(sourceLines, note, preferredIndex)
      notes.push({
        text: note,
        sourceLineNumber: anchoredIndex >= 0 ? anchoredIndex + 1 : null,
        tone: candidate.tone,
        maxWords,
      })

      const maxLiveNotes = isStuckHint && stuckDepth === 1 ? 2 : isStuckHint ? 1 : 2
      if (notes.length >= maxLiveNotes) break
    }

    return notes
  }, [liveCoachError, liveCoachFeedback, liveCoachFeedbackMeta, liveFeedbackEnabled, mainInput, mainPhase])
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
        text: appendAlignedNote(line.text, annotation.note, annotation.maxWords),
        liveTone: annotation.tone,
      }
    })
  }, [inlineLiveNotes, isGhostRepsEnabled, mainInput, mainPhase, practicePlaceholder])
  const ghostTargetCode = useMemo(() => {
    if (practiceFlow?.stage === 'ghost') {
      return practiceTarget
    }
    if (inlineEnabled && isGhostRepsEnabled && liveFeedbackEnabled) {
      return stripInlineAnnotationNotes(practiceTarget)
    }
    return practiceTarget
  }, [inlineEnabled, isGhostRepsEnabled, liveFeedbackEnabled, practiceFlow?.stage, practiceTarget])
  const previewDisplayLines = useMemo(() => inlineDisplayLines(practiceTarget), [practiceTarget])
  const previewEditorValue = useMemo(
    () => previewDisplayLines
      .map(({ line }) => splitInlineAnnotationLine(line).code)
      .join('\n')
      .trimEnd(),
    [previewDisplayLines]
  )
  const triggerLiveCoachRefresh = useEffectEvent((
    trimmedInput: string,
    options?: {
      trigger?: LiveFeedbackTrigger
      hintDepth?: number
      cursorLineNumber?: number | null
      editContext?: HotkeyEditContext
    }
  ) => {
    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const target = activeRecallTarget
    const focusedInput = practiceFlow?.stage === 'ghost'
      ? extractFlowGhostFocusedInput(trimmedInput, practiceFlow.focus.missedLines)
      : trimmedInput
    void requestLiveCoachFeedback({
      interactionId,
      expectedAnswer: target,
      userAnswer: focusedInput,
      elapsedMs: Math.max((mainStartedAt ? Date.now() - mainStartedAt : 0), 0),
      exact: focusedInput === target,
      previousAttempts: currentCardRecallHistory,
      liveStructure: liveStructure,
      trigger: options?.trigger,
      hintDepth: options?.hintDepth,
      cursorLineNumber: options?.cursorLineNumber,
      editContext: options?.editContext,
    })
  })
  const requestStuckHint = useEffectEvent(() => {
    if (!liveFeedbackEnabled) return
    if (currentPracticeMode !== 'recall') return
    if (!hasDeck || mainPhase !== 'typing' || sessionFinished || hasAnsweredCurrent) return

    const trimmedInput = currentRecallSubmissionInput
    if (!hasUsefulLiveStructure(trimmedInput, liveStructure)) return

    const cursorPosition = mainInputRef.current?.getCursorPosition() ?? mainInput.length
    const cursorLineNumber = mainInput.slice(0, cursorPosition).split('\n').length
    const editContext = buildHotkeyEditContext(lastStuckHintInputRef.current, trimmedInput)
    const nextDepth = editContext.changedSinceLastHint ? 1 : stuckHintDepthRef.current + 1
    stuckHintDepthRef.current = nextDepth
    lastStuckHintInputRef.current = trimmedInput
    liveCoachSnapshotRef.current = {
      text: trimmedInput,
      progressKey: liveProgressKey(liveStructure),
      nonEmptyLines: liveStructure.nonEmptyLines,
      changedLine: cursorLineNumber - 1,
      sameLineEditCount: 0,
      lastMeaningfulProgressAt: Date.now(),
    }
    lastLiveCoachDecisionKeyRef.current = `hotkey-stuck|${card.id}|${currentTemplateMode}|${nextDepth}|${cursorLineNumber}|${Math.floor(trimmedInput.length / 20)}`
    setLiveCoachFeedback(null)
    setLiveCoachFeedbackMeta({ trigger: 'hotkey-stuck', hintDepth: nextDepth, cursorLineNumber })
    setLiveCoachError('')
    triggerLiveCoachRefresh(trimmedInput, {
      trigger: 'hotkey-stuck',
      hintDepth: nextDepth,
      cursorLineNumber,
      editContext,
    })
  })
  const latestSubmittedAttempt =
    mainPhase === 'submitted' ? currentCardRecallHistory[currentCardRecallHistory.length - 1] ?? null : null
  const latestSubmittedWasGhostRep = latestSubmittedAttempt?.supportLayer === 'ghost-reps'
  const submittedMultipleChoiceId = activeMultipleChoiceCard
    ? (isFlowActive
        ? flowMultipleChoiceSubmittedByCard[activeMultipleChoiceCard.id] ?? ''
        : multipleChoiceSubmittedByCard[activeMultipleChoiceCard.id] ?? '')
    : ''
  const selectedMultipleChoice = activeMultipleChoiceCard?.choices.find((choice) => choice.id === (isFlowActive ? flowMultipleChoiceSelectedChoiceId : multipleChoiceSelectedChoiceId)) ?? null
  const correctMultipleChoice = activeMultipleChoiceCard?.choices.find((choice) => choice.id === activeMultipleChoiceCard.correctChoiceId) ?? null
  const multipleChoiceSubmitted = Boolean(submittedMultipleChoiceId)
  const multipleChoiceCorrect = Boolean(submittedMultipleChoiceId && submittedMultipleChoiceId === activeMultipleChoiceCard?.correctChoiceId)
  const flowMicroDrillActionKey = practiceFlow?.stage === 'microdrill'
    ? `${practiceFlow.runId}-${practiceFlow.step}`
    : ''
  const primaryCardAction = (() => {
    if (practiceFlow?.stage === 'microdrill') {
      const microDrillActionState = flowMicroDrillPrimaryActionState.interactionKey === flowMicroDrillActionKey
        ? flowMicroDrillPrimaryActionState
        : EMPTY_FLOW_MICRODRILL_ACTION_STATE
      if (microDrillActionState.submitted) {
        return {
          label: 'Next',
          onClick: advancePracticeFlow,
          disabled: false,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          ),
        }
      }
      return {
        label: 'Submit',
        onClick: () => flowMicroDrillPrimaryActionRef.current(),
        disabled: !microDrillActionState.ready
          || !microDrillActionState.complete
          || microDrillActionState.saving,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ),
      }
    }
    if (!hasDeck) return null
    if (practiceFlow && currentPracticeMode === 'recall' && mainPhase === 'submitted') {
      return {
        label: 'Next',
        onClick: advancePracticeFlow,
        disabled: coachLoading,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        ),
      }
    }

    if (currentPracticeMode === 'multiple-choice') {
      if (isFlowActive && multipleChoiceSubmitted) {
        return {
          label: 'Next',
          onClick: advanceFlowMultipleChoice,
          disabled: sessionFinished,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          ),
        }
      }
      if (multipleChoiceSubmitted) return null
      return {
        label: 'Submit',
        onClick: submitMultipleChoice,
        disabled: !selectedMultipleChoice || hasAnsweredCurrent || sessionFinished,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ),
      }
    }

    if (!isFlowActive && submissionTuning.microDrillEnabled && coachLoading && effectiveSupportLayer !== 'ghost-reps') {
      return {
        label: 'Start',
        onClick: () => undefined,
        disabled: true,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
          </svg>
        ),
      }
    }

    if (practiceFlow?.stage === 'ghost' && mainPhase === 'submitted' && !latestSubmittedWasGhostRep) {
      return {
        label: 'Start',
        onClick: repeatGhostRep,
        disabled: sessionFinished,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v18M3 12h18" />
          </svg>
        ),
      }
    }

    if (mainPhase === 'preview') {
      return {
        label: 'Start',
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
        label: 'Submit',
        onClick: submitMainRecall,
        disabled: currentRecallSubmissionInput.trim().length === 0,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
          </svg>
        ),
      }
    }

    if (latestSubmittedWasGhostRep) {
      return {
        label: 'Submit',
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
        label: 'Submit',
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
    if (isFlowActive || mainPhase !== 'submitted' || !latestSubmittedWasGhostRep) return
    const handler = (event: KeyboardEvent) => {
      if (matchesHotkey(event, 'primary-recall-action')) {
        event.preventDefault()
        repeatGhostRep()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFlowActive, latestSubmittedWasGhostRep, mainPhase, sessionFinished, sessionOrder.length, sessionPosition])

  useEffect(() => {
    if (isFlowActive) return
    const handler = (event: KeyboardEvent) => {
      if (
        event.repeat
        || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
        || (!event.metaKey && !event.ctrlKey)
        || event.altKey
        || event.shiftKey
      ) return

      event.preventDefault()
      const now = performance.now()
      const previousPress = lastCardMoveKeyRef.current
      const doubleTapped = previousPress?.key === event.key
        && now - previousPress.pressedAt <= CARD_MOVE_DOUBLE_TAP_WINDOW_MS

      lastCardMoveKeyRef.current = doubleTapped
        ? null
        : { key: event.key, pressedAt: now }

      if (!doubleTapped) return

      if (event.key === 'ArrowLeft' && canGoPrev) goPrev()
      if (event.key === 'ArrowRight' && canGoNext) goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canGoNext, canGoPrev, isFlowActive, sessionOrder.length, sessionPosition])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (currentPracticeMode !== 'recall') return
      if (matchesHotkey(event, 'stuck-hint')) {
        event.preventDefault()
        requestStuckHint()
        return
      }
      if (isFlowActive) return
      if (matchesHotkey(event, 'toggle-ghost-reps')) {
        event.preventDefault()
        setSupportLayer((prev) => (prev === 'ghost-reps' ? 'none' : 'ghost-reps'))
      }
      if (LIVE_FEEDBACK_ENABLED && matchesHotkey(event, 'toggle-live-feedback')) {
        event.preventDefault()
        setLiveCoachTuning((prev) => ({ ...prev, enabled: !prev.enabled }))
      }
      if (INLINE_FEEDBACK_ENABLED && matchesHotkey(event, 'toggle-inline-feedback')) {
        event.preventDefault()
        toggleInlineHelper()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentPracticeMode, isFlowActive, requestStuckHint, toggleInlineHelper])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!practiceFlow || mainPhase === 'typing') return

      const nextStage = matchesHotkey(event, 'flow-full-recall')
        ? 'recall'
        : matchesHotkey(event, 'flow-targeted-ghost')
          ? 'ghost'
          : matchesHotkey(event, 'flow-targeted-mcq')
            ? 'multiple-choice'
            : matchesHotkey(event, 'flow-targeted-microdrill')
              ? 'microdrill'
              : null
      if (!nextStage) return

      event.preventDefault()
      switchPracticeFlowStage(nextStage)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainPhase, practiceFlow])

  useEffect(() => {
    if (!zenMode) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setZenMode(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [zenMode])

  const flowStatusText = !practiceFlow
    ? flowHistoryLoading ? 'Loading prior attempts…' : 'Choose Adaptive to sequence from prior results and cross-modality weaknesses.'
    : practiceFlow.config.mode === 'adaptive'
      ? `${flowMastery.phase === 'mastered' ? 'Mastered' : flowMastery.phase[0].toUpperCase() + flowMastery.phase.slice(1)} · ${flowMastery.proficiency}% proficiency · evidence across ${flowMastery.successfulModalities} modalities · ${FLOW_LABELS[practiceFlow.stage]}`
    : practiceFlow.config.mode === 'random'
      ? `Rep ${practiceFlow.step + 1} · ${FLOW_LABELS[practiceFlow.stage]}. The next modality is chosen when you continue.`
      : `Cycle ${practiceFlow.cycle} · Rep ${practiceFlow.step % expandFlow(practiceFlow.config.blocks).length + 1} of ${expandFlow(practiceFlow.config.blocks).length} · ${FLOW_LABELS[practiceFlow.stage]}`
  const flowFocusPreviewLines = practiceFlow?.focus.missedLines.slice(0, 3) ?? []
  const cardFlowPanelStyle = useMemo<CSSProperties>(() => (
    cardFlowPanelMaxHeight
      ? ({ '--card-flow-panel-max-height': `${cardFlowPanelMaxHeight}px` } as CSSProperties)
      : {}
  ), [cardFlowPanelMaxHeight])
  const isMac = navigator.platform.includes('Mac')
  const primaryRecallHotkey = formatHotkey('primary-recall-action', isMac)
  const moveCardsHotkey = formatHotkey('move-cards', isMac)
  const indentOutdentHotkey = formatHotkey('indent-outdent', isMac)
  const recallEditorLineMeta = useMemo<RecallEditorLineMeta[]>(() => {
    const lineCount = Math.max((mainInput || '').split('\n').length, displayLines.length, 1)

    return Array.from({ length: lineCount }, (_, index) => {
      const displayLine = displayLines[index]
      const sourceLineNumber = displayLine?.sourceLineNumber ?? index + 1

      return {
        sourceLineNumber,
        status: null,
        liveTone: null,
        inlineDecision: false,
        inlineNote: undefined,
      }
    })
  }, [
    displayLines,
    mainInput,
  ])
  const previewEditorLineMeta = useMemo<RecallEditorLineMeta[]>(() => (
    plainPracticeTarget.split('\n').map((_, index) => ({
      sourceLineNumber: index + 1,
      inlineDecision: false,
      inlineNote: undefined,
    }))
  ), [plainPracticeTarget])

  const handleRecallEditorSubmitHotkey = () => {
    if (practiceFlow && mainPhase === 'submitted') {
      advancePracticeFlow()
      return
    }
    if (mainPhase === 'submitted' && latestSubmittedWasGhostRep) {
      repeatGhostRep()
      return
    }

    if (mainPhase === 'typing' && mainInput.trim().length > 0) {
      void submitMainRecall()
    }
  }

  useEffect(() => {
    if (liveFeedbackEnabled) return
    liveCoachRequestVersionRef.current += 1
    setLiveCoachLoading(false)
    setLiveCoachError('')
    setLiveCoachFeedback(null)
    setLiveCoachFeedbackMeta({ trigger: 'auto', hintDepth: 0, cursorLineNumber: null })
  }, [liveFeedbackEnabled])

  const feedbackRailModel = useMemo<FeedbackRailModel | null>(() => {
    if (currentPracticeMode !== 'recall' || !hasDeck) return null

    if (mainPhase === 'submitted' && !latestSubmittedWasGhostRep && SUBMISSION_FEEDBACK_ENABLED) {
      return {
        source: 'Submission',
        loading: coachLoading && !coachFeedback,
        submitted: true,
        items: compactFeedbackItems([
          coachFeedback?.affirmation,
          ...(coachFeedback?.strengths ?? []),
          coachFeedback?.keepInMind,
          coachError,
          coachFeedback?.diagnosis,
          coachFeedback?.primaryFocus,
          coachFeedback?.immediateCorrection,
          coachFeedback?.why,
        ], 8),
      }
    }

    return null
  }, [
    coachError,
    coachFeedback,
    coachLoading,
    currentPracticeMode,
    hasDeck,
    latestSubmittedWasGhostRep,
    mainPhase,
  ])
  const activeMicroDrill = !isFlowActive && submissionTuning.microDrillEnabled
    ? coachFeedback?.microDrill.trim() ?? ''
    : ''
  const microDrillContent = useMemo(
    () => parseMicroDrillContent(activeMicroDrill),
    [activeMicroDrill]
  )
  const microDrillLoading = Boolean(
    !isFlowActive && submissionTuning.microDrillEnabled
    && currentPracticeMode === 'recall'
    && coachLoading
    && effectiveSupportLayer !== 'ghost-reps'
  )
  const submissionFeedbackBlock = feedbackRailModel ? (
    <div
      className={[
        'submission-feedback-block',
        feedbackRailModel.submitted && !feedbackRailModel.loading && feedbackRailModel.items.length > 0
          ? 'submission-feedback-block-ready'
          : '',
      ].filter(Boolean).join(' ')}
      aria-label={`${feedbackRailModel.source} feedback`}
    >
      <div className="prompt-toggle-header">
        <div className="submission-feedback-heading">
          <span className="submission-feedback-label">
            <span className="submission-feedback-dot" aria-hidden="true" />
            Feedback
          </span>
          <span className="submission-feedback-summary" aria-live="polite">
            {feedbackRailModel.loading
              ? 'Generating your review…'
              : feedbackRailModel.items.length > 0
                ? 'Review your feedback'
                : 'No feedback returned'}
          </span>
        </div>
      </div>
      <div className="prompt-detail submission-feedback-detail" id={submissionFeedbackDetailId}>
        <div className="prompt-detail-section">
          {feedbackRailModel.loading && <p>Generating feedback...</p>}
          {!feedbackRailModel.loading && feedbackRailModel.items.length === 0 && (
            <p>{feedbackRailModel.submitted ? 'No feedback returned.' : 'No submission yet.'}</p>
          )}
          {!feedbackRailModel.loading && feedbackRailModel.items.length > 0 && (
            <div className="submission-feedback-block-list">
              {feedbackRailModel.items.map((item, index) => (
                <p key={`${index}-${item}`}>{item}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null

  const microDrillCardGrid = microDrillLoading ? (
    <div className="card-grid micro-drill-card-grid" aria-live="polite" aria-busy="true">
      <div className="panel micro-drill-loading-card">
        <span className="micro-drill-loading-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
          </svg>
        </span>
        <div className="micro-drill-loading-copy">
          <span className="related-problems-eyebrow">Next rep</span>
          <h3>Preparing your next drill</h3>
          <p>Keeping what worked. Isolating one decision worth another pass.</p>
        </div>
        <div className="micro-drill-loading-line" aria-hidden="true"><span /></div>
      </div>
    </div>
  ) : activeMicroDrill ? (
    <div className="card-grid micro-drill-card-grid drill-fade-in">
      <div className="panel micro-drill-question-card">
        <div className="prompt-toggle-header micro-drill-header">
          <span className="micro-drill-eyebrow">Next rep</span>

        </div>
        <div className="micro-drill-prompt">
          <MicroDrillInstructions
            text={microDrillContent.prompt || 'Fill the focused blanks without looking back at the original solution.'}
          />
        </div>
      </div>
      <div className="panel micro-drill-answer-card">
        <label className="answer-label">Fill only the blanks</label>
        <MicroDrillBlankEditor
          key={activeMicroDrill}
          template={microDrillContent.code || activeMicroDrill}
          language={microDrillContent.language}
          syntaxTheme={syntaxTheme}
          theme={theme}
        />
        <p className="typing-help">Type directly into each quiet underline · Tab moves to the next blank.</p>
      </div>
    </div>
  ) : null

  return (
    <div className={[
      'app',
      (flowDrawerOpen || (relatedDrawerOpen && relatedLeetCodeSet)) ? 'app-side-drawer-open' : '',
      zenMode ? 'app-zen-mode' : '',
    ].filter(Boolean).join(' ')}>
      {SUBMISSION_FEEDBACK_ENABLED && submissionFailureModal && (
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

  <div className={[
    'card-shell',
    relatedLeetCodeSet ? 'card-shell-has-drawer' : '',
    skeletonReference ? 'skeleton-card-shell' : '',
  ].filter(Boolean).join(' ')}>
      <section className="card" ref={cardContainerRef}>
        <div className="card-header">
          <div className="card-header-main">
            <h3>{headerCardTitle}</h3>
            {(!skeletonReference || isCoreAlgorithmCard || isMetaCard) && (
              <p className="card-badges">
                {!skeletonReference && <span>{headerCardDifficultyLabel}</span>}
                {!skeletonReference && (isCoreAlgorithmCard || isMetaCard) && <span aria-hidden="true">•</span>}
                {isCoreAlgorithmCard && <span className="card-badge-core">core</span>}
                {isMetaCard && <span className="card-badge-meta">meta</span>}
              </p>
            )}
            {visibleCardTags.length > 0 && (
              <div className={tagsExpanded ? 'tags expanded' : 'tags'}>
                <div className={tagsExpanded ? 'tags-list expanded' : 'tags-list'} id={tagsListId} aria-hidden={!tagsExpanded}>
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
            {currentPracticeMode === 'multiple-choice' ? (
              <div className="coach-metric-row card-header-metric-row">
                <span className="coach-metric-chip">
                  {isFlowActive ? 'Targeted card flow' : 'Current card'}
                </span>
                <span className="coach-metric-chip">
                  {isFlowActive ? 'Missed-line remediation' : mcqTuning.flowMode === 'progressive' ? 'Socratic chain' : 'Balanced random'}
                </span>
                <span className="coach-metric-chip">{isFlowActive ? 1 : multipleChoiceQuestionCount} questions</span>
                {(focusedPatternSlug || requestedPlaylist) && (
                  <span className="coach-metric-chip">
                    {requestedPlaylist ? 'Playlist bias' : `Focus ${focusedPatternLabel}`}
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <div className="card-header-aside">
            <div
              className="card-header-controls-panel"
              id="card-header-controls-panel"
            >
              <div className="card-header-side">
              <div className="practice-mode-control" role="group" aria-label="Practice mode">
                <button
                  type="button"
                  className={currentPracticeMode === 'recall' ? 'practice-mode-button active' : 'practice-mode-button'}
                  onClick={() => setPracticeMode('recall')}
                  aria-pressed={currentPracticeMode === 'recall'}
                  title="Recall"
                  disabled={isFlowActive}
                >
                  Recall
                </button>
                <button
                  type="button"
                  className={currentPracticeMode === 'multiple-choice' ? 'practice-mode-button active' : 'practice-mode-button'}
                  onClick={() => {
                    if (practiceMode === 'multiple-choice') return
                    setMcqSourceSpecimen({
                      cardId: card.id,
                      cardTitle: card.title,
                      algorithm: primaryPatternTag ? patternLabelFromSlug(primaryPatternTag) : card.title,
                      prompt: practicePrompt,
                      target: practiceTarget,
                      tags: card.tags,
                    })
                    setPracticeMode('multiple-choice')
                  }}
                  aria-pressed={currentPracticeMode === 'multiple-choice'}
                  title="Multiple Choice"
                  disabled={isFlowActive || skillMapLoading || filteredDeck.length === 0}
                >
                  MCQ
                </button>
              </div>
                <div className="support-layer-control" aria-label="Practice support controls">
                <button
                  type="button"
                  className={[
                    INLINE_FEEDBACK_ENABLED && inlineEnabled ? 'navbar-toggle active' : 'navbar-toggle',
                    !INLINE_FEEDBACK_ENABLED ? 'navbar-toggle-crossed' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={toggleInlineHelper}
                  aria-pressed={INLINE_FEEDBACK_ENABLED && inlineEnabled}
                  aria-label={INLINE_FEEDBACK_ENABLED ? (inlineEnabled ? 'Turn Inline off' : 'Turn Inline on') : 'Inline disabled'}
                  title={INLINE_FEEDBACK_ENABLED ? 'Inline' : 'Inline disabled'}
                  disabled={isFlowActive || currentPracticeMode !== 'recall' || !INLINE_FEEDBACK_ENABLED}
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
                  disabled={isFlowActive || currentPracticeMode !== 'recall'}
                >
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12.5V6.5a5 5 0 0 1 10 0v6l-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5Z"/>
                    <circle cx="5.5" cy="6.5" r="0.75" fill="currentColor" stroke="none"/>
                    <circle cx="8.5" cy="6.5" r="0.75" fill="currentColor" stroke="none"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className={[
                    liveFeedbackEnabled ? 'navbar-toggle active' : 'navbar-toggle',
                    !LIVE_FEEDBACK_ENABLED ? 'navbar-toggle-crossed' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={toggleLiveFeedback}
                  aria-pressed={liveFeedbackEnabled}
                  aria-label={LIVE_FEEDBACK_ENABLED ? (liveFeedbackEnabled ? 'Turn live feedback off' : 'Turn live feedback on') : 'Live feedback disabled'}
                  title={LIVE_FEEDBACK_ENABLED ? 'Live' : 'Live feedback disabled'}
                  disabled={isFlowActive || currentPracticeMode !== 'recall' || !LIVE_FEEDBACK_ENABLED}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                </button>
                </div>
              <div className="card-side-drawer-actions" aria-label="Card side controls">
                <button
                  type="button"
                  className={zenMode ? 'card-side-drawer-toggle zen-mode-toggle active' : 'card-side-drawer-toggle zen-mode-toggle'}
                  aria-pressed={zenMode}
                  aria-label={zenMode ? 'Exit Zen mode' : 'Enter Zen mode'}
                  aria-keyshortcuts={zenMode ? 'Escape' : undefined}
                  title={zenMode ? 'Exit Zen mode (Esc)' : 'Enter Zen mode'}
                  onClick={() => {
                    if (!zenMode) {
                      setFlowDrawerOpen(false)
                      setRelatedDrawerOpen(false)
                      setTagsExpanded(false)
                    }
                    setZenMode((current) => !current)
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8.25 4.5H5.625A1.125 1.125 0 0 0 4.5 5.625V8.25m11.25-3.75h2.625A1.125 1.125 0 0 1 19.5 5.625V8.25m0 7.5v2.625a1.125 1.125 0 0 1-1.125 1.125H15.75m-7.5 0H5.625A1.125 1.125 0 0 1 4.5 18.375V15.75" />
                    <circle cx="12" cy="12" r="1.5" />
                  </svg>
                  <span className="sr-only">Zen mode</span>
                </button>
                  <button
                    type="button"
                    className={submissionTuning.microDrillEnabled ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
                    aria-pressed={submissionTuning.microDrillEnabled}
                    aria-label={submissionTuning.microDrillEnabled ? 'Turn reinforcement drill off' : 'Turn reinforcement drill on'}
                    title={submissionTuning.microDrillEnabled ? 'Reinforcement drill on' : 'Reinforcement drill off'}
                    onClick={toggleMicroDrill}
                    disabled={isFlowActive || currentPracticeMode !== 'recall'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                    </svg>
                    <span className="sr-only">Reinforcement drill</span>
                  </button>
                <button
                  type="button"
                  className={flowDrawerOpen ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
                  aria-expanded={flowDrawerOpen}
                  aria-controls="card-flow-panel"
                  aria-label={flowDrawerOpen ? 'Hide Flow drawer' : 'Show Flow drawer'}
                  title="Flow"
                  onClick={() => {
                    setRelatedDrawerOpen(false)
                    setFlowDrawerOpen((open) => !open)
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  <span className="sr-only">Flow</span>
                </button>
                  <button
                    type="button"
                    className={relatedDrawerOpen ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
                    aria-expanded={relatedDrawerOpen}
                    aria-controls={relatedLeetCodeSet ? 'related-problems-drawer' : undefined}
                    aria-label={relatedDrawerOpen ? 'Hide related LeetCode drawer' : 'Show related LeetCode drawer'}
                    title={relatedLeetCodeSet ? 'Related LeetCode' : 'No related LeetCode problems for this card'}
                    disabled={!relatedLeetCodeSet}
                    onClick={() => {
                      setFlowDrawerOpen(false)
                      setRelatedDrawerOpen((open) => !open)
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                    <span className="sr-only">Related LeetCode</span>
                  </button>
                  <button
                    type="button"
                    className={tagsExpanded ? 'card-side-drawer-toggle card-tags-drawer-toggle active' : 'card-side-drawer-toggle card-tags-drawer-toggle'}
                    aria-expanded={tagsExpanded}
                    aria-controls={visibleCardTags.length > 0 ? tagsListId : undefined}
                    aria-label={tagsExpanded ? 'Hide tags' : 'Show tags'}
                    title={visibleCardTags.length ? (tagsExpanded ? 'Hide tags' : 'Show tags') : 'No tags for this card'}
                    disabled={visibleCardTags.length === 0}
                    onClick={() => setTagsExpanded((current) => !current)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                    <span className="sr-only">Tags</span>
                  </button>
              </div>
            </div>
            </div>
          </div>
        </div>

        {sessionFinished && (
          <p className="status success" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            Session complete. {correctCount} of {attempts} {currentPracticeMode === 'multiple-choice' ? 'questions were correct' : 'cards were sound'}.
          </p>
        )}
        {sessionFinished && currentPracticeMode === 'recall' && (
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

        {flowTransition && <FlowCoachTransition transition={flowTransition} />}
        <div
          className={flowTransition ? 'flow-stage-content flow-stage-content-preparing' : 'flow-stage-content'}
          aria-hidden={flowTransition ? true : undefined}
          inert={flowTransition ? true : undefined}
        >
        {isFlowActive && coachError && mainPhase === 'typing' && <p className="flow-submit-error" role="alert">{coachError}</p>}
        {practiceFlow?.stage === 'microdrill' ? (
          <FlowMicroDrillCard
            key={flowMicroDrillActionKey}
            title={card.title} prompt={practicePrompt} target={practiceTarget}
            focus={practiceFlow.focus.focusSummary} rep={practiceFlow.step + 1}
            context={flowGenerationContext}
            provider={requestLlmProvider} theme={theme} syntaxTheme={syntaxTheme}
            actionKey={flowMicroDrillActionKey}
            primaryActionRef={flowMicroDrillPrimaryActionRef}
            onPrimaryActionStateChange={setFlowMicroDrillPrimaryActionState}
            onSave={(drill, answer, elapsedMs, interactionId) => submitAttemptToServer({
              mode: 'main-recall', correctAnswer: drill.solution, userAnswer: answer, question: drill.prompt,
              microdrill: true, elapsedMs, interactionId,
              templateMode: currentTemplateMode, supportLayer: 'none', liveCoachUsed: false,
              modality: 'microdrill',
              signals: {
                modality: {
                  blankCount: drill.template.match(/_{3,}/g)?.length ?? 0,
                  language: drill.language,
                  templateLineCount: drill.template.split('\n').length,
                },
              },
            })}
          />
        ) : microDrillCardGrid ?? (
        <div className="card-grid">
          <div className="panel prompt-surface-panel">
            {currentPracticeMode === 'multiple-choice' ? (
              !hasDeck ? (
                activeLoading ? (
                  <div className="skeleton-group multiple-choice-question-loading" role="status" aria-label="Generating multiple-choice question">
                    <div className="skeleton-line w95 tall" />
                    <div className="skeleton-line w80" />
                    <div className="skeleton-line w60" />
                  </div>
                ) : (
                  <>
                    <p className="prompt prompt-bar">Multiple choice is unavailable right now.</p>
                    <p className="hint">{activeError || 'Regenerate to request another LLM question set.'}</p>
                    {isFlowActive && <button type="button" className="secondary" onClick={() => void fetchFlowMultipleChoiceDeck()}>Retry MCQ</button>}
                  </>
                )
              ) : activeMultipleChoiceCard ? (
                <div className="multiple-choice-question-panel">
                  <div className="prompt multiple-choice-question">
                    <MarkdownCodeContent
                      text={activeMultipleChoiceCard.question}
                      syntaxTheme={syntaxTheme}
                      theme={theme}
                      editorBlocks
                    />
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
                <div className={skeletonReference
                  ? 'prompt-toggle-card prompt-feedback-surface skeleton-reference-surface'
                  : 'prompt-toggle-card prompt-feedback-surface'}>
                  <div className="prompt-surface-section">
                    {!skeletonReference && (
                      <div className="prompt-toggle-header">
                        <div className="prompt-section-content">
                          <span className="prompt-section-label">Prompt</span>
                          <p className="prompt prompt-toggle-text">{practicePrompt}</p>
                        </div>

                      </div>
                    )}
                    {skeletonReference ? (
                      <section className="skeleton-reference" aria-label={`${card.title} reference`}>
                        <div className="skeleton-reference-overview">
                          <div className="skeleton-reference-fact explanation">
                            <span className="skeleton-reference-term">Explanation</span>
                            <p>{skeletonReference.explanation}</p>
                          </div>
                          <div className="skeleton-reference-spec" aria-label="Pattern specification">
                            <dl className="skeleton-reference-spec-grid">
                              <div
                                className="skeleton-reference-spec-item"
                                title="Once the pattern is recognized, how much of the implementation follows the template?"
                              >
                                <dt>Template</dt>
                                <dd><strong>{skeletonReference.templateStrength}</strong><span>/10</span></dd>
                              </div>
                              <div
                                className="skeleton-reference-spec-item"
                                title="How much reasoning is required to map a problem onto this pattern?"
                              >
                                <dt>Abstraction</dt>
                                <dd><strong>{skeletonReference.applicationAbstraction}</strong><span>/10</span></dd>
                              </div>
                              <div className="skeleton-reference-spec-item complexity">
                                <dt>Time</dt>
                                <dd>{skeletonReference.timeComplexity}</dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                        <div className="skeleton-reference-fact invariant">
                          <span className="skeleton-reference-term">Invariant</span>
                          <p>{skeletonReference.invariant}</p>
                        </div>
                      </section>
                    ) : null}
                  </div>
                  {submissionFeedbackBlock}
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            {currentPracticeMode === 'multiple-choice' ? (
              !hasDeck ? (
                activeLoading ? (
                  <div className="multiple-choice-options" role="status" aria-label="Generating answer choices">
                    {['A', 'B', 'C', 'D'].map((choice) => (
                      <div className="multiple-choice-option multiple-choice-option-loading" key={choice} aria-hidden="true">
                        <span className="multiple-choice-option-id">{choice}</span>
                        <div className="skeleton-group">
                          <div className="skeleton-line w95" />
                          <div className="skeleton-line w60" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="hint" style={{ marginTop: 0 }}>
                    {activeError || 'No multiple choice questions are available yet.'}
                  </div>
                )
              ) : activeMultipleChoiceCard ? (
                <div className="multiple-choice-card">
                  <div className="multiple-choice-options" role="radiogroup" aria-label="Answer choices">
                    {activeMultipleChoiceCard.choices.map((choice) => {
                      const isSelected = (isFlowActive ? flowMultipleChoiceSelectedChoiceId : multipleChoiceSelectedChoiceId) === choice.id
                      const isSubmittedChoice = submittedMultipleChoiceId === choice.id
                      const isCorrectChoice = activeMultipleChoiceCard.correctChoiceId === choice.id
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
                            if (!multipleChoiceSubmitted) {
                              if (isFlowActive) {
                                setFlowMultipleChoiceSelectedChoiceId(choice.id)
                                return
                              }
                              setMultipleChoiceSelectedChoiceId(choice.id)
                            }
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
                                    <MarkdownCodeContent text={activeMultipleChoiceCard.explanation} syntaxTheme={syntaxTheme} compact />
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
                                      <MarkdownCodeContent text={activeMultipleChoiceCard.explanation} syntaxTheme={syntaxTheme} compact />
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
                <div
                  className="code-container recall-editor-container"
                  ref={(node) => {
                    previewCodeContainerRef.current = node
                  }}
                >
                  <div className="typing-editor-shell">
                    <div className="recall-editor-code-wrap">
                      <div className="recall-submit-summary-slot" aria-live="polite" />
                      <RecallCodeEditor
                        value={previewEditorValue}
                        language={practiceLanguage}
                        theme={theme}
                        editable={false}
                        placeholder=""
                        lineMeta={previewEditorLineMeta}
                        intellisense={codeEditorTuning.intellisense}
                        styleGuide={codeEditorTuning.styleGuide}
                        commonPatterns={codeEditorTuning.commonPatterns}
                        foldControls={codeEditorTuning.foldControls}
                        showSearchPanel={codeEditorTuning.showSearchPanel}
                        onChange={() => {}}
                        onSubmitHotkey={startMainRecall}
                      />
                    </div>
                  </div>
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
                    <div className="recall-editor-code-wrap">
                      <div className="recall-submit-summary-slot" aria-live="polite">
                        {mainPhase === 'submitted' && latestSubmittedAttempt && (
                          <div className="recall-submit-summary">
                            <span className="recall-submit-metric">
                              <span className="recall-submit-metric-name">Outcome</span>
                              <span className="recall-submit-metric-value">{latestSubmittedAttempt.exact ? 'Sound' : 'Needs work'}</span>
                            </span>
                            <span className="recall-submit-metric">
                              <span className="recall-submit-metric-name">Time</span>
                              <span className="recall-submit-metric-value">{(latestSubmittedAttempt.elapsedMs / 1000).toFixed(1)}s</span>
                            </span>
                          </div>
                        )}
                      </div>
                      <RecallCodeEditor
                        ref={mainInputRef}
                        value={mainInput}
                        language={practiceLanguage}
                        theme={theme}
                        editable={mainPhase === 'typing'}
                        disabled={hasAnsweredCurrent || sessionFinished}
                        placeholder={mainPhase === 'typing' && (isGhostRepsEnabled || inlineEnabled) ? '' : supportedPracticePlaceholder}
                        ghostTarget={mainPhase === 'typing' && isGhostRepsEnabled ? ghostTargetCode : undefined}
                        inlineTask={currentInlineTask}
                        lineMeta={recallEditorLineMeta}
                        minHeight={recallMinHeight}
                        intellisense={codeEditorTuning.intellisense}
                        styleGuide={codeEditorTuning.styleGuide}
                        commonPatterns={codeEditorTuning.commonPatterns}
                        foldControls={codeEditorTuning.foldControls}
                        showSearchPanel={codeEditorTuning.showSearchPanel}
                        onChange={handleMainInputChange}
                        onSubmitHotkey={handleRecallEditorSubmitHotkey}
                        onEnterKey={handleGhostRepEnterKey}
                      />
                    </div>
                  </div>
                </div>
                <p className="typing-help">
                  {isGhostRepsEnabled
                    ? <>Ghost Reps are saved as supported work · trace the faint target as many times as needed · <kbd>{primaryRecallHotkey}</kbd> to log{!isFlowActive && <> · <kbd>{moveCardsHotkey}</kbd> to move cards</>}</>
                    : <><kbd>{indentOutdentHotkey}</kbd> adjusts indentation · Enter auto-indents · <kbd>{primaryRecallHotkey}</kbd> to submit{!isFlowActive && <> · <kbd>{moveCardsHotkey}</kbd> to move cards</>}</>}
                </p>
              </>
            )}
          </div>

        </div>
        )}
        </div>

        {!flowTransition && <div className="card-control-bar">
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
            <button
              className="secondary card-control-button"
              onClick={restartSession}
              aria-label={skeletonReference ? 'Restart static session' : 'Regenerate session'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span>{skeletonReference ? 'Restart' : 'Regenerate'}</span>
            </button>
          </div>

          {primaryCardAction && !(flowDrawerOpen && primaryCardAction.label === 'Start') && (
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
        </div>}
      </section>
      <aside
        id="card-flow-panel"
        className={flowDrawerOpen ? 'card-flow-panel card-flow-panel-open' : 'card-flow-panel'}
        aria-label="Flow"
        aria-hidden={!flowDrawerOpen}
        inert={!flowDrawerOpen}
        style={cardFlowPanelStyle}
      >
        <div className="related-problems-header">
          <div>
            <span className="related-problems-eyebrow">Flow</span>
            <h3>Flow</h3>
            <p>{practiceFlow ? `${practiceFlow.config.mode === 'adaptive' ? `Adaptive · ${flowMastery.proficiency}%` : practiceFlow.config.mode === 'random' ? 'Random flow' : `Cycle ${practiceFlow.cycle}`} on ${practiceFlow.anchorTitle}` : card.title}</p>
          </div>
          <button type="button" className="related-problems-close" onClick={() => setFlowDrawerOpen(false)} aria-label="Close Flow drawer">
            Close
          </button>
        </div>
        <div className="related-problems-body card-flow-body">
          <div className="card-flow-header-row">
            <span className="card-flow-kicker">Status</span>
            <button
              type="button"
              className="card-control-button card-flow-action"
              onClick={practiceFlow ? stopPracticeFlow : startPracticeFlow}
              disabled={!practiceFlow && (!hasRecallDeck || sessionFinished || flowHistoryLoading)}
            >
              {practiceFlow ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6.75 6.75h10.5v10.5H6.75z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5.25 4.5 18.75 12 5.25 19.5V4.5Z" />
                </svg>
              )}
              <span>{practiceFlow ? 'Stop flow' : 'Start flow'}</span>
            </button>
          </div>
          <p className="card-flow-anchor">{practiceFlow?.anchorTitle ?? card.title}</p>
          <FlowBuilder config={flowConfig} disabled={isFlowActive} onChange={(config) => { setFlowConfig(config); saveFlowConfig(config) }} />
          <p className="card-flow-status">{flowStatusText}</p>
          {flowHistoryError && <p className="card-flow-summary" role="status">{flowHistoryError}</p>}
          {practiceFlow?.focus.focusSummary && (
            <p className="card-flow-summary">{practiceFlow.focus.focusSummary}</p>
          )}
          {flowFocusPreviewLines.length > 0 && (
            <div className="card-flow-focus-list" aria-label="Targeted lines">
              {flowFocusPreviewLines.map((line) => (
                <span key={`${line.lineNumber}-${line.status}-${line.expected}`} className="card-flow-focus-chip">
                  L{line.lineNumber} {summarizeFlowFocusLine(line)}
                </span>
              ))}
            </div>
          )}
        </div>
      </aside>
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
