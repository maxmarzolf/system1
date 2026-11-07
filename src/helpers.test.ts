import { describe, expect, it, vi } from 'vitest'
import { apiUrl } from './api'
import {
  CODE_EDITOR_TUNING_STORAGE_KEY,
  defaultCodeEditorTuning,
  loadStoredCodeEditorTuning,
  saveStoredCodeEditorTuning,
} from './codeEditorTuning'
import {
  DAILY_WORK_RANGES,
  formatCalendarDate,
  formatCalendarWeekday,
  formatLongCalendarDate,
  viewerTimeZone,
} from './dailyWork'
import {
  GOOGLE_PLAYLIST_TUNING_STORAGE_KEY,
  defaultGooglePlaylistTuning,
  loadStoredGooglePlaylistTuning,
  saveStoredGooglePlaylistTuning,
} from './googlePlaylistTuning'
import {
  getEditorHotkeyKey,
  getHotkeyDisplayKeys,
  getHotkeyModifierLabel,
  getHotkeyReferenceGroups,
  matchesHotkey,
} from './hotkeys'
import {
  MCQ_TUNING_STORAGE_KEY,
  clampMcqQuestionCount,
  defaultMcqTuning,
  loadStoredMcqTuning,
  saveStoredMcqTuning,
} from './mcqTuning'
import { fetchSignalSpecCatalog } from './signalSpecs'
import {
  SPECIMEN_TUNING_STORAGE_KEY,
  defaultSpecimenTuning,
  loadStoredSpecimenTuning,
  saveStoredSpecimenTuning,
} from './specimenTuning'
import {
  SUBMISSION_TUNING_STORAGE_KEY,
  defaultSubmissionTuning,
  loadStoredSubmissionTuning,
  saveStoredSubmissionTuning,
} from './submissionTuning'
import { LADDER_RUNGS, slidingWindowTechnique } from './windowLadderPlan'
import { mockFetch } from './test/fetch'

describe('api', () => {
  it('prefixes paths with the configured base url', () => {
    expect(apiUrl('/api/health')).toBe('/api/health')
  })
})

describe('daily work', () => {
  it('formats calendar dates without shifting the day', () => {
    expect(formatCalendarDate('2026-03-01')).toMatch(/Mar|3/)
    expect(formatCalendarWeekday('2026-03-01')).toMatch(/Sun/)
    expect(formatLongCalendarDate('2026-03-01')).toMatch(/2026/)
    expect(DAILY_WORK_RANGES.map((range) => range.days)).toEqual([7, 30, 0])
  })

  it('reads the viewer timezone and falls back to UTC', () => {
    expect(viewerTimeZone()).toBeTruthy()
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no intl')
    })
    expect(viewerTimeZone()).toBe('UTC')
  })
})

describe('hotkeys', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

  it('labels the modifier per platform', () => {
    expect(getHotkeyModifierLabel(true)).toBe('⌘')
    expect(getHotkeyDisplayKeys('flow-full-recall', false)).toEqual(['Ctrl', 'D'])
    expect(getEditorHotkeyKey('indent-outdent')).toBe('Tab')
    expect(() => getEditorHotkeyKey('toggle-ghost-reps' as never)).toThrow('does not define an editor key')
    expect(() => getHotkeyDisplayKeys('nope' as never, true)).toThrow('Unknown hotkey')
  })

  it('matches key, modifier and shift bindings', () => {
    expect(matchesHotkey(key({ key: 'D', metaKey: true }), 'flow-full-recall')).toBe(true)
    expect(matchesHotkey(key({ key: 'd', ctrlKey: true }), 'flow-full-recall')).toBe(true)
    expect(matchesHotkey(key({ key: 'd' }), 'flow-full-recall')).toBe(false)
    expect(matchesHotkey(key({ key: 'x', metaKey: true }), 'flow-full-recall')).toBe(false)
    expect(matchesHotkey(key({ key: 'Enter' }), 'next-targeted-line')).toBe(true)
    expect(matchesHotkey(key({ key: 'Tab', shiftKey: true }), 'indent-outdent')).toBe(true)
    expect(matchesHotkey(key({ key: 'ArrowLeft', metaKey: true }), 'move-cards')).toBe(false)
  })

  it('groups the reference sheet', () => {
    const groups = getHotkeyReferenceGroups(true)
    expect(groups.map((group) => group.title)).toEqual(['Card modalities', 'Recall and Ghost Reps', 'Editor and coaching'])
    expect(groups[0].hotkeys[0]).toMatchObject({ keys: ['⌘', 'D'], flowStage: 'recall' })
  })
})

describe('signal specs', () => {
  it('fetches the catalog and reports failures', async () => {
    mockFetch([{ match: '/api/catalog/signal-specs', body: { default: {}, algorithms: [] } }])
    await expect(fetchSignalSpecCatalog()).resolves.toEqual({ default: {}, algorithms: [] })
    mockFetch([{ match: '/api/catalog/signal-specs', status: 500 }])
    await expect(fetchSignalSpecCatalog()).rejects.toThrow('Signal specs unavailable (500)')
  })
})

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
    name: 'specimen',
    key: SPECIMEN_TUNING_STORAGE_KEY,
    defaults: defaultSpecimenTuning,
    load: loadStoredSpecimenTuning,
    save: saveStoredSpecimenTuning as (value: unknown) => void,
    valid: { typeHints: 'include', comments: 'brief', variableNames: 'concise' },
    invalid: { typeHints: 1, comments: 'loud', variableNames: 'weird' },
  },
  {
    name: 'mcq',
    key: MCQ_TUNING_STORAGE_KEY,
    defaults: defaultMcqTuning,
    load: loadStoredMcqTuning,
    save: saveStoredMcqTuning as (value: unknown) => void,
    valid: { flowMode: 'progressive', questionCount: 12 },
    invalid: { flowMode: 'chaos', questionCount: 'many' },
  },
  {
    name: 'submission',
    key: SUBMISSION_TUNING_STORAGE_KEY,
    defaults: defaultSubmissionTuning,
    load: loadStoredSubmissionTuning,
    save: saveStoredSubmissionTuning as (value: unknown) => void,
    valid: { ...defaultSubmissionTuning, gradingMode: 'strict', contractStrictness: 'balanced' },
    invalid: { gradingMode: 'harsh', contractStrictness: 'iron' },
  },
  {
    name: 'google playlist',
    key: GOOGLE_PLAYLIST_TUNING_STORAGE_KEY,
    defaults: defaultGooglePlaylistTuning,
    load: loadStoredGooglePlaylistTuning,
    save: saveStoredGooglePlaylistTuning as (value: unknown) => void,
    valid: { order: 'difficulty' },
    invalid: { order: 'alphabetical' },
  },
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

describe('mcq question count', () => {
  it('clamps and rounds counts', () => {
    expect(clampMcqQuestionCount(0)).toBe(1)
    expect(clampMcqQuestionCount(99)).toBe(30)
    saveStoredMcqTuning({ flowMode: 'random', questionCount: 7.6 })
    expect(loadStoredMcqTuning().questionCount).toBe(8)
  })

  it('normalizes a bad playlist order when saving', () => {
    saveStoredGooglePlaylistTuning({ order: 'nope' as never })
    expect(loadStoredGooglePlaylistTuning().order).toBe(defaultGooglePlaylistTuning.order)
  })
})
