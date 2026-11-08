/**
 * The practice flow as data: where it is (anchor card, stage, step), the coach's transition card
 * between stages, and the evidence (attempts) that drives an adaptive flow. Everything here is
 * pure; practice/hooks/usePracticeFlow.ts runs the effects (history requests, timers, hotkeys).
 */
import {
  FLOW_LABELS,
  buildFlowTransitionCopy,
  expandFlow,
  mergeFlowAttempts,
  nextFlowStep,
  summarizeFlowMastery,
  type FlowAttempt,
  type FlowConfig,
  type FlowMasterySummary,
  type FlowStage,
} from '../practiceFlow'
import { initialFlowFocus, nextFlowAnchor } from './lineReview'
import {
  EMPTY_FLOW_MICRODRILL_ACTION_STATE,
  type Flashcard,
  type FlowMicroDrillPrimaryActionState,
  type MultipleChoiceSpecimenFocus,
  type PracticeFlowState,
  type PracticeFlowTransitionState,
} from './types'

export type FlowState = {
  flow: PracticeFlowState | null
  transition: PracticeFlowTransitionState | null
  /** The transition card that is fading out. */
  settlingId: string | null
  attempts: FlowAttempt[]
  historyLoading: boolean
  historyError: string
  microDrillAction: FlowMicroDrillPrimaryActionState
}

export const initialFlowState: FlowState = {
  flow: null,
  transition: null,
  settlingId: null,
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
  | { type: 'transitionStarted'; transition: PracticeFlowTransitionState }
  | { type: 'flowChanged'; flow: PracticeFlowState }
  | { type: 'focusChanged'; focus: MultipleChoiceSpecimenFocus }
  | { type: 'stopped' }
  | { type: 'transitionSettling'; id: string }
  | { type: 'transitionFinished'; id: string }
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
    case 'transitionStarted':
      return { ...state, transition: action.transition, settlingId: null, microDrillAction: EMPTY_FLOW_MICRODRILL_ACTION_STATE }
    case 'flowChanged':
      return { ...state, flow: action.flow }
    case 'focusChanged':
      return state.flow ? { ...state, flow: { ...state.flow, focus: action.focus } } : state
    case 'stopped':
      return { ...state, flow: null, transition: null, settlingId: null }
    case 'transitionSettling':
      return { ...state, settlingId: action.id }
    case 'transitionFinished':
      return {
        ...state,
        transition: state.transition?.id === action.id ? null : state.transition,
        settlingId: state.settlingId === action.id ? null : state.settlingId,
      }
    case 'microDrillActionChanged':
      return { ...state, microDrillAction: action.state }
  }
}

/** What the coach's transition card announces: from which stage to which, and why. */
export type TransitionRequest = {
  fromStage: FlowStage | null
  toStage: FlowStage
  anchorCardId: string
  step: number
  mode: FlowConfig['mode']
  latestAttempt?: FlowAttempt
  newAnchor?: boolean
}

export function buildTransition(request: TransitionRequest, id: string, startedAt: number): PracticeFlowTransitionState {
  const { fromStage, toStage, anchorCardId, step, mode, latestAttempt, newAnchor = false } = request
  return { id, fromStage, toStage, anchorCardId, step, startedAt, ...buildFlowTransitionCopy({ fromStage, toStage, mode, latestAttempt, newAnchor }) }
}

export type FlowMove = { flow: PracticeFlowState; transition: TransitionRequest }

export const anchorAttempts = (attempts: FlowAttempt[], anchorCardId: string) =>
  attempts.filter((attempt) => attempt.anchorCardId === anchorCardId)

/** A new flow on ``card`` from the configured sequence (or adaptively, from its history). */
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
    transition: { fromStage: null, toStage: first.stage, anchorCardId: card.id, step: 0, mode: config.mode },
  }
}

/**
 * The next rep. An adaptive flow that has mastered its anchor moves to the next card in the deck
 * (`newAnchor`), starting again from recall; otherwise the flow picks the next stage.
 */
export function planFlowAdvance(
  flow: PracticeFlowState,
  deck: Flashcard[],
  attempts: FlowAttempt[],
  random = Math.random,
): FlowMove & { newAnchor: Flashcard | null } {
  const step = flow.step + 1
  const history = anchorAttempts(attempts, flow.anchorCardId)
  const latestAttempt = history.at(-1)
  const mode = flow.config.mode
  if (mode === 'adaptive' && summarizeFlowMastery(history).mastered) {
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
        transition: { fromStage: flow.stage, toStage: 'recall', anchorCardId: anchor.id, step, mode, latestAttempt, newAnchor: true },
      }
    }
  }
  const next = nextFlowStep(flow.config, step, random, history)
  return {
    newAnchor: null,
    flow: { ...flow, ...next, step },
    transition: { fromStage: flow.stage, toStage: next.stage, anchorCardId: flow.anchorCardId, step, mode, latestAttempt },
  }
}

/** Jump the running flow to ``stage`` (the stage hotkeys). */
export function planStageJump(flow: PracticeFlowState, stage: FlowStage, attempts: FlowAttempt[]): FlowMove {
  const step = flow.step + 1
  return {
    flow: { ...flow, stage, step },
    transition: {
      fromStage: flow.stage,
      toStage: stage,
      anchorCardId: flow.anchorCardId,
      step,
      mode: flow.config.mode,
      latestAttempt: anchorAttempts(attempts, flow.anchorCardId).at(-1),
    },
  }
}

/** Start an adaptive flow on ``card`` directly at ``stage`` (a stage hotkey with no flow running). */
export function planFlowAtStage(config: FlowConfig, card: Flashcard, stage: FlowStage, history: FlowAttempt[], runId: string): FlowMove {
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
    transition: { fromStage: null, toStage: stage, anchorCardId: card.id, step: 0, mode: 'adaptive', latestAttempt: history.at(-1) },
  }
}

/**
 * Whether the stage behind the transition card is ready to show: recall is typing, the targeted
 * MCQ loaded (or failed), or the microdrill for this rep is ready (or failed).
 */
export function isTransitionReady(
  state: FlowState,
  stage: { recallTyping: boolean; mcqLoaded: boolean; mcqFailed: boolean },
): boolean {
  const { flow, transition, microDrillAction } = state
  if (!transition || !flow) return false
  if (flow.anchorCardId !== transition.anchorCardId || flow.step !== transition.step || flow.stage !== transition.toStage) return false
  if (transition.toStage === 'recall' || transition.toStage === 'ghost') return stage.recallTyping
  if (transition.toStage === 'multiple-choice') return stage.mcqLoaded || stage.mcqFailed
  return microDrillAction.interactionKey === `${flow.runId}-${flow.step}` && (microDrillAction.ready || microDrillAction.failed)
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
