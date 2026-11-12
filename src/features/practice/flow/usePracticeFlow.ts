import { useCallback, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { buildFlowGenerationContext, mergeFlowAttempts, saveFlowConfig, summarizeFlowMastery, type FlowAttempt, type FlowConfig, type FlowStage, type SubmissionModality } from './practiceFlow'
import {
  anchorAttempts,
  flowReducer,
  flowStatusText,
  initialFlowState,
  planFlowAdvance,
  planFlowAtStage,
  planFlowStart,
  planStageJump,
  type FlowMove,
} from './flowReducer'
import { compactFeedbackItems, flowEvaluationScore, flowEvaluationWeaknesses, flowModalityWeakness, requestFlowAttemptHistory } from './flowHistory'
import { createInteractionId } from '../lib/lineReview'
import { type Flashcard, type FlowMicroDrillPrimaryActionState, type MultipleChoiceSpecimenFocus, type SubmissionSaveResponse } from '../lib/types'

/**
 * The flow's state and evidence. Kept apart from the controls below because the page needs the
 * flow (to pick its card) before it has what the controls need (that card, the deck, the session).
 */
export function usePracticeFlowState() {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState)
  // Bumped by every flow change; an async step that sees a newer version abandons itself.
  const versionRef = useRef(0)
  // The committed state, for async steps that resume after an await.
  const latestRef = useRef(state)
  useLayoutEffect(() => {
    latestRef.current = state
  })

  const { flow } = state
  const currentAttempts = useMemo(() => (flow ? anchorAttempts(state.attempts, flow.anchorCardId) : []), [flow, state.attempts])
  const mastery = useMemo(() => summarizeFlowMastery(currentAttempts), [currentAttempts])
  const generationContext = useMemo(() => buildFlowGenerationContext(currentAttempts), [currentAttempts])

  /** Load ``card``'s earlier attempts into the evidence and return them; falls back to what is known. */
  const loadHistory = async (card: Flashcard) => {
    dispatch({ type: 'historyRequested' })
    try {
      const loaded = await requestFlowAttemptHistory(card)
      dispatch({ type: 'historyLoaded', attempts: loaded })
      return anchorAttempts(mergeFlowAttempts(latestRef.current.attempts, loaded), card.id)
    } catch {
      dispatch({ type: 'historyFailed' })
      return anchorAttempts(latestRef.current.attempts, card.id)
    }
  }

  /** The flow context sent with each attempt; undefined outside a flow. */
  const signals = (): Record<string, unknown> | undefined => flow
    ? {
        runId: flow.runId,
        anchorCardId: flow.anchorCardId,
        anchorTitle: flow.anchorTitle,
        stage: flow.stage,
        step: flow.step,
        cycle: flow.cycle,
        phase: mastery.phase,
        proficiency: mastery.proficiency,
        successfulModalities: mastery.successfulModalities,
        weaknessSummary: mastery.weaknesses.join('; '),
        completedAnchorCount: flow.completedAnchorIds.length,
      }
    : undefined

  /** Add a saved attempt to the evidence that steers an adaptive flow. */
  const recordSubmission = ({ response, flowSignals, modality, modalitySignals, elapsedMs, interactionId, question }: {
    response: SubmissionSaveResponse
    flowSignals: Record<string, unknown>
    modality: SubmissionModality
    modalitySignals: Record<string, unknown>
    elapsedMs: number
    interactionId: string
    question: string
  }) => {
    const anchorCardId = String(flowSignals.anchorCardId ?? '')
    if (!anchorCardId || !response.saved) return
    const missedLineCount = Number(modalitySignals.missedLineCount ?? 0)
    const evaluation = response.evaluation as unknown as Record<string, unknown>
    const attempt: FlowAttempt = {
      attemptId: response.attemptId,
      interactionId,
      anchorCardId,
      modality,
      successful: response.successful,
      score: flowEvaluationScore(evaluation),
      elapsedMs,
      missedLineCount: Number.isFinite(missedLineCount) ? Math.max(0, missedLineCount) : 0,
      weaknesses: compactFeedbackItems([
        ...flowEvaluationWeaknesses(evaluation, missedLineCount),
        flowModalityWeakness(modality, response.successful),
      ]),
      question,
      createdAt: new Date().toISOString(),
    }
    dispatch({ type: 'attemptsRecorded', attempts: [attempt] })
  }

  const setMicroDrillAction = useCallback(
    (microDrill: FlowMicroDrillPrimaryActionState) => dispatch({ type: 'microDrillActionChanged', state: microDrill }),
    [],
  )
  const setFocus = (focus: MultipleChoiceSpecimenFocus) => dispatch({ type: 'focusChanged', focus })

  return { ...state, state, dispatch, versionRef, latestRef, currentAttempts, mastery, generationContext, loadHistory, signals, recordSubmission, setMicroDrillAction, setFocus }
}

export type PracticeFlowStateApi = ReturnType<typeof usePracticeFlowState>

/** `start`: a flow began; `move`: it changed stage or card; `stop`: it ended. */
export type FlowChange = 'start' | 'move' | 'stop'

/** Starting, advancing, switching and stopping a flow without an intermediate card. */
export function usePracticeFlowControls(
  flowState: PracticeFlowStateApi,
  options: {
    config: FlowConfig
    card: Flashcard
    deck: Flashcard[]
    /** A recall deck is loaded and the session is not finished. */
    canStart: boolean
    onChange: (change: FlowChange) => void
  },
) {
  const { flow, dispatch, versionRef, latestRef, loadHistory } = flowState
  const { config, card, deck, canStart, onChange } = options

  const apply = (move: FlowMove, change: FlowChange) => {
    dispatch({ type: 'flowChanged', flow: move.flow })
    onChange(change)
  }

  const start = async () => {
    const started = ++versionRef.current
    if (!canStart) return
    saveFlowConfig(config)
    const history = await loadHistory(card)
    if (versionRef.current !== started) return
    apply(planFlowStart(config, card, history, createInteractionId()), 'start')
  }

  const stop = () => {
    versionRef.current += 1
    dispatch({ type: 'stopped' })
    onChange('stop')
  }

  const advance = async () => {
    if (!flow) return
    const advanced = ++versionRef.current
    const move = planFlowAdvance(flow, deck, latestRef.current.attempts)
    if (move.newAnchor) {
      await loadHistory(move.newAnchor)
      if (versionRef.current !== advanced) return
    }
    apply(move, 'move')
  }

  const activateStage = async (stage: FlowStage) => {
    if (!canStart || flow?.stage === stage) return
    const activated = ++versionRef.current
    if (flow) {
      apply(planStageJump(flow, stage), 'move')
      return
    }
    await loadHistory(card)
    if (versionRef.current !== activated) return
    apply(planFlowAtStage(config, card, stage, createInteractionId()), 'start')
  }

  return { start, stop, advance, activateStage, statusText: flowStatusText(flow, flowState.mastery, flowState.historyLoading) }
}
