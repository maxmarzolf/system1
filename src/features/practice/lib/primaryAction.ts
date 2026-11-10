import type { FlowStage } from '../flow/practiceFlow'
import type { FlowMicroDrillPrimaryActionState, PracticeMode } from './types'

/** What the card's primary button does; the page maps each kind to its handler and icon. */
export type PrimaryActionKind =
  | 'flow-next'
  | 'microdrill-submit'
  | 'mcq-submit'
  | 'recall-start'
  | 'recall-submit'
  | 'ghost-repeat'
  | 'recall-revise'

export type PrimaryAction = { kind: PrimaryActionKind; label: string; disabled: boolean }

/** Recall, Ghost and MCQ start and submit by keyboard only (Mod+Shift+Enter): no button is drawn. */
const KEY_ONLY_ACTIONS = new Set<PrimaryActionKind>(['mcq-submit', 'recall-start', 'recall-submit', 'ghost-repeat', 'recall-revise'])
export const isKeyOnlyAction = (kind: PrimaryActionKind) => KEY_ONLY_ACTIONS.has(kind)

export type PrimaryActionState = {
  ladderActive: boolean
  flowStage: FlowStage | null
  /** The microdrill card's own state, already matched to the current rep. */
  microDrill: FlowMicroDrillPrimaryActionState
  hasDeck: boolean
  practiceMode: PracticeMode
  mainPhase: 'preview' | 'typing' | 'submitted'
  coachLoading: boolean
  mcqSubmitted: boolean
  mcqSelected: boolean
  mcqGrading: boolean
  hasAnsweredCurrent: boolean
  sessionFinished: boolean
  latestSubmittedWasGhostRep: boolean
  recallEvaluationPending: boolean
  recallInputEmpty: boolean
  mainCloseEnough: boolean
}

/** The primary button for the current card, or null when there is nothing to press. */
export function resolvePrimaryAction(state: PrimaryActionState): PrimaryAction | null {
  const inFlow = state.flowStage !== null
  if (state.ladderActive) return null
  if (state.flowStage === 'microdrill') {
    const drill = state.microDrill
    if (drill.submitted) return { kind: 'flow-next', label: 'Next', disabled: false }
    return { kind: 'microdrill-submit', label: 'Submit', disabled: !drill.ready || !drill.complete || drill.saving }
  }
  if (!state.hasDeck) return null
  if (inFlow && state.practiceMode === 'recall' && state.mainPhase === 'submitted') {
    return { kind: 'flow-next', label: 'Next', disabled: state.coachLoading }
  }
  if (state.practiceMode === 'multiple-choice') {
    if (inFlow && state.mcqSubmitted) return { kind: 'flow-next', label: 'Next', disabled: state.sessionFinished }
    if (state.mcqSubmitted) return null
    return {
      kind: 'mcq-submit',
      label: state.mcqGrading ? 'Grading…' : 'Submit',
      disabled: !state.mcqSelected || state.hasAnsweredCurrent || state.sessionFinished || state.mcqGrading,
    }
  }
  if (state.mainPhase === 'preview') {
    return { kind: 'recall-start', label: 'Start', disabled: state.hasAnsweredCurrent || state.sessionFinished }
  }
  if (state.mainPhase === 'typing') {
    return { kind: 'recall-submit', label: 'Submit', disabled: state.recallEvaluationPending || state.recallInputEmpty }
  }
  if (state.latestSubmittedWasGhostRep) return { kind: 'ghost-repeat', label: 'Submit', disabled: state.sessionFinished }
  if (!state.mainCloseEnough) return { kind: 'recall-revise', label: 'Submit', disabled: state.sessionFinished }
  return null
}
