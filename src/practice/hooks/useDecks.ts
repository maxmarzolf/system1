/**
 * The practice page's three decks, loaded with TanStack Query: the recall deck for the URL focus,
 * an MCQ deck generated from one card, and the single MCQ a flow asks for at its MCQ stage.
 *
 * Generated decks cost an LLM call, so each one is fetched once per key and dropped as soon as the
 * page stops showing it (`staleTime: Infinity`, `gcTime: 0`): a deck is never silently reused.
 * A load never throws; a failure comes back as an empty deck with the reason to show.
 */
import { useQuery } from '@tanstack/react-query'
import { queryClient } from '../../api/client'
import type { GooglePlaylistOrder } from '../../googlePlaylistTuning'
import { loadStoredSpecimenTuning } from '../../specimenTuning'
import type { PracticeFocus } from '../focus'
import {
  requestCoreAlgorithmDrills,
  requestCoreAlgorithmDrillsByTag,
  requestMultipleChoiceDrills,
  requestRandomCoreAlgorithmDrills,
  requestSkillMapDrills,
  requestSkillMapDrillsStream,
  requestStaticPlaylistDrills,
} from '../requests'
import type { Flashcard, MultipleChoiceCard, MultipleChoiceDrillsRequest } from '../types'

type DeckResult<T> = { drills: T[]; error: string }

export type Deck<T> = {
  deck: T[]
  loading: boolean
  error: string
  /** Changes whenever a load finishes, so a new session can start on it. */
  loadedAt: number
  retry: () => void
}

const NO_DRILLS: never[] = []

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : fallback

function useDeck<T>(
  queryKey: readonly unknown[],
  enabled: boolean,
  load: (signal: AbortSignal, key: readonly unknown[]) => Promise<DeckResult<T>>,
): Deck<T> {
  const query = useQuery(
    { queryKey, enabled, queryFn: ({ signal }) => load(signal, queryKey), staleTime: Infinity, gcTime: 0, retry: false },
    queryClient,
  )
  return {
    deck: query.data?.drills ?? NO_DRILLS,
    loading: query.isFetching,
    error: query.data?.error ?? '',
    loadedAt: query.dataUpdatedAt,
    retry: () => void query.refetch(),
  }
}

/** The recall deck for the URL focus. A generated skill-map deck streams in drill by drill. */
export function useRecallDeck(focus: PracticeFocus, googlePlaylistOrder: GooglePlaylistOrder, llmProvider: string): Deck<Flashcard> {
  const { focusedTagSlug, focusedPatternSlug, requestedPlaylist, requestedQuestionType } = focus
  const queryKey = [
    'practice-deck', 'recall', requestedQuestionType, focusedPatternSlug, focusedTagSlug,
    focus.requestedSkillMapSignature, focus.requestedTemplateMode, googlePlaylistOrder, llmProvider,
  ]

  return useDeck<Flashcard>(queryKey, !focus.focusedCardPending && !focus.focusedCardNotFound, async (signal, key) => {
    const body = {
      questionType: requestedQuestionType,
      count: focus.requestedSkillMap.length,
      skillMap: focus.requestedSkillMap,
      templateMode: focus.requestedTemplateMode,
      templateTargets: focus.requestedTemplateTargets,
      specimenTuning: loadStoredSpecimenTuning(),
      llmProvider,
    }
    try {
      if (focusedTagSlug && !requestedPlaylist) return { drills: (await requestCoreAlgorithmDrillsByTag(focusedTagSlug, 10)).drills, error: '' }
      if (focusedPatternSlug && !requestedPlaylist) return { drills: (await requestCoreAlgorithmDrills(focusedPatternSlug)).drills, error: '' }
      if (!requestedPlaylist) return { drills: (await requestRandomCoreAlgorithmDrills(10)).drills, error: '' }
      if (requestedPlaylist.staticDeck) {
        const order = requestedPlaylist.slug === 'google' ? googlePlaylistOrder : 'mastery'
        return { drills: (await requestStaticPlaylistDrills(requestedPlaylist.slug, order)).drills, error: '' }
      }
      // Show each generated drill as it arrives; the final result replaces the partial deck.
      const streamed = await requestSkillMapDrillsStream(body, (drill) => {
        if (signal.aborted) return
        queryClient.setQueryData<DeckResult<Flashcard>>(key, (previous) => ({ drills: [...(previous?.drills ?? []), drill], error: '' }))
      })
      return { drills: streamed.drills, error: '' }
    } catch {
      if (requestedPlaylist?.staticDeck) return { drills: [], error: 'Static playlist is unavailable right now.' }
      try {
        return { drills: (await requestSkillMapDrills(body)).drills, error: '' }
      } catch (error) {
        return { drills: [], error: messageOf(error, 'Skill map drill generation is unavailable right now.') }
      }
    }
  })
}

const generateMultipleChoice = async (body: MultipleChoiceDrillsRequest, fallback: string): Promise<DeckResult<MultipleChoiceCard>> => {
  try {
    return { drills: (await requestMultipleChoiceDrills(body)).drills, error: '' }
  } catch (error) {
    return { drills: [], error: messageOf(error, fallback) }
  }
}

/**
 * An MCQ deck generated from a card. `request` is null until the learner switches to MCQ, and
 * `requestId` changes each time they do, so every switch generates a fresh set.
 */
export function useMultipleChoiceDeck(
  request: MultipleChoiceDrillsRequest | null,
  requestId: number,
  questionType: string,
): Deck<MultipleChoiceCard> {
  return useDeck<MultipleChoiceCard>(
    ['practice-deck', 'mcq', requestId, questionType, request?.count, request?.flowMode, request?.difficulty, request?.llmProvider],
    request !== null,
    () => generateMultipleChoice(request!, 'Multiple choice generation is unavailable right now.'),
  )
}

/** The one targeted MCQ for a flow's current rep; `request` is null outside an MCQ stage. */
export function useFlowMultipleChoiceDeck(
  request: MultipleChoiceDrillsRequest | null,
  rep: { runId: string; step: number } | null,
): Deck<MultipleChoiceCard> {
  return useDeck<MultipleChoiceCard>(
    // Not keyed on difficulty: answering can raise the flow's phase, which must not regenerate this rep's question.
    ['practice-deck', 'flow-mcq', rep?.runId, rep?.step, request?.llmProvider],
    request !== null,
    () => generateMultipleChoice(request!, 'Targeted multiple choice generation is unavailable right now.'),
  )
}
