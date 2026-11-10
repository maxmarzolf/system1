import type { FlowConfig, FlowGenerationContext, FlowStage, SubmissionModality } from '../flow/practiceFlow'
import type { SkillMapNode } from '@/shared/data/skill-map'
import type { SpecimenTuning } from '@/shared/settings/specimenTuning'
import type { McqFlowMode, McqSourceMode } from '@/shared/settings/mcqTuning'

export type Flashcard = {
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
    summary: string
    explanation: string
  } | null
}

export type PracticeMode = 'recall' | 'multiple-choice'
export type MultipleChoiceDifficulty = 'Med.' | 'Hard'

export type MultipleChoiceChoice = {
  id: string
  text: string
}

export type MultipleChoiceCard = {
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

export type MultipleChoiceSpecimenFocusLine = {
  lineNumber: number
  expected: string
  actual: string
  status: 'mismatch' | 'missing' | 'extra'
}

export type MultipleChoiceSpecimenFocus = {
  sequenceStage: 'recall' | 'ghost' | 'multiple-choice'
  focusSummary: string
  missedLines: MultipleChoiceSpecimenFocusLine[]
  phase?: FlowGenerationContext['phase']
  proficiency?: number
  weaknessSummary?: string
  recentAttempts?: FlowGenerationContext['recentAttempts']
}

export type PracticeFlowState = {
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

export type PracticeFlowTransitionState = {
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

export const FLOW_TRANSITION_MINIMUM_MS = 700
export const FLOW_TRANSITION_SETTLE_MS = 280
export const INLINE_FEEDBACK_ENABLED = true
/** Standalone MCQ sets are medium; a flow asks for hard questions once it reaches its challenge phase. */
export const MULTIPLE_CHOICE_DIFFICULTY: MultipleChoiceDifficulty = 'Med.'

export const emptySkillMapCard: Flashcard = {
  id: 'skill-map-loading',
  title: 'Skill Map Card',
  difficulty: 'Easy',
  prompt: 'Generate a fresh skill-map practice deck from the layered map.',
  solution: 'def solve():\n    {{missing}}',
  missing: 'pass',
  hint: '',
  tags: ['skill-map'],
}

export type TemplateMode = 'algorithm'
export type HelperLayer = 'inline'
export type CoreShapeLayer = 'coreShape'
export type RecallTargetMode = TemplateMode | CoreShapeLayer
export type SupportLayer = 'none' | 'ghost-reps'
export type InlineLens = 'pattern' | 'plainEnglish' | 'why' | 'transfer' | 'debug'

export type AttemptRequestSignals = {
  flow?: Record<string, unknown>
  modality?: Record<string, unknown>
}

export type AttemptPayload = {
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
  outsideFlow?: boolean
}

export type CoachAttemptFeedback = {
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

export type SubmissionEvaluation = {
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

export type SubmissionSaveResponse = {
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

export type FlowHistoryEntry = {
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

export type FlowHistoryResponse = { entries: FlowHistoryEntry[] }

export type SubmissionFailureModalState = {
  providerLabel: string
  message: string
}

export type CoachSessionPlan = {
  headline: string
  focusTheme: string
  warmup: string
  mainSet: string
  cooldown: string
  note: string
  llmUsed: boolean
}

export type SkillMapDrillsResponse = {
  drills: Flashcard[]
  llmUsed: boolean
}

export type MultipleChoiceDrillsResponse = {
  drills: MultipleChoiceCard[]
  llmUsed: boolean
}

export type SkillMapDrillsRequest = {
  questionType: string
  count: number
  skillMap: SkillMapNode[]
  templateMode: TemplateMode
  templateTargets: Record<string, Partial<Record<TemplateMode | HelperLayer | CoreShapeLayer, string>>>
  specimenTuning: SpecimenTuning
  llmProvider: string
}

export type MultipleChoiceDrillsRequest = {
  questionType: string
  count: number
  skillMap: SkillMapNode[]
  difficulty: MultipleChoiceDifficulty
  sourceMode: McqSourceMode
  flowMode: McqFlowMode
  specimen?: MultipleChoiceSpecimenContext
  llmProvider: string
}

export type MultipleChoiceSpecimenContext = {
  cardId: string
  cardTitle: string
  algorithm: string
  prompt: string
  target: string
  tags: string[]
  focus?: MultipleChoiceSpecimenFocus
}

export type PlainEnglishPromptDetail = {
  plainEnglish: string
  interviewQuestion: string
  inputExample: string
  outputExample: string
  explanation: string
  brassTacks: string
  leetcodeExamples: string[]
}

export type LineReviewStatus = 'match' | 'mismatch' | 'missing' | 'extra'

export type LineReview = {
  lineNumber: number
  status: LineReviewStatus
  expected: string
  actual: string
}

export type AnnotatedDisplayLine = {
  text: string
  sourceLineNumber: number | null
}

export type RecallAttemptSnapshot = {
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

export type LlmProvider = 'openai' | 'claude' | 'gemma'
export type LlmProviderSelection = 'auto' | LlmProvider

/**
 * Deck loaders. `fetchQuery` with `staleTime: 0` always asks the server, but concurrent calls
 * with the same key share one request (a deck can be requested by several effects at once).
 */

export type FlowMicroDrill = { prompt: string; template: string; solution: string; language: string }

export type FlowMicroDrillPrimaryActionState = {
  interactionKey: string
  ready: boolean
  failed: boolean
  complete: boolean
  saving: boolean
  submitted: boolean
}

export const EMPTY_FLOW_MICRODRILL_ACTION_STATE: FlowMicroDrillPrimaryActionState = {
  interactionKey: '',
  ready: false,
  failed: false,
  complete: false,
  saving: false,
  submitted: false,
}
