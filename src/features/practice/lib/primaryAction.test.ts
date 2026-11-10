import { describe, expect, it } from 'vitest'
import { resolvePrimaryAction, type PrimaryActionState } from './primaryAction'
import { EMPTY_FLOW_MICRODRILL_ACTION_STATE } from './types'

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
