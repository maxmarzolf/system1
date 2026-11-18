import { describe, expect, it } from 'vitest'
import type { PracticePlaylist } from '@/shared/data/playlists'
import { resolvePracticeFocus } from './focus'

const skillMap = [
  { algorithm: 'Sliding Window', skills: [] },
  { algorithm: 'Binary Search', skills: [] },
]
const playlists = [
  { slug: 'blind', title: 'Blind', description: '', questions: [{ title: 'Two Sum', coreShape: 'Hash Map', methods: [] }] },
] as unknown as PracticePlaylist[]
const focus = (query: string, skillMapResolved = true) =>
  resolvePracticeFocus({ searchParams: new URLSearchParams(query), playlists, skillMap, skillMapResolved })

describe('resolvePracticeFocus', () => {
  it('defaults to the whole skill map', () => {
    const result = focus('')
    expect(result.requestedQuestionType).toBe('skill-map')
    expect(result.requestedSkillMap).toBe(skillMap)
    expect(result.requestedTemplateMode).toBe('algorithm')
    expect(Object.keys(result.requestedTemplateTargets)).toEqual(['sliding-window', 'binary-search'])
  })

  it('narrows a focused pattern to its algorithm', () => {
    const result = focus('focusPattern=sliding-window')
    expect(result.requestedQuestionType).toBe('skill-map-core-algorithm')
    expect(result.focusedPatternLabel).toBe('Sliding Window')
    expect(result.requestedSkillMap).toEqual([{ algorithm: 'Sliding Window', skills: [] }])
  })

  it('waits for the algorithm catalog, then reports an unknown pattern', () => {
    expect(focus('focusPattern=unknown', false)).toMatchObject({ focusedCardPending: true, focusedCardNotFound: false })
    expect(focus('focusPattern=unknown', true)).toMatchObject({ focusedCardPending: false, focusedCardNotFound: true })
  })

  it('prefers a playlist, then a tag', () => {
    expect(focus('playlist=blind&focusPattern=unknown')).toMatchObject({ requestedQuestionType: 'playlist:blind', focusedCardNotFound: false })
    expect(focus('focusTag=heap').requestedQuestionType).toBe('tag:heap')
  })
})
