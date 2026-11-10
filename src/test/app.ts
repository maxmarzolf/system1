import { act, screen } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { vi } from 'vitest'

export type Drill = {
  id: string
  title: string
  difficulty: string
  prompt: string
  solution: string
  missing: string
  hint: string
  tags: string[]
}

export const drill = (id: string, overrides: Partial<Drill> = {}): Drill => ({
  id,
  title: `Window ${id}`,
  difficulty: 'Easy',
  prompt: 'Sum each window',
  solution: 'def f(nums, k):\n    {{missing}}\n    return total',
  missing: 'total = sum(nums[:k])',
  hint: 'Start with the first window',
  tags: ['skill-map', 'sliding-window'],
  ...overrides,
})

export const mcqCard = (id: string) => ({
  id,
  title: `Heap question ${id}`,
  algorithm: 'Heap',
  difficulty: 'medium',
  question: `Which structure keeps the top k? (${id})`,
  choices: [
    { id: 'A', text: 'A min-heap of size k' },
    { id: 'B', text: 'A sorted list' },
    { id: 'C', text: 'A stack' },
    { id: 'D', text: 'A queue' },
  ],
  correctChoiceId: 'A',
  explanation: 'The heap evicts the smallest.',
  tags: ['heap'],
})

export const evaluation = (sound: boolean, feedback: Record<string, unknown> = {}) => ({
  version: 1,
  verdict: sound ? 'sound' : 'needs-work',
  score: { overall: sound ? 95 : 40 },
  primaryFailure: sound ? {} : { key: 'windowRepair', label: 'Window repair' },
  dimensions: {},
  modifiers: {},
  recommendedAction: '',
  feedback: {
    fullFeedback: sound ? 'sound: clean window.' : 'needs work: the window never moves.',
    primaryFocus: sound ? '' : 'Move the window',
    affirmation: sound ? 'Great recall' : '',
    microDrill: '',
    strengths: [],
    errorTags: [],
    ...feedback,
  },
  provenance: { llmUsed: true, provider: 'openai', source: 'llm' },
})

/** The last CodeMirror view on the page. */
export const lastEditor = () => {
  const editors = document.querySelectorAll('.cm-editor')
  return EditorView.findFromDOM(editors[editors.length - 1] as HTMLElement)!
}

export const typeCode = (text: string) => {
  const view = lastEditor()
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }))
}

export const pressKey = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })

export const button = (name: string | RegExp) => screen.getByRole('button', { name })

export const flush = (ms = 0) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))

export const silenceConsole = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}
