import type { FlowStage } from '../flow/practiceFlow'
import type { PracticeMode, SupportLayer } from './types'

export type QuestionType = 'mcq' | 'recall' | 'ghost'

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = { mcq: 'MCQ', recall: 'Total Recall', ghost: 'Ghost' }
const FLOW_STAGE_LABELS: Record<FlowStage, string> = {
  recall: 'Total Recall', ghost: 'Ghost', 'multiple-choice': 'MCQ', microdrill: 'Microdrill',
}

export const questionTypeOf = (mode: PracticeMode, supportLayer: SupportLayer): QuestionType =>
  mode === 'multiple-choice' ? 'mcq' : supportLayer === 'ghost-reps' ? 'ghost' : 'recall'

/** What the navbar shows: the flow's stage while a flow runs, otherwise the question type. */
export const questionTypeLabel = (type: QuestionType, flowStage: FlowStage | null) =>
  flowStage ? FLOW_STAGE_LABELS[flowStage] : QUESTION_TYPE_LABELS[type]
