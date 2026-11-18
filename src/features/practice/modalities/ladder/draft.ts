import type { DraftCardContext, ModalityDraft } from '@/features/practice/submission/submission'
import type { LadderQuestion } from './WindowLadderPanel'
import type { SlidingWindowTechnique } from './windowLadderPlan'

/**
 * A Ladder rung answer, graded against the stored rung. The Ladder runs outside a flow, so it is
 * filed under the card's own tags.
 */
export const ladderDraft = (
  question: LadderQuestion,
  answer: string,
  timing: { elapsedMs: number; interactionId: string },
  rung: { technique: SlidingWindowTechnique; rungIndex: number; rep: number },
  context: Omit<DraftCardContext, 'categoryTags'>,
): ModalityDraft => ({
  modality: 'ladder',
  card: context.card,
  question: question.question,
  questionType: `${context.questionType}:microdrill`,
  categoryTags: context.card.tags,
  answer,
  reference: question.solution,
  ...timing,
  exerciseId: question.id,
  supportLayer: 'none',
  modalitySignals: { ladder: true, ...rung, language: 'python' },
})
