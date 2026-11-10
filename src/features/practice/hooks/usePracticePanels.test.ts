import { act, fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePracticePanels } from './usePracticePanels'

describe('usePracticePanels', () => {
  it('keeps one side panel open at a time and closes on Escape', () => {
    const { result } = renderHook(() => usePracticePanels({ flowOpenOnArrival: true, relatedKey: 'a' }))
    expect(result.current.flowOpen).toBe(true)
    act(() => result.current.toggleRelated())
    expect(result.current).toMatchObject({ flowOpen: false, relatedOpen: true })
    act(() => result.current.toggleLadder('card'))
    expect(result.current).toMatchObject({ relatedOpen: false, ladderCardId: 'card' })
    act(() => result.current.toggleFlow())
    expect(result.current).toMatchObject({ flowOpen: true, ladderCardId: null })
    act(() => result.current.toggleZen())
    expect(result.current).toMatchObject({ zen: true, flowOpen: false })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(result.current.zen).toBe(false)
  })

  it('closes the related drawer when the card changes', () => {
    const { result, rerender } = renderHook(({ relatedKey }) => usePracticePanels({ flowOpenOnArrival: false, relatedKey }), {
      initialProps: { relatedKey: 'a' },
    })
    act(() => result.current.toggleRelated())
    expect(result.current.relatedOpen).toBe(true)
    rerender({ relatedKey: 'b' })
    expect(result.current.relatedOpen).toBe(false)
  })
})
