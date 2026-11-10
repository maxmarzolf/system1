import { act, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePracticeSession, useSessionPlan } from './usePracticeSession'
import { emptySkillMapCard } from '../lib/types'
import { mockFetch } from '@/test/fetch'

const arrow = (key: 'ArrowLeft' | 'ArrowRight') => fireEvent.keyDown(window, { key, metaKey: true })

describe('usePracticeSession', () => {
  it('moves within the deck and finishes once every card has a result', () => {
    const onMove = vi.fn()
    const { result } = renderHook(() => usePracticeSession({ disabled: false, onMove }))
    act(() => result.current.start(2))
    expect(result.current).toMatchObject({ total: 2, position: 0, canGoPrev: false, canGoNext: true })

    act(() => result.current.next())
    act(() => result.current.next())
    expect(result.current).toMatchObject({ position: 1, currentIndex: 1, canGoNext: false })
    expect(onMove).toHaveBeenCalledTimes(2)

    act(() => result.current.complete('a', true, 1200))
    expect(result.current.hasResult('a')).toBe(true)
    expect(result.current.finished).toBe(false)
    act(() => result.current.complete('b', false))
    expect(result.current).toMatchObject({ finished: true, attempts: 2, correctCount: 1, elapsedByCard: { a: 1200 } })

    act(() => result.current.next()) // a finished pass stays put
    act(() => result.current.prev())
    expect(result.current.position).toBe(0)
  })

  it('moves on a double-tapped Cmd+arrow, and not at all while disabled', () => {
    const { result, rerender } = renderHook(({ disabled }) => usePracticeSession({ disabled, onMove: () => {} }), {
      initialProps: { disabled: false },
    })
    act(() => result.current.start(3))
    arrow('ArrowRight')
    expect(result.current.position).toBe(0)
    arrow('ArrowRight')
    expect(result.current.position).toBe(1)

    rerender({ disabled: true })
    arrow('ArrowLeft')
    arrow('ArrowLeft')
    expect(result.current.position).toBe(1)
    act(() => result.current.prev())
    expect(result.current.position).toBe(1)
  })
})

describe('useSessionPlan', () => {
  const deck = [{ ...emptySkillMapCard, id: 'a', title: 'Card A' }]

  const finishedSession = () => {
    const hook = renderHook(({ enabled }) => {
      const session = usePracticeSession({ disabled: false, onMove: () => {} })
      return { session, plan: useSessionPlan({ session, enabled, deck, questionType: 'skill-map', llmProvider: '' }) }
    }, { initialProps: { enabled: true } })
    act(() => hook.result.current.session.start(1))
    act(() => hook.result.current.session.complete('a', false, 3000))
    return hook
  }

  it('asks the coach once, with the weakest cards, when a pass finishes', async () => {
    const fetch = mockFetch([{ method: 'POST', match: '/api/coach/session-plan', body: { headline: 'Next time' } }])
    const { result, rerender } = finishedSession()
    await waitFor(() => expect(result.current.plan.plan).toMatchObject({ headline: 'Next time' }))
    expect(JSON.parse(String(fetch.calls[0].init?.body))).toMatchObject({
      attempts: 1, correctCount: 0, avgElapsedMs: 3000, weakestCards: [{ cardId: 'a', cardTitle: 'Card A', elapsedMs: 3000 }],
    })
    rerender({ enabled: true })
    expect(fetch.calls).toHaveLength(1)

    act(() => result.current.plan.reset())
    expect(result.current.plan).toMatchObject({ plan: null, loading: false, error: '' })
  })

  it('reports an unavailable plan', async () => {
    mockFetch([{ method: 'POST', match: '/api/coach/session-plan', status: 503, body: {} }])
    const { result } = finishedSession()
    await waitFor(() => expect(result.current.plan.error).toBe('Coach session plan unavailable right now.'))
  })
})
