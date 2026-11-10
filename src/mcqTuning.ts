import { storedSetting } from './storedSetting'

export type McqSourceMode = 'algorithm' | 'skill-map' | 'card'
export type McqFlowMode = 'random' | 'progressive'

export type McqTuning = {
  flowMode: McqFlowMode
  questionCount: number
}

export const MCQ_TUNING_STORAGE_KEY = 'system1-mcq-tuning-v1'
export const MCQ_MIN_QUESTION_COUNT = 1
export const MCQ_MAX_QUESTION_COUNT = 30
export const MCQ_DEFAULT_QUESTION_COUNT = 5

export const defaultMcqTuning: McqTuning = {
  flowMode: 'random',
  questionCount: MCQ_DEFAULT_QUESTION_COUNT,
}

const MCQ_FLOW_MODES: readonly McqFlowMode[] = ['random', 'progressive']

const isMcqFlowMode = (value: unknown): value is McqFlowMode =>
  typeof value === 'string' && MCQ_FLOW_MODES.includes(value as McqFlowMode)

export const clampMcqQuestionCount = (count: number) =>
  Math.min(MCQ_MAX_QUESTION_COUNT, Math.max(MCQ_MIN_QUESTION_COUNT, count))

const normalizeMcqQuestionCount = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultMcqTuning.questionCount
  return clampMcqQuestionCount(Math.round(value))
}

export const mcqTuningSetting = storedSetting<McqTuning>(
  MCQ_TUNING_STORAGE_KEY,
  defaultMcqTuning,
  (parsed) => ({
    ...defaultMcqTuning,
    flowMode: isMcqFlowMode(parsed.flowMode) ? parsed.flowMode : defaultMcqTuning.flowMode,
    questionCount: normalizeMcqQuestionCount(parsed.questionCount),
  }),
  (tuning) => ({ ...tuning, questionCount: normalizeMcqQuestionCount(tuning.questionCount) }),
)

export const loadStoredMcqTuning = mcqTuningSetting.load
export const saveStoredMcqTuning = mcqTuningSetting.save
