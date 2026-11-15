import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { choiceIndexForKey, useMultipleChoiceHotkeys } from './useMultipleChoiceHotkeys'

describe('useMultipleChoiceHotkeys', () => {
  it('maps A–D and 1–4 to the first to fourth answer', () => {
    expect(['a', 'B', '3', 'd', '4', 'e', '5'].map(choiceIndexForKey)).toEqual([0, 1, 2, 3, 3, -1, -1])
  })

  it('chooses by key while enabled, and ignores modifiers, fields and missing answers', () => {
    const onChoose = vi.fn()
    const { rerender } = renderHook(({ enabled }) => useMultipleChoiceHotkeys({ enabled, choiceIds: ['A', 'B', 'C'], onChoose }), {
      initialProps: { enabled: true },
    })
    fireEvent.keyDown(window, { key: 'b' })
    fireEvent.keyDown(window, { key: '3' })
    fireEvent.keyDown(window, { key: 'd' }) // only three answers
    fireEvent.keyDown(window, { key: 'a', metaKey: true })
    const field = document.createElement('input')
    document.body.appendChild(field)
    fireEvent.keyDown(field, { key: 'a' })
    field.remove()
    expect(onChoose.mock.calls).toEqual([['B'], ['C']])

    rerender({ enabled: false })
    fireEvent.keyDown(window, { key: 'a' })
    expect(onChoose).toHaveBeenCalledTimes(2)
  })
})
