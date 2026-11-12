import { describe, expect, it } from 'vitest'
import { summarizeFlowMastery, type FlowAttempt, type FlowConfig } from './practiceFlow'
import {
  FLOW_HISTORY_UNAVAILABLE,
  flowReducer,
  flowStatusText,
  initialFlowState,
  planFlowAdvance,
  planFlowAtStage,
  planFlowStart,
  planStageJump,
} from './flowReducer'
import { EMPTY_FLOW_MICRODRILL_ACTION_STATE, emptySkillMapCard, type Flashcard } from '../lib/types'

const card = (id: string): Flashcard => ({ ...emptySkillMapCard, id, title: `Card ${id}`, solution: 'a = 1\nb = 2' })
const custom: FlowConfig = { mode: 'custom', blocks: [{ stage: 'recall', count: 1 }, { stage: 'multiple-choice', count: 1 }], randomStages: ['recall'] }
const adaptive: FlowConfig = { ...custom, mode: 'adaptive' }
const attempt = (anchorCardId: string, modality: FlowAttempt['modality'], extra: Partial<FlowAttempt> = {}): FlowAttempt => ({
  anchorCardId, modality, successful: true, score: 100, elapsedMs: 1000, missedLineCount: 0, weaknesses: [], question: '', createdAt: '2026-11-08T00:00:00Z', ...extra,
})

describe('flowReducer', () => {
  const started = flowReducer(initialFlowState, { type: 'flowChanged', flow: planFlowStart(custom, card('a'), [], 'run-1').flow })

  it('loads history into the evidence, or reports it unavailable', () => {
    let state = flowReducer(initialFlowState, { type: 'historyRequested' })
    expect(state).toMatchObject({ historyLoading: true, historyError: '' })
    state = flowReducer(state, { type: 'historyLoaded', attempts: [attempt('a', 'mcq', { attemptId: 1 })] })
    state = flowReducer(state, { type: 'attemptsRecorded', attempts: [attempt('a', 'mcq', { attemptId: 1 }), attempt('a', 'total-recall', { attemptId: 2 })] })
    expect(state.attempts).toHaveLength(2)
    expect(flowReducer(state, { type: 'historyFailed' })).toMatchObject({ historyLoading: false, historyError: FLOW_HISTORY_UNAVAILABLE })
  })

  it('changes stage directly and clears the previous microdrill action', () => {
    expect(started.flow).toMatchObject({ anchorCardId: 'a', stage: 'recall', step: 0, runId: 'run-1' })
    const withDrill = flowReducer(started, { type: 'microDrillActionChanged', state: { ...EMPTY_FLOW_MICRODRILL_ACTION_STATE, ready: true } })
    const next = flowReducer(withDrill, { type: 'flowChanged', flow: planStageJump(started.flow!, 'ghost').flow })
    expect(next).toMatchObject({ flow: { stage: 'ghost', step: 1 }, microDrillAction: EMPTY_FLOW_MICRODRILL_ACTION_STATE })
  })

  it('updates the targeted lines only inside a flow, and stops cleanly', () => {
    const focus = { sequenceStage: 'recall' as const, focusSummary: 'Missed b', missedLines: [] }
    expect(flowReducer(started, { type: 'focusChanged', focus }).flow?.focus).toBe(focus)
    expect(flowReducer(initialFlowState, { type: 'focusChanged', focus })).toBe(initialFlowState)
    expect(flowReducer(started, { type: 'stopped' })).toMatchObject({ flow: null, microDrillAction: EMPTY_FLOW_MICRODRILL_ACTION_STATE })
  })
})

describe('flow planning', () => {
  it('starts a custom flow at its first block, targeting every line of the card', () => {
    const { flow } = planFlowStart(custom, card('a'), [], 'run')
    expect(flow).toMatchObject({ stage: 'recall', cycle: 1, completedAnchorIds: [] })
    expect(flow.focus.missedLines.map((line) => line.lineNumber)).toEqual([1, 2])
  })

  it('advances a custom flow through its blocks', () => {
    const { flow } = planFlowStart(custom, card('a'), [], 'run')
    const move = planFlowAdvance(flow, [card('a'), card('b')], [])
    expect(move.newAnchor).toBeNull()
    expect(move.flow).toMatchObject({ stage: 'multiple-choice', step: 1, anchorCardId: 'a' })
  })

  it('moves an adaptive flow to the next card once the anchor is mastered', () => {
    const mastered = ['total-recall', 'mcq', 'microdrill', 'ghost-rep', 'total-recall', 'mcq', 'microdrill', 'total-recall']
      .map((modality, index) => attempt('a', modality as FlowAttempt['modality'], { attemptId: index + 1 }))
    expect(summarizeFlowMastery(mastered).mastered).toBe(true)
    const { flow } = planFlowAtStage(adaptive, card('a'), 'ghost', 'run')
    const move = planFlowAdvance(flow, [card('a'), card('b')], mastered)
    expect(move.newAnchor?.id).toBe('b')
    expect(move.flow).toMatchObject({ anchorCardId: 'b', stage: 'recall', cycle: 2, step: 1, completedAnchorIds: ['a'] })
  })

  it('jumps a running flow to a stage, or starts an adaptive one there', () => {
    const { flow } = planFlowStart(custom, card('a'), [], 'run')
    expect(planStageJump(flow, 'microdrill').flow).toMatchObject({ stage: 'microdrill', step: 1 })
    const fresh = planFlowAtStage(custom, card('a'), 'multiple-choice', 'run')
    expect(fresh.flow).toMatchObject({ stage: 'multiple-choice', config: { mode: 'adaptive' } })
  })
})

describe('flowStatusText', () => {
  const mastery = summarizeFlowMastery([])
  it('describes each mode', () => {
    expect(flowStatusText(null, mastery, true)).toBe('Loading prior attempts…')
    expect(flowStatusText(null, mastery, false)).toMatch(/^Choose Adaptive/)
    const { flow } = planFlowStart(custom, card('a'), [], 'run')
    expect(flowStatusText(flow, mastery, false)).toBe('Cycle 1 · Rep 1 of 2 · Recall')
    expect(flowStatusText({ ...flow, config: { ...custom, mode: 'random' } }, mastery, false)).toMatch(/^Rep 1 · /)
    expect(flowStatusText({ ...flow, config: adaptive }, mastery, false)).toMatch(/% proficiency · evidence across 0 modalities/)
  })
})
