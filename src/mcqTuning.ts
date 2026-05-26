export type McqSourceMode = 'algorithm' | 'card'
export type McqFlowMode = 'random' | 'progressive'

export type McqTuning = {
  sourceMode: McqSourceMode
  flowMode: McqFlowMode
  questionCount: number
}

export const MCQ_TUNING_STORAGE_KEY = 'system1-mcq-tuning-v1'
export const MCQ_MIN_QUESTION_COUNT = 1
export const MCQ_MAX_QUESTION_COUNT = 30
export const MCQ_DEFAULT_QUESTION_COUNT = 5

export const defaultMcqTuning: McqTuning = {
  sourceMode: 'algorithm',
  flowMode: 'random',
  questionCount: MCQ_DEFAULT_QUESTION_COUNT,
}

const MCQ_SOURCE_MODES: readonly McqSourceMode[] = ['algorithm', 'card']
const MCQ_FLOW_MODES: readonly McqFlowMode[] = ['random', 'progressive']

const isMcqSourceMode = (value: unknown): value is McqSourceMode =>
  typeof value === 'string' && MCQ_SOURCE_MODES.includes(value as McqSourceMode)

const isMcqFlowMode = (value: unknown): value is McqFlowMode =>
  typeof value === 'string' && MCQ_FLOW_MODES.includes(value as McqFlowMode)

export const clampMcqQuestionCount = (count: number) =>
  Math.min(MCQ_MAX_QUESTION_COUNT, Math.max(MCQ_MIN_QUESTION_COUNT, count))

const normalizeMcqQuestionCount = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultMcqTuning.questionCount
  return clampMcqQuestionCount(Math.round(value))
}

export const loadStoredMcqTuning = (): McqTuning => {
  if (typeof window === 'undefined') return defaultMcqTuning

  try {
    const raw = window.localStorage.getItem(MCQ_TUNING_STORAGE_KEY)
    if (!raw) return defaultMcqTuning

    const parsed = JSON.parse(raw) as Partial<McqTuning>
    return {
      ...defaultMcqTuning,
      ...parsed,
      sourceMode: isMcqSourceMode(parsed.sourceMode) ? parsed.sourceMode : defaultMcqTuning.sourceMode,
      flowMode: isMcqFlowMode(parsed.flowMode) ? parsed.flowMode : defaultMcqTuning.flowMode,
      questionCount: normalizeMcqQuestionCount(parsed.questionCount),
    }
  } catch {
    return defaultMcqTuning
  }
}

export const saveStoredMcqTuning = (tuning: McqTuning) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    MCQ_TUNING_STORAGE_KEY,
    JSON.stringify({
      ...tuning,
      questionCount: normalizeMcqQuestionCount(tuning.questionCount),
    }),
  )
}
