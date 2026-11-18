/**
 * The one way the practice screen submits an answer, whatever the modality:
 *
 *   draft (what was answered) → buildAttemptBody → POST /api/attempts → graded result
 *
 * A modality only describes its answer as a :type:`SubmissionDraft`; the body shape, the
 * interaction ids and the error wording are the same for all of them. The server grades every
 * draft through the same pipeline and returns the same evaluation shape.
 */
import { ApiError, api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import type { SubmitResponse } from '@/shared/evaluation/evaluation'
import type { Modality } from '@/shared/modality'
import type { Flashcard, SupportLayer } from '../lib/types'

export type AttemptBody = components['schemas']['AttemptCreate']

export type SubmissionDraft = {
  modality: Modality
  /** The card being practised (MCQs and exercises are about it too). */
  card: Pick<Flashcard, 'id' | 'title' | 'tags'> & Partial<Flashcard>
  question: string
  questionType: string
  categoryTags: string[]
  /** Code, or for MCQ the chosen option's id. */
  answer: string
  /** The browser's copy of the expected answer: only a fallback, the server grades against its stored item. */
  reference?: string
  elapsedMs: number
  interactionId: string
  sessionId?: string
  multipleChoiceProblemId?: string
  exerciseId?: string
  supportLayer?: SupportLayer
  liveCoachUsed?: boolean
  /** Facts about the answer, stored with it (line counts, blank counts, ladder rung…). */
  modalitySignals?: Record<string, unknown>
  /** The flow context, or null outside a flow. */
  flowSignals?: Record<string, unknown> | null
  llmProvider: string
}

/**
 * What a modality describes about its answer. The page adds the rest: the flow context and the
 * provider, which are the same for every modality.
 */
export type ModalityDraft = Omit<SubmissionDraft, 'flowSignals' | 'llmProvider'>

/** How the practice screen names the card being practised (question type and skill tags). */
export type DraftCardContext = {
  card: SubmissionDraft['card']
  questionType: string
  categoryTags: string[]
}

export const createInteractionId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

/** The `/api/attempts` body for any modality's draft. */
export function buildAttemptBody(draft: SubmissionDraft): AttemptBody {
  const mcq = draft.modality === 'mcq'
  return {
    cardId: draft.card.id,
    cardTitle: draft.card.title,
    question: draft.question,
    questionType: draft.questionType,
    categoryTags: draft.categoryTags,
    correctAnswer: mcq ? undefined : draft.reference,
    userAnswer: mcq ? undefined : draft.answer,
    mode: 'main-recall',
    elapsedMs: draft.elapsedMs,
    sessionId: draft.sessionId ?? (draft.flowSignals?.runId as string | undefined),
    interactionId: draft.interactionId,
    generatedCardId: mcq ? undefined : draft.card.id,
    generatedCard: mcq ? undefined : { ...draft.card, prompt: draft.question },
    multipleChoiceProblemId: draft.multipleChoiceProblemId,
    selectedChoiceId: mcq ? draft.answer : undefined,
    exerciseId: draft.exerciseId,
    templateMode: 'algorithm',
    supportLayer: draft.supportLayer ?? 'none',
    modality: draft.modality,
    signals: {
      ...(draft.flowSignals ? { flow: draft.flowSignals } : {}),
      modality: { ...(draft.modalitySignals ?? {}), kind: draft.modality },
    },
    liveCoachUsed: draft.liveCoachUsed ?? false,
    llmProvider: draft.llmProvider,
  }
}

/**
 * Submit a draft and return the graded result. Throws an ApiError when the server rejects it
 * (a 4xx carries the server's reason) or can't be reached.
 */
export async function submitAnswer(draft: SubmissionDraft): Promise<SubmitResponse> {
  let result
  try {
    result = await api.POST('/api/attempts', { body: buildAttemptBody(draft) })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server.')
  }
  return unwrap(result, `Unable to submit attempt (${result.response.status})`) as SubmitResponse
}

/** The server's reason when it rejected the request itself (4xx); '' for outages and network errors. */
export const rejectionReason = (error: unknown) =>
  error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.message : ''

/** The one wording every modality uses when an answer couldn't be graded. */
export const submissionFailureMessage = (error: unknown) => {
  const reason = rejectionReason(error)
  return reason ? `Your answer could not be graded: ${reason}` : 'Your answer could not be graded. Submit again before continuing.'
}
