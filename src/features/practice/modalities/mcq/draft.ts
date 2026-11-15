import type { ModalityDraft } from '@/features/practice/submission/submission'
import type { MultipleChoiceCard } from '@/features/practice/lib/types'

/** An MCQ answer: the chosen option of the stored question (the server holds the answer key). */
export const mcqDraft = (
  card: MultipleChoiceCard,
  choiceId: string,
  timing: { elapsedMs: number; interactionId: string },
  naming: { questionType: string; categoryTags: string[] },
): ModalityDraft => ({
  modality: 'mcq',
  card,
  question: card.question,
  questionType: naming.questionType,
  categoryTags: naming.categoryTags,
  answer: choiceId,
  ...timing,
  multipleChoiceProblemId: card.id,
  modalitySignals: { selectedChoiceId: choiceId },
})
