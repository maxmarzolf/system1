import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePracticeHotkeys } from './usePracticeHotkeys'

describe('usePracticeHotkeys', () => {
  const setup = (overrides: Partial<Parameters<typeof usePracticeHotkeys>[0]> = {}) => {
    const button = document.createElement('button')
    const click = vi.fn()
    button.addEventListener('click', click)
    const handlers = { onSubmitKey: vi.fn(), onToggleAiCompletion: vi.fn(), onToggleGhostReps: vi.fn(), onToggleInline: vi.fn() }
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

  it('runs the card action on Mod+Shift+Enter, without pressing the button', () => {
    const { click, onSubmitKey } = setup()
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true, shiftKey: true })
    expect(onSubmitKey).toHaveBeenCalledTimes(2)
    expect(click).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true, shiftKey: true, repeat: true })
    expect(onSubmitKey).toHaveBeenCalledTimes(2)
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
