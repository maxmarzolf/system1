import { describe, expect, it } from 'vitest'
import { CODE_EDITOR_TUNING_STORAGE_KEY, defaultCodeEditorTuning, loadStoredCodeEditorTuning, saveStoredCodeEditorTuning } from '@/shared/settings/codeEditorTuning'
import { LADDER_RUNGS, slidingWindowTechnique } from './windowLadderPlan'

describe('sliding window technique', () => {
  const card = (title: string, tags: string[] = ['sliding-window'], solution?: string) => ({ title, tags, solution })

  it.each([
    [card('Anything', ['heap']), null],
    [card('x', ['sliding-window', 'fixed-window']), 'fixed'],
    [card('x', ['sliding-window', 'variable-size-window']), 'variable'],
    [card('Find All Anagrams in a String'), 'fixed'],
    [card('Minimum Window Substring'), 'variable'],
    [card('Rolling sum of k'), 'fixed'],
    [card('Expand shrink drill'), 'variable'],
    [card('Mystery', ['sliding-window'], 'while total > target:\n    left += 1'), 'variable'],
    [card('Mystery', ['sliding-window'], 'for right in range(k, n):'), 'fixed'],
    [card('Mystery'), null],
  ])('classifies %o', (input, expected) => {
    expect(slidingWindowTechnique(input)).toBe(expected)
  })

  it('has five rungs per technique', () => {
    expect(LADDER_RUNGS.fixed).toHaveLength(5)
    expect(LADDER_RUNGS.variable).toHaveLength(5)
  })
})

type Stored<T> = {
  name: string
  key: string
  defaults: T
  load: () => T
  save: (value: T) => void
  valid: T
  invalid: Record<string, unknown>
}

const storedTunings: Stored<unknown>[] = [
  {
    name: 'code editor',
    key: CODE_EDITOR_TUNING_STORAGE_KEY,
    defaults: defaultCodeEditorTuning,
    load: loadStoredCodeEditorTuning,
    save: saveStoredCodeEditorTuning as (value: unknown) => void,
    valid: { ...defaultCodeEditorTuning, language: 'rust', foldControls: true },
    invalid: {
      language: 'cobol',
      intellisense: 'yes',
      aiCompletion: 1,
      styleGuide: 'google',
      commonPatterns: null,
      foldControls: 'no',
      showSearchPanel: 0,
    },
  },
]

describe.each(storedTunings)('$name tuning storage', ({ key, defaults, load, save, valid, invalid }) => {
  it('defaults when nothing or garbage is stored', () => {
    expect(load()).toEqual(defaults)
    localStorage.setItem(key, '{not json')
    expect(load()).toEqual(defaults)
  })

  it('round-trips valid values', () => {
    save(valid)
    expect(load()).toEqual(valid)
  })

  it('replaces invalid fields with defaults', () => {
    localStorage.setItem(key, JSON.stringify(invalid))
    expect(load()).toMatchObject(defaults as object)
  })
})
