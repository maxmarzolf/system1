import { describe, expect, it } from 'vitest'
import type { PracticePlaylist } from './data/playlists'
import { resolvePracticeFocus } from './practice/focus'
import { resolvePrimaryAction, type PrimaryActionState } from './practice/primaryAction'
import { derivePracticeTargets } from './practice/targets'
import { EMPTY_FLOW_MICRODRILL_ACTION_STATE, emptySkillMapCard } from './practice/types'

const skillMap = [
  { algorithm: 'Sliding Window', skills: ['Fixed window', 'Variable window'] },
  { algorithm: 'Binary Search', skills: ['Lower bound'] },
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

  it('narrows a focused pattern to its chosen methods', () => {
    const result = focus('focusPattern=sliding-window&focusMethod=Variable%20window')
    expect(result.requestedQuestionType).toBe('skill-map-core-algorithm')
    expect(result.focusedPatternLabel).toBe('Sliding Window')
    expect(result.requestedSkillMap).toEqual([{ algorithm: 'Sliding Window', skills: ['Variable window'] }])
  })

  it('falls back to every method when none of the chosen ones exist', () => {
    expect(focus('focusPattern=sliding-window&focusMethod=nope').requestedSkillMap).toHaveLength(2)
  })

  it('waits for the taxonomy, then reports an unknown pattern', () => {
    expect(focus('focusPattern=unknown', false)).toMatchObject({ focusedCardPending: true, focusedCardNotFound: false })
    expect(focus('focusPattern=unknown', true)).toMatchObject({ focusedCardPending: false, focusedCardNotFound: true })
  })

  it('prefers a playlist, then a tag', () => {
    expect(focus('playlist=blind&focusPattern=unknown')).toMatchObject({ requestedQuestionType: 'playlist:blind', focusedCardNotFound: false })
    expect(focus('focusTag=heap').requestedQuestionType).toBe('tag:heap')
  })
})

describe('derivePracticeTargets', () => {
  const card = { ...emptySkillMapCard, tags: ['sliding-window'], solution: 'def f():\n    return {{missing}}', missing: '1', prompt: '' }

  it('fills the missing piece into the solution', () => {
    expect(derivePracticeTargets(card).practiceTarget).toBe('def f():\n    return 1')
  })

  it('prefers a generated algorithm target and prompt', () => {
    const generated = { ...card, templateTargets: { algorithm: 'x = {{missing}}' }, templatePrompts: { algorithm: 'Write it' } }
    expect(derivePracticeTargets(generated)).toMatchObject({ practiceTarget: 'x = 1', practicePrompt: 'Write it' })
  })

  it('builds a prompt when the card has none', () => {
    expect(derivePracticeTargets(card).practicePrompt.length).toBeGreaterThan(0)
    expect(derivePracticeTargets(card).primaryPatternTag).toBe('sliding-window')
  })
})

describe('resolvePrimaryAction', () => {
  const base: PrimaryActionState = {
    ladderActive: false,
    flowStage: null,
    microDrill: EMPTY_FLOW_MICRODRILL_ACTION_STATE,
    hasDeck: true,
    practiceMode: 'recall',
    mainPhase: 'preview',
    coachLoading: false,
    mcqSubmitted: false,
    mcqSelected: false,
    mcqGrading: false,
    hasAnsweredCurrent: false,
    sessionFinished: false,
    latestSubmittedWasGhostRep: false,
    recallEvaluationPending: false,
    recallInputEmpty: false,
    mainCloseEnough: false,
  }
  const act = (overrides: Partial<PrimaryActionState>) => resolvePrimaryAction({ ...base, ...overrides })

  it('has nothing to press on the ladder or without a deck', () => {
    expect(act({ ladderActive: true })).toBeNull()
    expect(act({ hasDeck: false })).toBeNull()
  })

  it('walks a recall attempt: start, submit, revise', () => {
    expect(act({})).toMatchObject({ kind: 'recall-start', disabled: false })
    expect(act({ mainPhase: 'typing', recallInputEmpty: true })).toMatchObject({ kind: 'recall-submit', disabled: true })
    expect(act({ mainPhase: 'submitted' })).toMatchObject({ kind: 'recall-revise' })
    expect(act({ mainPhase: 'submitted', mainCloseEnough: true })).toBeNull()
    expect(act({ mainPhase: 'submitted', latestSubmittedWasGhostRep: true })).toMatchObject({ kind: 'ghost-repeat' })
  })

  it('submits a multiple-choice answer once one is selected', () => {
    expect(act({ practiceMode: 'multiple-choice' })).toMatchObject({ kind: 'mcq-submit', disabled: true })
    expect(act({ practiceMode: 'multiple-choice', mcqSelected: true, mcqGrading: true })).toMatchObject({ label: 'Grading…', disabled: true })
    expect(act({ practiceMode: 'multiple-choice', mcqSubmitted: true })).toBeNull()
  })

  it('moves a flow on after each modality', () => {
    expect(act({ flowStage: 'recall', mainPhase: 'submitted', coachLoading: true })).toMatchObject({ kind: 'flow-next', disabled: true })
    expect(act({ flowStage: 'multiple-choice', practiceMode: 'multiple-choice', mcqSubmitted: true })).toMatchObject({ kind: 'flow-next' })
    expect(act({ flowStage: 'ghost', mainPhase: 'submitted' })).toMatchObject({ kind: 'flow-next' })
  })

  it('follows the microdrill card, even without a deck', () => {
    const drill = { ...EMPTY_FLOW_MICRODRILL_ACTION_STATE, ready: true, complete: true }
    expect(act({ flowStage: 'microdrill', hasDeck: false, microDrill: drill })).toMatchObject({ kind: 'microdrill-submit', disabled: false })
    expect(act({ flowStage: 'microdrill', microDrill: { ...drill, saving: true } })?.disabled).toBe(true)
    expect(act({ flowStage: 'microdrill', microDrill: { ...drill, submitted: true } })).toMatchObject({ kind: 'flow-next' })
  })
})
