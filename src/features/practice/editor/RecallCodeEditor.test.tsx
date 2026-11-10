import { act, render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import RecallCodeEditor, { type RecallCodeEditorHandle, type RecallEditorLineMeta } from './RecallCodeEditor'
import { mockFetch } from '@/test/fetch'

type Completer = (prefix: string, suffix: string) => Promise<string>
const copilot = vi.hoisted(() => ({ completer: null as Completer | null, cleared: 0 }))
vi.mock('codemirror-copilot', () => ({
  inlineCopilot: (completer: Completer) => {
    copilot.completer = completer
    return []
  },
  clearLocalCache: () => {
    copilot.cleared += 1
  },
}))

const viewOf = (container: HTMLElement) => EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)!

type Props = Parameters<typeof RecallCodeEditor>[0]
const baseProps = (overrides: Partial<Props> = {}): Props => ({
  value: 'def f():\n    pass',
  language: 'python',
  theme: 'dark-high-contrast',
  editable: true,
  placeholder: 'Write code',
  lineMeta: [],
  onChange: vi.fn(),
  ...overrides,
})

describe('RecallCodeEditor', () => {
  it('renders the value, reports edits and follows value changes', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<RecallCodeEditor {...baseProps({ onChange, minHeight: 200, className: 'extra' })} />)
    expect(container.querySelector('.recall-code-editor.extra')).toHaveStyle({ minHeight: '200px' })
    const view = viewOf(container)
    expect(view.state.doc.toString()).toBe('def f():\n    pass')
    act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: '\n    return 1' } }))
    expect(onChange).toHaveBeenLastCalledWith('def f():\n    pass\n    return 1', { cursorLineNumber: expect.any(Number) })

    rerender(<RecallCodeEditor {...baseProps({ onChange, value: 'x = 1' })} />)
    expect(view.state.doc.toString()).toBe('x = 1')
    rerender(<RecallCodeEditor {...baseProps({ onChange, value: 'x = 1' })} />)
    expect(view.state.doc.toString()).toBe('x = 1')
  })

  it('exposes focus and cursor helpers', () => {
    const ref = createRef<RecallCodeEditorHandle>()
    const { container } = render(<RecallCodeEditor ref={ref} {...baseProps({ value: 'a\nb\nc' })} />)
    act(() => ref.current!.focusLine(99))
    expect(ref.current!.getCursorLineNumber()).toBe(3)
    act(() => ref.current!.focusLine(2))
    expect(ref.current!.getCursorLineNumber()).toBe(2)
    act(() => ref.current!.focusEnd())
    expect(ref.current!.getCursorPosition()).toBe(5)
    act(() => ref.current!.focus())
    expect(viewOf(container).hasFocus || true).toBe(true)
  })

  it('decorates lines with status, ghost text, notes and inline tasks', () => {
    const lineMeta: RecallEditorLineMeta[] = [
      { sourceLineNumber: 1, status: 'match', liveTone: 'positive', inlineNote: 'good', inlineDecision: true },
      { sourceLineNumber: null, status: 'missing', liveTone: 'negative' },
    ]
    const { container, rerender } = render(
      <RecallCodeEditor {...baseProps({ value: 'def f():\n', lineMeta, ghostTarget: 'def f():\n    return 1\nprint(f())', inlineTask: 'write the return' })} />,
    )
    expect(container.querySelector('.line-match.inline-decision-line.live-target-positive.live-target-source-line')).not.toBeNull()
    expect(container.querySelector('.line-missing.live-target-negative')).not.toBeNull()
    expect(container.querySelector('.cm-recall-inline-note-positive')).toHaveTextContent('good')
    expect(container.querySelector('.cm-recall-ghost-text')).toHaveTextContent('return 1')
    expect(container.querySelector('.cm-recall-ghost-block')).toHaveTextContent('print(f())')
    act(() => viewOf(container).dispatch({ selection: { anchor: viewOf(container).state.doc.length } }))
    rerender(<RecallCodeEditor {...baseProps({ value: 'def f():\n', lineMeta, inlineTask: 'write the return' })} />)
    expect(container.querySelector('.cm-recall-inline-task')).toHaveTextContent('write the return')
  })

  it('reconfigures language, theme, editing and assistance', () => {
    const { container, rerender } = render(<RecallCodeEditor {...baseProps()} />)
    for (const language of ['js', 'ts', 'jsx', 'tsx', 'java', 'cpp', 'go', 'sql', 'html', 'css', 'json', 'md', 'rust', 'brainfuck']) {
      rerender(
        <RecallCodeEditor
          {...baseProps({ language, theme: 'light-high-contrast', editable: false, placeholder: 'Other', intellisense: language !== 'go', commonPatterns: false, foldControls: true, showSearchPanel: true })}
        />,
      )
    }
    const view = viewOf(container)
    expect(view.state.readOnly).toBe(true)
    rerender(<RecallCodeEditor {...baseProps({ disabled: true })} />)
    expect(viewOf(container).state.readOnly).toBe(true)
  })

  it('runs the Enter handler and falls back to a newline', () => {
    const onEnterKey = vi.fn(() => true)
    const { container } = render(<RecallCodeEditor {...baseProps({ onEnterKey })} />)
    const content = container.querySelector('.cm-content') as HTMLElement
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(onEnterKey).toHaveBeenCalledWith({ value: 'def f():\n    pass', cursorLineNumber: 1 })
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  })

  it('asks the coach for inline completions only with a card context', async () => {
    const fetch = mockFetch([{ method: 'POST', match: '/api/coach/inline-completion', body: { prediction: 'return 1' } }])
    const onShown = vi.fn()
    const onStatus = vi.fn()
    const aiCompletion = { cardId: 'c', cardTitle: 'Card', prompt: 'Do it', provider: 'openai' }
    const { rerender, unmount } = render(
      <RecallCodeEditor {...baseProps({ aiCompletion, aiCompletionEnabled: true, onAiCompletionShown: onShown, onAiCompletionStatus: onStatus })} />,
    )
    expect(copilot.cleared).toBeGreaterThan(0)
    await expect(copilot.completer!('', '')).resolves.toBe('')
    await expect(copilot.completer!('def f():\n    ', '')).resolves.toBe('return 1')
    expect(onShown).toHaveBeenCalled()
    expect(JSON.parse(String(fetch.calls[0].init?.body))).toMatchObject({ language: 'python', cardTitle: 'Card', llmProvider: 'openai' })

    mockFetch([{ method: 'POST', match: '/api/coach/inline-completion', status: 503 }])
    await expect(copilot.completer!('x', '')).resolves.toBe('')
    expect(onStatus).toHaveBeenLastCalledWith('Configure a model provider for AI completion.')
    mockFetch([{ method: 'POST', match: '/api/coach/inline-completion', status: 500 }])
    await copilot.completer!('x', '')
    expect(onStatus).toHaveBeenLastCalledWith('AI completion is unavailable right now.')
    mockFetch([{ method: 'POST', match: '/api/coach/inline-completion', body: { prediction: 7 } }])
    await expect(copilot.completer!('x', '')).resolves.toBe('')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    onStatus.mockClear()
    await copilot.completer!('x', '')
    expect(onStatus).toHaveBeenCalledWith('AI completion is unavailable right now.')

    rerender(<RecallCodeEditor {...baseProps({ aiCompletion, aiCompletionEnabled: false, onAiCompletionStatus: onStatus })} />)
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith(''))
    unmount()
  })
})
