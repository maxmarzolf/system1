import { type CSSProperties, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSearchParams } from 'react-router-dom'
import RelatedLeetCodeDrawer from './RelatedLeetCodeDrawer'
import { skillMap, type SkillMapNode } from './data/skill-map'
import { resolveRelatedLeetCodeSet } from './data/related-leetcode'
import { getLiveCoachFrequencyProfile, loadStoredLiveCoachTuning, saveStoredLiveCoachTuning } from './liveCoachTuning'
import { loadStoredSubmissionTuning } from './submissionTuning'
import TopNav from './TopNav'
import { useTheme } from './theme'

type Flashcard = {
  id: string
  title: string
  difficulty: 'Easy' | 'Med.' | 'Hard'
  prompt: string
  templatePrompts?: Partial<Record<TemplateMode | 'inline', string>>
  templateTargets?: Partial<Record<TemplateMode | 'inline', string>>
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

type TemplateMode = 'algorithm'
type HelperLayer = 'inline'
type SupportLayer = 'none' | 'ghost-reps'

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
  templateTargets: Record<string, Partial<Record<TemplateMode | HelperLayer, string>>>
  llmProvider: LlmProvider
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

const inlineDecisionNoteForPattern = (patternTag: string) => {
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

const inlineNoteForLine = (trimmedLine: string, patternTag: string) => {
  if (/^return\b/.test(trimmedLine)) {
    if (/max\(take,\s*skip\)/.test(trimmedLine)) return 'best of final choices'
    if (/return\s+0\b/.test(trimmedLine)) return 'nothing to choose'
    return 'return final answer'
  }
  if (/^while\b/.test(trimmedLine)) {
    if (/invalid|breaks_decision_rule|left\s*<\s*right|<=|queue|stack/.test(trimmedLine)) {
      return 'restore rule before continuing'
    }
    return 'repeat until state settles'
  }
  if (/^(def|for|if|elif|else)\b/.test(trimmedLine)) return ''
  if (patternTag === 'dynamic-programming' || patternTag === 'dp') {
    if (/^take\s*=\s*0\b/.test(trimmedLine)) return 'best if previous was taken'
    if (/^skip\s*=\s*0\b/.test(trimmedLine)) return 'best if previous was skipped'
    if (/take\s*,\s*skip\s*=/.test(trimmedLine)) return 'take x or skip x'
    if (/dp\[/.test(trimmedLine) || /transition/.test(trimmedLine)) return 'build from solved states'
  }
  if (patternTag === 'heap' && /heappush/.test(trimmedLine)) return 'include new candidate'
  if (patternTag === 'heap' && /heappop/.test(trimmedLine)) return 'drop smallest kept item'
  if ((patternTag === 'binary-search') && /mid\s*=/.test(trimmedLine)) return 'probe middle boundary'
  if ((patternTag === 'binary-search') && /left\s*=\s*mid/.test(trimmedLine)) return 'discard lower half'
  if ((patternTag === 'binary-search') && /right\s*=\s*mid/.test(trimmedLine)) return 'keep possible boundary'
  if (/\+=|-=|\*=|\/=|=/.test(trimmedLine)) return 'update state for next decision'
  if (/append|push|pop|add|remove|union|find/.test(trimmedLine)) return 'move through core step'
  if (trimmedLine.startsWith('#')) return ''
  if (patternTag === 'union-find' && /^parent\b|^rank\b/.test(trimmedLine)) return 'self-label before merging'
  return ''
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

const appendInlineNote = (line: string, patternTag: string) => {
  if (hasAlignedInlineNote(line)) {
    const parts = splitInlineAnnotationLine(line)
    if (!parts.note) return line.trimEnd()
    const cleanedNote = removeDuplicateInlineNotes(parts.note)
    if (INLINE_GENERIC_NOTES.some((note) => note.toLowerCase() === cleanedNote.toLowerCase())) {
      if (!parts.code.trim()) return appendAlignedNote('', inlineDecisionNoteForPattern(patternTag))
      const comment = inlineNoteForLine(parts.code.trim(), patternTag)
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
  const comment = inlineNoteForLine(trimmedLine, patternTag)
  return appendAlignedNote(cleanedLine, comment)
}

const shouldPlaceInlineDecisionNoteAfter = (line: string, insideLoop: boolean) => {
  if (!insideLoop) return false
  const codePart = line.split('#', 1)[0].trim()
  if (!codePart) return false
  if (/^(def|for|while|if|elif|else|return)\b/.test(codePart)) return false
  return /\b(heappush|append|add|push|union|find|pop|popleft|transition)\b/.test(codePart) || /[+\-*/]?=/.test(codePart)
}

const buildInlineTemplate = (patternTag: string, algorithmTarget: string) => {
  const lines = normalizeTyping(algorithmTarget).split('\n')
  const output: string[] = []
  let inlineDecisionInserted = false
  let insideLoop = false

  lines.forEach((line) => {
    if (/^\s*(for|while)\b/.test(line)) {
      insideLoop = true
    }
    const nextLine = appendInlineNote(line, patternTag)
    output.push(nextLine)
    if (isInlineDecisionLine(nextLine)) {
      inlineDecisionInserted = true
    }
    if (!inlineDecisionInserted && shouldPlaceInlineDecisionNoteAfter(line, insideLoop)) {
      output.push(appendAlignedNote('', inlineDecisionNoteForPattern(patternTag)))
      inlineDecisionInserted = true
    }
  })

  if (!inlineDecisionInserted) {
    const defIndex = lines.findIndex((line) => /^\s*def\s+/.test(line))
    if (defIndex >= 0) {
      output.splice(defIndex + 1, 0, appendAlignedNote('', inlineDecisionNoteForPattern(patternTag)))
    } else {
      output.unshift(appendAlignedNote('', inlineDecisionNoteForPattern(patternTag)))
    }
  }

  return output.join('\n')
}

const normalizeInlineTemplateTarget = (rawTarget: string, patternTag: string) => {
  const lines = normalizeTyping(rawTarget).split('\n')
  const output = lines.map((line) => appendInlineNote(line, patternTag))
  if (output.some((line) => isInlineDecisionLine(line))) {
    return output.join('\n')
  }

  let insideLoop = false
  const inlineDecisionIndex = lines.findIndex((line) => {
    if (/^\s*(for|while)\b/.test(line)) {
      insideLoop = true
      return false
    }
    return shouldPlaceInlineDecisionNoteAfter(line, insideLoop)
  })
  if (inlineDecisionIndex >= 0) {
    output.splice(inlineDecisionIndex + 1, 0, appendAlignedNote('', inlineDecisionNoteForPattern(patternTag)))
  } else {
    const defIndex = lines.findIndex((line) => /^\s*def\s+/.test(line))
    if (defIndex >= 0) {
      output.splice(defIndex + 1, 0, appendAlignedNote('', inlineDecisionNoteForPattern(patternTag)))
    } else {
      output.unshift(appendAlignedNote('', inlineDecisionNoteForPattern(patternTag)))
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
  return /\b(window|answer|state|frontier|path|heap|roots|merged|seen|stack|take|skip)\b/i.test(note)
}

const stripInlineAnnotationNotes = (code: string) =>
  code
    .split('\n')
    .map((line) => splitInlineAnnotationLine(line).code)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()

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
  const lines = code.split('\n')
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
        {lines.map((line, index) => {
          const parts = splitInlineAnnotationLine(line)
          const className = lineClassName?.(line, index + 1) ?? 'typing-highlight-line'
          return (
            <span key={`${index}-${line}`} className={className}>
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
  const [flowMode, setFlowMode] = useState<FlowMode>('sequential')
  const [adaptiveVariationLoading, setAdaptiveVariationLoading] = useState(false)
  const [adaptiveVariationError, setAdaptiveVariationError] = useState('')
  const [adaptiveVariationNote, setAdaptiveVariationNote] = useState('')
  const [sequentialVariationLoading, setSequentialVariationLoading] = useState(false)
  const [sequentialVariationError, setSequentialVariationError] = useState('')
  const [sequentialVariationNote, setSequentialVariationNote] = useState('')
  const [inlineEnabled, setInlineEnabled] = useState(false)
  const [relatedDrawerOpen, setRelatedDrawerOpen] = useState(false)

  const [sessionOrder, setSessionOrder] = useState<number[]>([])
  const [sessionPosition, setSessionPosition] = useState(0)
  const [sessionFinished, setSessionFinished] = useState(false)
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
  const mainHighlightRef = useRef<HTMLDivElement | null>(null)
  const mainGhostRef = useRef<HTMLDivElement | null>(null)
  const previewCodeContainerRef = useRef<HTMLDivElement | null>(null)
  const [recallMinHeight, setRecallMinHeight] = useState<number | undefined>(undefined)
  const mainGutterRef = useRef<HTMLDivElement | null>(null)
  const llmProviderMenuRef = useRef<HTMLDivElement | null>(null)
  const currentCardIdRef = useRef('')
  const liveCoachRequestVersionRef = useRef(0)
  const liveCoachSnapshotRef = useRef<LiveCoachSnapshot | null>(null)
  const lastLiveCoachDecisionKeyRef = useRef('')
  const lastMainInputEditAtRef = useRef(0)
  const coachRequestVersionRef = useRef(0)
  const skillMapDeckRequestVersionRef = useRef(0)
  const adaptiveVariationRequestKeyRef = useRef('')
  const sequentialVariationRequestKeyRef = useRef('')
  const focusedPatternSlug = searchParams.get('focusPattern')?.trim() || ''
  const focusedModeParam = searchParams.get('focusMode')?.trim() || ''
  const focusedMethodParams = searchParams.getAll('focusMethod').map((method) => method.trim()).filter(Boolean)
  const focusedMethodSignature = focusedMethodParams.join('\u0000')
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
      targets[patternSlug] = {}
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
  const algorithmPracticeTarget = useMemo(() => {
    const generatedTarget = card.templateTargets?.algorithm?.trim()
    if (generatedTarget) {
      const resolvedTarget = generatedTarget.replace('{{missing}}', card.missing)
      return normalizeTyping(resolvedTarget)
    }
    return fullSolutionTarget
  }, [card.missing, card.templateTargets, fullSolutionTarget])
  const inlinePracticeTarget = useMemo(() => {
    const generatedTarget = card.templateTargets?.inline?.trim()
    if (generatedTarget) {
      return normalizeInlineTemplateTarget(generatedTarget.replace('{{missing}}', card.missing), primaryPatternTag)
    }
    return normalizeTyping(buildInlineTemplate(primaryPatternTag, algorithmPracticeTarget))
  }, [algorithmPracticeTarget, card.missing, card.templateTargets, primaryPatternTag])
  const practiceTarget = inlineEnabled ? inlinePracticeTarget : algorithmPracticeTarget
  const generatedPracticePrompt = card.templatePrompts?.algorithm?.trim() || card.prompt.trim()
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
  const practiceLanguage = 'python'
  const shouldHighlightInlineDecision = inlineEnabled
  const practiceInputLabel = inlineEnabled
    ? 'Type the algorithm with inline notes from memory'
    : 'Type the full algorithm from memory'
  const supportedPracticeInputLabel = isGhostRepsEnabled
    ? `${practiceInputLabel} with Ghost Reps`
    : practiceInputLabel
  const practicePlaceholder = inlineEnabled
    ? 'Type the algorithm, decisions, and explanatory notes from memory...'
    : 'Type the full algorithm from memory...'
  const supportedPracticePlaceholder = isGhostRepsEnabled
    ? `Trace the faint ${inlineEnabled ? 'inline' : currentTemplateLabel.toLowerCase()} target here...`
    : practicePlaceholder
  const startRecallLabel = inlineEnabled ? 'Hide inline solution and start recall' : 'Start'
  const supportedStartRecallLabel = isGhostRepsEnabled
    ? `Start Ghost Reps for ${inlineEnabled ? 'Inline' : currentTemplateLabel}`
    : startRecallLabel
  const templateProgressText = `Mode: ${currentTemplateLabel}${inlineEnabled ? ' · Inline helper on' : ''}`
  const queuedFlowLoading = flowMode === 'adaptive' ? adaptiveVariationLoading : sequentialVariationLoading
  const queuedFlowNote = flowMode === 'adaptive' ? adaptiveVariationNote : sequentialVariationNote
  const queuedFlowError = flowMode === 'adaptive' ? adaptiveVariationError : sequentialVariationError
  const queuedFlowLoadingMessage =
    flowMode === 'adaptive'
      ? 'Building a targeted repair variation...'
      : 'Building the next sequential step...'
  const relatedLeetCodeSet = useMemo(
    () => resolveRelatedLeetCodeSet({
      patternTag: primaryPatternTag,
      title: card.title,
      prompt: practicePrompt,
      target: practiceTarget,
      tags: card.tags,
      focusedMethods: focusedMethodParams,
    }),
    [card.tags, card.title, focusedMethodParams, practicePrompt, practiceTarget, primaryPatternTag]
  )

  useEffect(() => {
    setRelatedDrawerOpen(false)
  }, [card.id, currentTemplateMode, relatedLeetCodeSet?.heading])

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
          llmProvider,
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
          llmProvider,
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

  const handleFlowModeChange = (nextFlowMode: FlowMode) => {
    if (flowMode === nextFlowMode) return
    clearQueuedFlowState()
    setFlowMode(nextFlowMode)
  }

  const resetPerCardInteraction = () => {
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

  useEffect(() => {
    resetPerCardInteraction()
  }, [card.id, sessionPosition])

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
  const primaryCardAction = (() => {
    if (!hasDeck) return null

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
        label: isGhostRepsEnabled ? 'Log ghost rep' : `Submit ${inlineEnabled ? 'inline' : currentTemplateLabel.toLowerCase()}`,
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
      if (event.key === 'i' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setInlineEnabled((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
    ? `${inlineEnabled ? 'Inline helper' : currentTemplateLabel} recall recorded.`
    : latestSubmittedWasGhostRep
      ? `Ghost rep logged for ${inlineEnabled ? 'Inline' : currentTemplateLabel}. Repeat it until the shape starts to stick.`
    : `This recall attempt is not sound yet. Revise the logic and submit again.`
  const showSubmittedLineReview = mainPhase === 'submitted' && !mainCloseEnough

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
        sessionCounterLoading={skillMapLoading}
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
            <div className="flow-mode-control" role="group" aria-label="Next question flow mode">
              <button
                type="button"
                className={flowMode === 'sequential' ? 'flow-mode-button active' : 'flow-mode-button'}
                onClick={() => handleFlowModeChange('sequential')}
                aria-pressed={flowMode === 'sequential'}
                title="Sequential flow"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.25 8.25 21 12m0 0-3.75 3.75M21 12H3" />
                </svg>
              </button>
              <button
                type="button"
                className={flowMode === 'adaptive' ? 'flow-mode-button active' : 'flow-mode-button'}
                onClick={() => handleFlowModeChange('adaptive')}
                aria-pressed={flowMode === 'adaptive'}
                title="Adaptive flow"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                </svg>
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
            {!hasDeck ? (
              skillMapLoading ? (
                <div className="skeleton-group">
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w80" />
                  <div className="skeleton-line w60" />
                </div>
              ) : (
                <>
                  <p className="prompt prompt-bar">The skill-map deck is unavailable right now.</p>
                  <p className="hint">{skillMapError || 'Try restarting the session to request another generated deck.'}</p>
                </>
              )
            ) : (
              <div className="drill-fade-in">
                <p className="prompt prompt-bar">{practicePrompt}</p>
              </div>
            )}
          </div>

          <div className="panel">
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
                <div className="code-container recall-editor-container" style={recallMinHeight ? { minHeight: recallMinHeight } : undefined}>
                  <div className="typing-editor-shell">
                    <div className="typing-editor no-gutter">
                      <div className="typing-code-area">
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
                    ? <>Ghost Reps are saved as supported work · trace the faint target as many times as needed · <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to log</>
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
