/**
 * The practice flow as data: its anchor card, stage, step, and the attempts that steer adaptation.
 * Effects such as history requests live in usePracticeFlow.ts.
 */
import {
  FLOW_LABELS,
  expandFlow,
  mergeFlowAttempts,
  nextFlowStep,
  summarizeFlowMastery,
  type FlowAttempt,
  type FlowConfig,
  type FlowMasterySummary,
  type FlowStage,
} from './practiceFlow'
import { initialFlowFocus, nextFlowAnchor } from '../lib/lineReview'
import {
  EMPTY_FLOW_MICRODRILL_ACTION_STATE,
  type Flashcard,
  type FlowMicroDrillPrimaryActionState,
  type MultipleChoiceSpecimenFocus,
  type PracticeFlowState,
} from '../lib/types'

export type FlowState = {
  flow: PracticeFlowState | null
  attempts: FlowAttempt[]
  historyLoading: boolean
  historyError: string
  microDrillAction: FlowMicroDrillPrimaryActionState
}

export const initialFlowState: FlowState = {
  flow: null,
  attempts: [],
  historyLoading: false,
  historyError: '',
  microDrillAction: EMPTY_FLOW_MICRODRILL_ACTION_STATE,
}

export const FLOW_HISTORY_UNAVAILABLE = 'Previous attempts are unavailable; this flow will adapt from the current run.'

export type FlowAction =
  | { type: 'historyRequested' }
  | { type: 'historyLoaded'; attempts: FlowAttempt[] }
  | { type: 'historyFailed' }
  | { type: 'attemptsRecorded'; attempts: FlowAttempt[] }
  | { type: 'flowChanged'; flow: PracticeFlowState }
  | { type: 'focusChanged'; focus: MultipleChoiceSpecimenFocus }
  | { type: 'stopped' }
  | { type: 'microDrillActionChanged'; state: FlowMicroDrillPrimaryActionState }

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'historyRequested':
      return { ...state, historyLoading: true, historyError: '' }
    case 'historyLoaded':
      return { ...state, historyLoading: false, attempts: mergeFlowAttempts(state.attempts, action.attempts) }
    case 'historyFailed':
      return { ...state, historyLoading: false, historyError: FLOW_HISTORY_UNAVAILABLE }
    case 'attemptsRecorded':
      return { ...state, attempts: mergeFlowAttempts(state.attempts, action.attempts) }
    case 'flowChanged':
      return { ...state, flow: action.flow, microDrillAction: EMPTY_FLOW_MICRODRILL_ACTION_STATE }
    case 'focusChanged':
      return state.flow ? { ...state, flow: { ...state.flow, focus: action.focus } } : state
    case 'stopped':
      return { ...state, flow: null, microDrillAction: EMPTY_FLOW_MICRODRILL_ACTION_STATE }
    case 'microDrillActionChanged':
      return { ...state, microDrillAction: action.state }
  }
}

export type FlowMove = { flow: PracticeFlowState }

export const anchorAttempts = (attempts: FlowAttempt[], anchorCardId: string) =>
  attempts.filter((attempt) => attempt.anchorCardId === anchorCardId)

/** A new flow on `card` from the configured sequence (or adaptively, from its history). */
export function planFlowStart(config: FlowConfig, card: Flashcard, history: FlowAttempt[], runId: string, random = Math.random): FlowMove {
  const first = nextFlowStep(config, 0, random, history)
  return {
    flow: {
      anchorCardId: card.id,
      anchorTitle: card.title,
      ...first,
      config: structuredClone(config),
      step: 0,
      runId,
      focus: initialFlowFocus(card),
      completedAnchorIds: [],
    },
  }
}

/** Advance the flow, moving an adaptive run to the next card once its anchor is mastered. */
export function planFlowAdvance(
  flow: PracticeFlowState,
  deck: Flashcard[],
  attempts: FlowAttempt[],
  random = Math.random,
): FlowMove & { newAnchor: Flashcard | null } {
  const step = flow.step + 1
  const history = anchorAttempts(attempts, flow.anchorCardId)
  if (flow.config.mode === 'adaptive' && summarizeFlowMastery(history).mastered) {
    const anchor = nextFlowAnchor(deck, flow.anchorCardId, flow.completedAnchorIds)
    if (anchor) {
      return {
        newAnchor: anchor,
        flow: {
          ...flow,
          anchorCardId: anchor.id,
          anchorTitle: anchor.title,
          stage: 'recall',
          cycle: flow.cycle + 1,
          step,
          focus: initialFlowFocus(anchor),
          completedAnchorIds: [...flow.completedAnchorIds, flow.anchorCardId],
        },
      }
    }
  }
  const next = nextFlowStep(flow.config, step, random, history)
  return { newAnchor: null, flow: { ...flow, ...next, step } }
}

/** Jump the running flow directly to a modality. */
export function planStageJump(flow: PracticeFlowState, stage: FlowStage): FlowMove {
  return { flow: { ...flow, stage, step: flow.step + 1 } }
}

/** Start an adaptive flow on `card` directly at a chosen modality. */
export function planFlowAtStage(config: FlowConfig, card: Flashcard, stage: FlowStage, runId: string): FlowMove {
  const adaptive: FlowConfig = { ...structuredClone(config), mode: 'adaptive' }
  return {
    flow: {
      anchorCardId: card.id,
      anchorTitle: card.title,
      stage,
      cycle: 1,
      config: adaptive,
      step: 0,
      runId,
      focus: initialFlowFocus(card),
      completedAnchorIds: [],
    },
  }
}

/** The Flow panel's one-line status. */
export function flowStatusText(flow: PracticeFlowState | null, mastery: FlowMasterySummary, historyLoading: boolean): string {
  if (!flow) return historyLoading ? 'Loading prior attempts…' : 'Choose Adaptive to sequence from prior results and cross-modality weaknesses.'
  const stage = FLOW_LABELS[flow.stage]
  if (flow.config.mode === 'adaptive') {
    const phase = mastery.phase === 'mastered' ? 'Mastered' : mastery.phase[0].toUpperCase() + mastery.phase.slice(1)
    return `${phase} · ${mastery.proficiency}% proficiency · evidence across ${mastery.successfulModalities} modalities · ${stage}`
  }
  if (flow.config.mode === 'random') return `Rep ${flow.step + 1} · ${stage}. The next modality is chosen when you continue.`
  const length = expandFlow(flow.config.blocks).length
  return `Cycle ${flow.cycle} · Rep ${flow.step % length + 1} of ${length} · ${stage}`
}
