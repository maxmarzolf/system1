import type { GooglePlaylistOrder } from '../googlePlaylistTuning'
import { api, ApiError, unwrap } from '../api/client'
import type { components } from '../api/schema'
import type { Flashcard, MultipleChoiceDrillsRequest, MultipleChoiceDrillsResponse, SkillMapDrillsRequest, SkillMapDrillsResponse, SubmissionSaveResponse } from './types'

// Deck loaders. Callers (practice/hooks/useDecks.ts) cache and deduplicate them with TanStack Query.

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
