import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PracticePlaylist } from './data/playlists'
import { resolvePracticeFocus } from './practice/focus'
import { useFlowMultipleChoiceDeck, useMultipleChoiceDeck, useRecallDeck } from './practice/hooks/useDecks'
import type { MultipleChoiceDrillsRequest } from './practice/types'
import { mockFetch } from './test/fetch'

const skillMap = [{ algorithm: 'Sliding Window', skills: ['Fixed window'] }]
const playlists = [
  { slug: 'blind', title: 'Blind', description: '', staticDeck: true, questions: [] },
  { slug: 'live', title: 'Live', description: '', questions: [{ title: 'Three Sum', coreShape: 'Two Pointers', methods: [] }] },
] as unknown as PracticePlaylist[]
const focusFor = (query: string) =>
  resolvePracticeFocus({ searchParams: new URLSearchParams(query), playlists, skillMap, skillMapResolved: true })
const drill = (id: string) => ({ id, title: id })

describe('useRecallDeck', () => {
  it('loads a tag deck once and reports when it finished', async () => {
    const fetch = mockFetch([{ match: '/api/coach/problem-drills?tag=heap', body: { drills: [drill('a')] } }])
    const { result, rerender } = renderHook(() => useRecallDeck(focusFor('focusTag=heap'), 'mastery', ''))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.deck).toEqual([drill('a')])
    expect(result.current.loadedAt).toBeGreaterThan(0)
    rerender()
    expect(fetch.calls).toHaveLength(1)
  })

  it('switches decks when the focus changes', async () => {
    mockFetch([
      { match: '/api/coach/problem-drills/sliding-window', body: { drills: [drill('focused')] } },
      { match: '/api/coach/problem-drills?count=10', body: { drills: [drill('random')] } },
    ])
    const { result, rerender } = renderHook(({ query }) => useRecallDeck(focusFor(query), 'mastery', ''), { initialProps: { query: '' } })
    await waitFor(() => expect(result.current.deck).toEqual([drill('random')]))
    rerender({ query: 'focusPattern=sliding-window' })
    expect(result.current.deck).toEqual([]) // never the previous focus's cards
    await waitFor(() => expect(result.current.deck).toEqual([drill('focused')]))
  })

  it('names an unavailable static playlist', async () => {
    mockFetch([{ match: '/api/coach/playlist-drills/blind', status: 503, body: {} }])
    const { result } = renderHook(() => useRecallDeck(focusFor('playlist=blind'), 'mastery', ''))
    await waitFor(() => expect(result.current.error).toBe('Static playlist is unavailable right now.'))
    expect(result.current.deck).toEqual([])
  })

  it('streams a generated deck, falling back to the plain endpoint', async () => {
    const events = `event: drill\ndata: ${JSON.stringify({ drill: drill('s1'), index: 0, total: 1 })}\n\nevent: done\ndata: {}\n\n`
    mockFetch([{ method: 'POST', match: '/api/coach/skill-map-drills-stream', text: events }])
    const streamed = renderHook(() => useRecallDeck(focusFor('playlist=live'), 'mastery', ''))
    await waitFor(() => expect(streamed.result.current.loading).toBe(false))
    expect(streamed.result.current.deck).toEqual([drill('s1')])

    mockFetch([
      { method: 'POST', match: '/api/coach/skill-map-drills-stream', status: 500, body: {} },
      { method: 'POST', match: '/api/coach/skill-map-drills', status: 502, body: { detail: 'Provider down' } },
    ])
    const failed = renderHook(() => useRecallDeck(focusFor('playlist=live'), 'mastery', 'other-provider'))
    await waitFor(() => expect(failed.result.current.error).toBe('Provider down'))
  })

  it('waits while a focused pattern is unresolved', () => {
    const fetch = mockFetch([])
    const pending = resolvePracticeFocus({ searchParams: new URLSearchParams('focusPattern=x'), playlists, skillMap, skillMapResolved: false })
    const { result } = renderHook(() => useRecallDeck(pending, 'mastery', ''))
    expect(result.current).toMatchObject({ loading: false, deck: [] })
    expect(fetch.calls).toHaveLength(0)
  })
})

const mcqRequest = (overrides: Partial<MultipleChoiceDrillsRequest> = {}): MultipleChoiceDrillsRequest => ({
  questionType: 'skill-map-mcq:card:random', count: 3, skillMap, difficulty: 'Med.', sourceMode: 'card', flowMode: 'random', llmProvider: '', ...overrides,
})

describe('multiple-choice decks', () => {
  it('generates a fresh set each time the learner switches to MCQ', async () => {
    const fetch = mockFetch([{ method: 'POST', match: '/api/coach/multiple-choice-drills', body: { drills: [drill('q')] } }])
    const { result, rerender } = renderHook(({ id, request }) => useMultipleChoiceDeck(request, id, 'skill-map'), {
      initialProps: { id: 0, request: null as MultipleChoiceDrillsRequest | null },
    })
    expect(fetch.calls).toHaveLength(0)
    rerender({ id: 1, request: mcqRequest() })
    await waitFor(() => expect(result.current.deck).toEqual([drill('q')]))
    rerender({ id: 2, request: mcqRequest() })
    await waitFor(() => expect(fetch.calls).toHaveLength(2))
  })

  it('keeps a flow rep on one question while the flow phase changes, and retries a failure', async () => {
    let fail = true
    const fetch = mockFetch([{
      method: 'POST',
      match: '/api/coach/multiple-choice-drills',
      respond: () => (fail ? { drills: [] } : { drills: [drill('targeted')] }),
    }])
    const rep = { runId: 'run', step: 2 }
    const { result, rerender } = renderHook(({ request }) => useFlowMultipleChoiceDeck(request, rep), {
      initialProps: { request: mcqRequest({ count: 1 }) },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ request: mcqRequest({ count: 1, difficulty: 'Hard' }) })
    expect(fetch.calls).toHaveLength(1)
    fail = false
    result.current.retry()
    await waitFor(() => expect(result.current.deck).toEqual([drill('targeted')]))
  })
})
