import type { DraftCardContext, ModalityDraft } from '@/features/practice/submission/submission'
import type { AttemptPayload } from '@/features/practice/lib/types'

/** A Total Recall or Ghost answer, from what the recall attempt collected. */
export const recallDraft = (payload: AttemptPayload, context: DraftCardContext & { question: string }): ModalityDraft => ({
  modality: payload.modality,
  card: context.card,
  question: payload.question ?? context.question,
  questionType: context.questionType,
  categoryTags: context.categoryTags,
  answer: payload.userAnswer,
  reference: payload.correctAnswer,
  elapsedMs: payload.elapsedMs,
  interactionId: payload.interactionId,
  sessionId: payload.sessionId,
  supportLayer: payload.supportLayer,
  liveCoachUsed: payload.liveCoachUsed,
  modalitySignals: payload.signals?.modality,
})
