import type { DraftCardContext, ModalityDraft } from '@/features/practice/submission/submission'
import type { FlowMicroDrill } from '@/features/practice/lib/types'

/** A microdrill answer: the filled template, graded against the stored drill. */
export const microdrillDraft = (
  drill: FlowMicroDrill,
  answer: string,
  timing: { elapsedMs: number; interactionId: string },
  context: DraftCardContext,
): ModalityDraft => ({
  modality: 'microdrill',
  card: context.card,
  question: drill.prompt,
  questionType: `${context.questionType}:microdrill`,
  categoryTags: context.categoryTags,
  answer,
  reference: drill.solution,
  ...timing,
  exerciseId: drill.id,
  supportLayer: 'none',
  modalitySignals: {
    blankCount: drill.template.match(/_{3,}/g)?.length ?? 0,
    language: drill.language,
    templateLineCount: drill.template.split('\n').length,
  },
})
