import { MODALITY_LABELS, type Modality } from '@/shared/modality'
import { FLOW_LABELS, type FlowStage } from '../flow/practiceFlow'
import type { PracticeMode, SupportLayer } from './types'

export type QuestionType = 'mcq' | 'recall' | 'ghost'

const QUESTION_TYPE_MODALITY: Record<QuestionType, Modality> = { mcq: 'mcq', recall: 'total-recall', ghost: 'ghost-rep' }

export const questionTypeOf = (mode: PracticeMode, supportLayer: SupportLayer): QuestionType =>
  mode === 'multiple-choice' ? 'mcq' : supportLayer === 'ghost-reps' ? 'ghost' : 'recall'

/** What the navbar shows: the flow's stage while a flow runs, otherwise the question type. */
export const questionTypeLabel = (type: QuestionType, flowStage: FlowStage | null) =>
  flowStage ? FLOW_LABELS[flowStage] : MODALITY_LABELS[QUESTION_TYPE_MODALITY[type]]
