import { describe, expect, it } from 'vitest'
import { defaultGooglePlaylistTuning, loadStoredGooglePlaylistTuning, saveStoredGooglePlaylistTuning } from './googlePlaylistTuning'
import { clampMcqQuestionCount, loadStoredMcqTuning, saveStoredMcqTuning } from './mcqTuning'

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
