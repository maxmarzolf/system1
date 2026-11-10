import type { FlowStage } from '../flow/practiceFlow'
import type { PracticeMode, SupportLayer } from './types'

/** The question types Cmd/Ctrl + ↑↑ / ↓↓ step through, top (↑) to bottom (↓). */
export const QUESTION_TYPES = ['mcq', 'recall', 'ghost'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = { mcq: 'MCQ', recall: 'Recall', ghost: 'Ghost' }
const FLOW_STAGE_LABELS: Record<FlowStage, string> = {
  recall: 'Recall', ghost: 'Ghost', 'multiple-choice': 'MCQ', microdrill: 'Microdrill',
}

export const questionTypeOf = (mode: PracticeMode, supportLayer: SupportLayer): QuestionType =>
  mode === 'multiple-choice' ? 'mcq' : supportLayer === 'ghost-reps' ? 'ghost' : 'recall'

/** What the navbar shows: the flow's stage while a flow runs, otherwise the question type. */
export const questionTypeLabel = (type: QuestionType, flowStage: FlowStage | null) =>
  flowStage ? FLOW_STAGE_LABELS[flowStage] : QUESTION_TYPE_LABELS[type]

/** The question type one step up (↑) or down (↓) the list, or null at either end. */
export const stepQuestionType = (type: QuestionType, direction: 'up' | 'down'): QuestionType | null =>
  QUESTION_TYPES[QUESTION_TYPES.indexOf(type) + (direction === 'up' ? -1 : 1)] ?? null
