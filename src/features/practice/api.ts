/**
 * The practice page's requests: loading and generating decks, building MCQ generation requests,
 * and saving attempts (with the body each kind of attempt sends to /api/attempts).
 */
import { api, ApiError, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import type { SkillMapNode } from '@/shared/data/skill-map'
import type { GooglePlaylistOrder } from '@/shared/settings/googlePlaylistTuning'
import type { McqFlowMode } from '@/shared/settings/mcqTuning'
import type { SubmissionTuning } from '@/shared/settings/submissionTuning'
import type { FlowGenerationContext } from './flow/practiceFlow'
import { getPrimaryPatternTag, patternLabelFromSlug } from './lib/patterns'
import { MULTIPLE_CHOICE_DIFFICULTY, type AttemptPayload, type Flashcard, type MultipleChoiceCard, type MultipleChoiceDrillsRequest, type MultipleChoiceDrillsResponse, type MultipleChoiceSpecimenContext, type PracticeFlowState, type SkillMapDrillsRequest, type SkillMapDrillsResponse, type SubmissionSaveResponse } from './lib/types'

// ── Deck loaders. useDecks caches and deduplicates them with TanStack Query. ──

export const requestSkillMapDrills = async (body: SkillMapDrillsRequest) =>
  unwrap(await api.POST('/api/coach/skill-map-drills', { body }), 'Unable to generate skill map drills') as unknown as SkillMapDrillsResponse

export const requestCoreAlgorithmDrills = async (algorithmSlug: string) =>
  unwrap(
    await api.GET('/api/coach/problem-drills/{algorithm_slug}', { params: { path: { algorithm_slug: algorithmSlug } } }),
    'Unable to load core algorithms',
  ) as unknown as SkillMapDrillsResponse

export const requestRandomCoreAlgorithmDrills = async (count = 10) =>
  unwrap(await api.GET('/api/coach/problem-drills', { params: { query: { count } } }), 'Unable to load core algorithms') as unknown as SkillMapDrillsResponse

export const requestCoreAlgorithmDrillsByTag = async (tagSlug: string, count = 10) =>
  unwrap(
    await api.GET('/api/coach/problem-drills', { params: { query: { tag: tagSlug, count } } }),
    'Unable to load tagged core algorithms',
  ) as unknown as SkillMapDrillsResponse

export const requestStaticPlaylistDrills = async (playlistSlug: string, order: GooglePlaylistOrder) =>
  unwrap(
    await api.GET('/api/coach/playlist-drills/{playlist_slug}', {
      params: { path: { playlist_slug: playlistSlug }, query: { order } },
    }),
    'Unable to load static playlist',
  ) as unknown as SkillMapDrillsResponse

export const requestMultipleChoiceDrills = async (body: MultipleChoiceDrillsRequest) =>
  unwrap(
    await api.POST('/api/coach/multiple-choice-drills', { body }),
    'Unable to generate multiple choice questions',
  ) as unknown as MultipleChoiceDrillsResponse

export type AttemptBody = components['schemas']['AttemptCreate']

/**
 * Save an attempt and return the graded result. Throws an ApiError when the server rejects it
 * (a 4xx carries the server's reason) or cannot be reached.
 */
export const postAttempt = async (body: AttemptBody): Promise<SubmissionSaveResponse> => {
  let result
  try {
    result = await api.POST('/api/attempts', { body })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server.')
  }
  return unwrap(result, `Unable to submit attempt (${result.response.status})`) as unknown as SubmissionSaveResponse
}

/** The server's reason when it rejected the request itself (4xx); '' for outages and network errors. */
export const rejectionReason = (error: unknown) =>
  error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.message : ''

export const requestSkillMapDrillsStream = async (
  body: SkillMapDrillsRequest,
  onDrill: (drill: Flashcard, index: number, total: number) => void,
): Promise<SkillMapDrillsResponse> => {
  const { response } = await api.POST('/api/coach/skill-map-drills-stream', { body, parseAs: 'stream' })
  if (!response.ok || !response.body) throw new Error('Streaming unavailable')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const drills: Flashcard[] = []

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    let eventType = ''
    let eventData = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        eventData = line.slice(6)
      } else if (line === '' && eventType && eventData) {
        const parsed = JSON.parse(eventData)
        if (eventType === 'drill') {
          drills.push(parsed.drill as Flashcard)
          onDrill(parsed.drill as Flashcard, parsed.index as number, parsed.total as number)
        } else if (eventType === 'error') {
          throw new Error(parsed.message || 'Stream error')
        }
        eventType = ''
        eventData = ''
      }
    }
  }
  if (drills.length === 0) throw new Error('No drills received')
  return { drills, llmUsed: true }
}

// ── MCQ generation requests ──

/** The card's skill-map entry for generation: its pattern plus the card and up to four tags. */
const cardSkillMap = (algorithm: string, card: { title: string; tags: string[] }): SkillMapNode[] => [{
  algorithm,
  skills: [card.title, ...card.tags.filter((tag) => tag !== 'skill-map').slice(0, 4)],
}]

/** What MCQ generation needs to know about the recall card it starts from. */
export function cardSpecimen(card: Flashcard, prompt: string, target: string): MultipleChoiceSpecimenContext {
  const patternTag = getPrimaryPatternTag(card.tags)
  return {
    cardId: card.id,
    cardTitle: card.title,
    algorithm: patternTag ? patternLabelFromSlug(patternTag) : card.title,
    prompt,
    target,
    tags: card.tags,
  }
}

/** A standalone MCQ set about one card. */
export function multipleChoiceDeckRequest(
  specimen: MultipleChoiceSpecimenContext,
  { count, flowMode, llmProvider }: { count: number; flowMode: McqFlowMode; llmProvider: string },
): MultipleChoiceDrillsRequest {
  return {
    questionType: `skill-map-mcq:card:${flowMode}`,
    count,
    skillMap: cardSkillMap(specimen.algorithm, { title: specimen.cardTitle, tags: specimen.tags }),
    difficulty: MULTIPLE_CHOICE_DIFFICULTY,
    sourceMode: 'card',
    flowMode,
    specimen,
    llmProvider,
  }
}

/** The single MCQ a flow asks for, aimed at the lines missed on the last recall. */
export function flowMultipleChoiceRequest({
  flow,
  card,
  prompt,
  target,
  context,
  llmProvider,
}: {
  flow: PracticeFlowState
  card: Flashcard
  prompt: string
  target: string
  context: FlowGenerationContext
  llmProvider: string
}): MultipleChoiceDrillsRequest {
  const patternTag = getPrimaryPatternTag(card.tags)
  const algorithm = (patternTag ? patternLabelFromSlug(patternTag) : card.title) || 'Algorithm'
  return {
    questionType: `skill-map-mcq:card:progressive:flow-${flow.runId}-step-${flow.step}`,
    count: 1,
    skillMap: cardSkillMap(algorithm, card),
    difficulty: context.phase === 'challenge' || context.phase === 'mastered' ? 'Hard' : MULTIPLE_CHOICE_DIFFICULTY,
    sourceMode: 'card',
    flowMode: 'progressive',
    specimen: {
      cardId: card.id,
      cardTitle: card.title,
      algorithm,
      prompt,
      target,
      tags: card.tags,
      focus: {
        sequenceStage: 'multiple-choice',
        focusSummary: flow.focus.focusSummary,
        missedLines: flow.focus.missedLines,
        ...context,
      },
    },
    llmProvider,
  }
}

// ── Attempt bodies ──

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
