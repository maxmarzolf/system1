import type { SubmissionTuning } from '@/shared/settings/submissionTuning'
import type { AttemptBody } from './requests'
import type { AttemptPayload, Flashcard, MultipleChoiceCard } from './lib/types'

type Context = {
  /** The flow context to attach, or null outside a flow. */
  flowSignals: Record<string, unknown> | null
  submissionTuning: SubmissionTuning
  llmProvider: string
}

/** The `/api/attempts` body for a recall, ghost rep or microdrill attempt on ``card``. */
export function recallAttemptBody(payload: AttemptPayload, { card, prompt, questionType, skillTags, flowSignals, submissionTuning, llmProvider }: Context & {
  card: Flashcard
  prompt: string
  questionType: string
  skillTags: string[]
}): AttemptBody {
  const question = payload.question ?? prompt
  return {
    cardId: card.id,
    cardTitle: card.title,
    question,
    questionType: payload.microdrill ? `${questionType}:microdrill` : questionType,
    // An attempt made outside the flow (the Ladder) is filed under the card's own tags.
    categoryTags: payload.outsideFlow ? card.tags : skillTags,
    correctAnswer: payload.correctAnswer,
    userAnswer: payload.userAnswer,
    mode: payload.mode,
    elapsedMs: payload.elapsedMs,
    sessionId: payload.sessionId ?? (flowSignals?.runId as string | undefined),
    interactionId: payload.interactionId,
    generatedCardId: card.id,
    generatedCard: { ...card, prompt: question },
    templateMode: payload.templateMode,
    supportLayer: payload.supportLayer,
    modality: payload.modality,
    signals: {
      ...(payload.signals ?? {}),
      ...(flowSignals ? { flow: flowSignals } : {}),
      modality: { ...(payload.signals?.modality ?? {}), kind: payload.modality },
    },
    liveCoachUsed: payload.liveCoachUsed,
    submissionTuning: { ...submissionTuning, microDrillEnabled: false },
    llmProvider,
  }
}

/** The `/api/attempts` body for an answer to an MCQ card; the server grades the choice. */
export function multipleChoiceAttemptBody(
  { card, choiceId, elapsedMs, interactionId, questionType, skillTags, flowSignals, submissionTuning, llmProvider }: Context & {
    card: MultipleChoiceCard
    choiceId: string
    elapsedMs: number
    interactionId: string
    questionType: string
    skillTags: string[]
  },
): AttemptBody {
  return {
    cardId: card.id,
    cardTitle: card.title,
    question: card.question,
    questionType,
    categoryTags: skillTags,
    multipleChoiceProblemId: card.id,
    selectedChoiceId: choiceId,
    mode: 'main-recall',
    elapsedMs,
    sessionId: flowSignals?.runId as string | undefined,
    interactionId,
    generatedCardId: card.id,
    generatedCard: { ...card, cardMode: 'multiple-choice', prompt: card.question },
    templateMode: 'algorithm',
    supportLayer: 'none',
    modality: 'mcq',
    signals: { ...(flowSignals ? { flow: flowSignals } : {}), modality: { kind: 'mcq', selectedChoiceId: choiceId } },
    liveCoachUsed: false,
    submissionTuning,
    llmProvider,
  }
}
