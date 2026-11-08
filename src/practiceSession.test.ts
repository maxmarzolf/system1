import { act, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePracticeHotkeys } from './practice/hooks/usePracticeHotkeys'
import { usePracticeSession, useSessionPlan } from './practice/hooks/usePracticeSession'
import { emptySkillMapCard } from './practice/types'
import { mockFetch } from './test/fetch'

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

describe('usePracticeHotkeys', () => {
  const setup = (overrides: Partial<Parameters<typeof usePracticeHotkeys>[0]> = {}) => {
    const button = document.createElement('button')
    const click = vi.fn()
    button.addEventListener('click', click)
    const handlers = { onToggleAiCompletion: vi.fn(), onToggleGhostReps: vi.fn(), onToggleInline: vi.fn() }
    renderHook(() => usePracticeHotkeys({ primaryButtonRef: { current: button }, recallActive: true, flowActive: false, ...handlers, ...overrides }))
    return { button, click, ...handlers }
  }
  const press = (key: string) => fireEvent.keyDown(window, { key, metaKey: true })

  it('presses the primary button unless it is disabled', () => {
    const { button, click } = setup()
    press('Enter')
    expect(click).toHaveBeenCalledTimes(1)
    button.disabled = true
    press('Enter')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('toggles recall support, except what a flow fixes', () => {
    const recall = setup()
    press('l')
    press('g')
    press('i')
    expect(recall.onToggleAiCompletion).toHaveBeenCalledTimes(1)
    expect(recall.onToggleGhostReps).toHaveBeenCalledTimes(1)
    expect(recall.onToggleInline).toHaveBeenCalledTimes(1)
  })

  it('leaves Ghost Reps and Inline alone in a flow, and everything alone outside recall', () => {
    const inFlow = setup({ flowActive: true })
    press('g')
    press('l')
    expect(inFlow.onToggleGhostReps).not.toHaveBeenCalled()
    expect(inFlow.onToggleAiCompletion).toHaveBeenCalledTimes(1)

    const outsideRecall = setup({ recallActive: false })
    press('l')
    expect(outsideRecall.onToggleAiCompletion).not.toHaveBeenCalled()
  })
})
