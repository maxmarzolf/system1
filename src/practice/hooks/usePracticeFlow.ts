import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { matchesHotkey, type PracticeFlowStage } from '../../hotkeys'
import { buildFlowGenerationContext, mergeFlowAttempts, saveFlowConfig, summarizeFlowMastery, type FlowAttempt, type FlowConfig, type SubmissionModality } from '../../practiceFlow'
import {
  anchorAttempts,
  buildTransition,
  flowReducer,
  flowStatusText,
  initialFlowState,
  isTransitionReady,
  planFlowAdvance,
  planFlowAtStage,
  planFlowStart,
  planStageJump,
  type FlowMove,
} from '../flowReducer'
import { compactFeedbackItems, flowEvaluationScore, flowEvaluationWeaknesses, flowModalityWeakness, requestFlowAttemptHistory } from '../flowHistory'
import { createInteractionId } from '../lineReview'
import { FLOW_TRANSITION_MINIMUM_MS, FLOW_TRANSITION_SETTLE_MS, type Flashcard, type FlowMicroDrillPrimaryActionState, type MultipleChoiceSpecimenFocus, type SubmissionSaveResponse } from '../types'

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

/** ``start``: a flow began; ``move``: it changed stage or card; ``stop``: it ended. */
export type FlowChange = 'start' | 'move' | 'stop'

/**
 * Starting, advancing, jumping and stopping the flow, plus the transition card's timing and the
 * stage hotkeys. ``onChange`` lets the page reset the card on screen for each change.
 */
export function usePracticeFlowControls(
  flowState: PracticeFlowStateApi,
  options: {
    config: FlowConfig
    card: Flashcard
    deck: Flashcard[]
    /** A recall deck is loaded and the session is not finished. */
    canStart: boolean
    onChange: (change: FlowChange) => void
    stageReady: { recallTyping: boolean; mcqLoaded: boolean; mcqFailed: boolean }
    /** The transition card has gone; ``toStage`` is now on screen. */
    onSettled: (toStage: PracticeFlowStage) => void
  },
) {
  const { flow, transition, dispatch, versionRef, latestRef, loadHistory } = flowState
  const { config, card, deck, canStart, onChange } = options

  const apply = (move: FlowMove, change: FlowChange) => {
    dispatch({ type: 'transitionStarted', transition: buildTransition(move.transition, createInteractionId(), Date.now()) })
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
    if (!flow || transition) return
    const advanced = ++versionRef.current
    const move = planFlowAdvance(flow, deck, latestRef.current.attempts)
    if (!move.newAnchor) {
      apply(move, 'move')
      return
    }
    // A new anchor: announce it now, and switch once its history is in.
    dispatch({ type: 'transitionStarted', transition: buildTransition(move.transition, createInteractionId(), Date.now()) })
    await loadHistory(move.newAnchor)
    if (versionRef.current !== advanced) return
    dispatch({ type: 'flowChanged', flow: move.flow })
    onChange('move')
  }

  const activateStage = async (stage: PracticeFlowStage) => {
    if (!canStart || transition) return
    const activated = ++versionRef.current
    if (flow) {
      apply(planStageJump(flow, stage, latestRef.current.attempts), 'move')
      return
    }
    const anchor = card
    const history = await loadHistory(anchor)
    if (versionRef.current !== activated) return
    apply(planFlowAtStage(config, anchor, stage, history, createInteractionId()), 'start')
  }

  // Stage hotkeys work from anywhere on the page, flow or not.
  const activateFromHotkey = useEffectEvent((stage: PracticeFlowStage) => void activateStage(stage))
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.shiftKey) return
      const stage: PracticeFlowStage | null = matchesHotkey(event, 'flow-full-recall') ? 'recall'
        : matchesHotkey(event, 'flow-targeted-ghost') ? 'ghost'
          : matchesHotkey(event, 'flow-targeted-mcq') ? 'multiple-choice'
            : matchesHotkey(event, 'flow-targeted-microdrill') ? 'microdrill'
              : null
      if (!stage) return
      event.preventDefault()
      event.stopPropagation()
      activateFromHotkey(stage)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  // The transition card stays up for a minimum time, then fades once the next stage is ready.
  const ready = isTransitionReady(flowState.state, options.stageReady)
  const settled = useEffectEvent((toStage: PracticeFlowStage) => options.onSettled(toStage))
  useEffect(() => {
    if (!transition || !ready) return
    const { id, startedAt, toStage } = transition
    let settleTimeout: number | undefined
    const readyTimeout = window.setTimeout(() => {
      dispatch({ type: 'transitionSettling', id })
      settleTimeout = window.setTimeout(() => {
        dispatch({ type: 'transitionFinished', id })
        settled(toStage)
      }, FLOW_TRANSITION_SETTLE_MS)
    }, Math.max(0, FLOW_TRANSITION_MINIMUM_MS - (Date.now() - startedAt)))
    return () => {
      window.clearTimeout(readyTimeout)
      if (settleTimeout !== undefined) window.clearTimeout(settleTimeout)
    }
  }, [dispatch, ready, transition])

  return { start, stop, advance, activateStage, statusText: flowStatusText(flow, flowState.mastery, flowState.historyLoading) }
}
