import { useEffect, useRef, useState } from 'react'
import type { RecallCodeEditorHandle } from '../../RecallCodeEditor'
import { normalizeTyping } from '../inlineNotes'
import { computeLineReview, createInteractionId, extractFlowGhostFocusedInput, firstIncompleteGhostLineNumber, nextGhostLineNumber, summarizeRecallAttempt } from '../lineReview'
import { rejectionReason } from '../requests'
import type { AttemptPayload, MultipleChoiceSpecimenFocus, RecallAttemptSnapshot, SubmissionFailureModalState, SubmissionSaveResponse, SupportLayer, TemplateMode } from '../types'

const EMPTY_HISTORY: RecallAttemptSnapshot[] = []

export type RecallPhase = 'preview' | 'typing' | 'submitted'
type LineReviews = ReturnType<typeof computeLineReview>['reviews']

export type RecallSubmitted = {
  sound: boolean
  closeEnough: boolean
  isGhostRep: boolean
  elapsedMs: number
  lineReviews: LineReviews
}

export type RecallAttemptOptions = {
  /** No deck, already answered, or the session is over: the attempt cannot start or change. */
  blocked: boolean
  /** Recall is the mode on screen (submitting is ignored otherwise). */
  active: boolean
  /** The flow's targeted lines when a flow is running; a ghost stage traces only these. */
  flowFocus: MultipleChoiceSpecimenFocus | null
  ghostStage: boolean
  /** The ghost stage's starting text: the target with the missed lines blanked. */
  ghostScaffold: string
  supportLayer: SupportLayer
  inlineEnabled: boolean
  target: string
  templateMode: TemplateMode
  /** Groups attempts on the same card and settings, for the attempt history. */
  historyKey: string
  providerLabel: string
  save: (payload: AttemptPayload) => Promise<SubmissionSaveResponse>
  /** Bumped whenever the flow moves on; a response that arrives after a bump is ignored. */
  flowVersion: { readonly current: number }
  onSubmitted: (result: RecallSubmitted) => void
}

/**
 * Typing a card from memory: preview, typing, submitted. Owns the editor's focus, the Inline
 * helper's progress, the attempt history per card, and the coach's verdict on each submission.
 */
export function useRecallAttempt(options: RecallAttemptOptions) {
  const { blocked, flowFocus, ghostStage, ghostScaffold } = options
  const [phase, setPhase] = useState<RecallPhase>('preview')
  const [input, setInput] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [closeEnough, setCloseEnough] = useState(false)
  const [inlineTaskProgress, setInlineTaskProgress] = useState(0)
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined)
  const [interactionId, setInteractionId] = useState('')
  const [aiCompletionShown, setAiCompletionShown] = useState(false)
  const [aiCompletionStatus, setAiCompletionStatus] = useState('')
  const [historyByKey, setHistoryByKey] = useState<Record<string, RecallAttemptSnapshot[]>>({})
  const [feedbackByKey, setFeedbackByKey] = useState<Record<string, object>>({})
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState('')
  const [failure, setFailure] = useState<SubmissionFailureModalState | null>(null)
  const editorRef = useRef<RecallCodeEditorHandle | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const pending = useRef(false)
  const focusOnType = useRef(false)
  const pendingGhostLine = useRef<number | null>(null)

  const missedLines = flowFocus?.missedLines ?? []
  const submissionInput = ghostStage ? extractFlowGhostFocusedInput(input, missedLines) : normalizeTyping(input)
  const history = historyByKey[options.historyKey] ?? EMPTY_HISTORY
  const feedback = feedbackByKey[options.historyKey] ?? null
  const latest = phase === 'submitted' ? history[history.length - 1] ?? null : null

  /** The interaction this answer belongs to, minting one if typing never started it. */
  const ensureInteractionId = () => {
    const id = interactionId || createInteractionId()
    if (!interactionId) setInteractionId(id)
    return id
  }

  const reset = () => {
    setPhase('preview')
    setMinHeight(undefined)
    setInput('')
    setInlineTaskProgress(0)
    setStartedAt(null)
    setCloseEnough(false)
    setInteractionId('')
    setAiCompletionShown(false)
    setEvaluating(false)
    setError('')
    setFailure(null)
    focusOnType.current = false
    pendingGhostLine.current = null
  }

  /** Begin typing; a ghost stage starts from its scaffold with the cursor on the first gap. */
  const beginTyping = (startFromScaffold: boolean) => {
    setAiCompletionShown(false)
    focusOnType.current = true
    setPhase('typing')
    setStartedAt(Date.now())
    setInlineTaskProgress(0)
    if (startFromScaffold) {
      setInput(ghostScaffold)
      pendingGhostLine.current = firstIncompleteGhostLineNumber(ghostScaffold, missedLines)
    } else {
      setInput('')
      pendingGhostLine.current = null
    }
    setInteractionId(createInteractionId())
  }

  const start = () => {
    if (blocked) return
    if (previewRef.current) setMinHeight(previewRef.current.offsetHeight)
    beginTyping(ghostStage)
  }

  /** Another go at a submitted ghost rep. */
  const repeat = () => {
    if (blocked || phase !== 'submitted') return
    beginTyping(ghostStage)
    setCloseEnough(false)
    setError('')
    setFailure(null)
  }

  /** Back to typing with the submitted answer, to fix what fell short (outside a flow only). */
  const revise = () => {
    if (flowFocus || blocked || phase !== 'submitted' || closeEnough) return
    setAiCompletionShown(false)
    focusOnType.current = true
    setPhase('typing')
    setInlineTaskProgress((current) => Math.max(current, input.split('\n').filter((line) => line.trim().length > 0).length))
    setStartedAt(Date.now())
    setInteractionId(createInteractionId())
  }

  const change = (nextValue: string, context: { cursorLineNumber: number }) => {
    if (phase !== 'typing') return
    setInput(nextValue)
    if (options.inlineEnabled && options.supportLayer !== 'ghost-reps') {
      const completedLines = nextValue
        .split('\n')
        .slice(0, Math.max(context.cursorLineNumber - 1, 0))
        .filter((line) => line.trim().length > 0)
        .length
      setInlineTaskProgress((current) => Math.max(current, completedLines))
    }
  }

  /** In a ghost stage, Enter jumps to the next targeted line. */
  const onEnterKey = (context: { value: string; cursorLineNumber: number }) => {
    if (!ghostStage || phase !== 'typing') return false
    const nextLine = nextGhostLineNumber(context.cursorLineNumber, context.value, missedLines)
    if (!nextLine) return false
    editorRef.current?.focusLine(nextLine)
    return true
  }

  const submit = async () => {
    if (!options.active || blocked || phase !== 'typing' || pending.current) return
    const { target, supportLayer } = options
    const id = ensureInteractionId()
    const elapsedMs = Math.max(Date.now() - (startedAt ?? Date.now()), 1)
    const inputLines = submissionInput.split('\n')
    const isGhostRep = supportLayer === 'ghost-reps'
    const lineReviews = computeLineReview(target, submissionInput).reviews
    const missedLineCount = lineReviews.filter((line) => line.status !== 'match').length
    const nonEmpty = (lines: string[]) => lines.filter((line) => line.trim().length > 0).length
    const version = options.flowVersion.current
    const isCurrent = () => options.flowVersion.current === version
    pending.current = true
    if (!isGhostRep) {
      setEvaluating(true)
      setError('')
      setFailure(null)
    }
    let rejection = ''
    const submission = await options.save({
      mode: 'main-recall',
      correctAnswer: target,
      userAnswer: submissionInput,
      elapsedMs,
      interactionId: id,
      templateMode: options.templateMode,
      supportLayer,
      // AI assistance is persisted through the existing readiness signal.
      liveCoachUsed: aiCompletionShown,
      modality: isGhostRep ? 'ghost-rep' : 'total-recall',
      signals: {
        modality: {
          exact: submissionInput === target,
          aiCompletionShown,
          targetLineCount: nonEmpty(target.split('\n')),
          submittedLineCount: nonEmpty(inputLines),
          missedLineCount,
          ...(isGhostRep && flowFocus ? { focusedLineNumbers: flowFocus.missedLines.map((line) => line.lineNumber) } : {}),
        },
      },
    })
      .catch((caught: unknown) => {
        rejection = rejectionReason(caught)
        return null
      })
      .finally(() => {
        pending.current = false
        if (isCurrent()) setEvaluating(false)
      })
    if (!isCurrent()) return
    if (flowFocus && !submission?.saved) {
      setError(rejection ? `Your rep could not be saved: ${rejection}` : 'Your rep could not be saved. Submit again to continue.')
      return
    }
    const sound = submission?.successful ?? submissionInput === target
    if (!isGhostRep) {
      if (!submission) {
        setError(rejection ? `This attempt was rejected: ${rejection}` : 'Submission evaluation unavailable for this attempt.')
      }
      if (submission?.feedbackUnavailable) {
        setFailure({ providerLabel: options.providerLabel, message: submission.feedbackUnavailable.message })
      }
    }
    const nowCloseEnough = !isGhostRep && sound
    const key = options.historyKey
    const evaluatedFeedback = submission?.evaluation.feedback
    if (!isGhostRep && evaluatedFeedback && Object.keys(evaluatedFeedback).length > 0) {
      setFeedbackByKey((previous) => ({ ...previous, [key]: evaluatedFeedback }))
    }
    const snapshot = summarizeRecallAttempt(inputLines, sound, elapsedMs, history.length + 1, supportLayer)
    setCloseEnough(nowCloseEnough)
    setPhase('submitted')
    setHistoryByKey((previous) => ({ ...previous, [key]: [...(previous[key] ?? []), snapshot] }))
    options.onSubmitted({ sound, closeEnough: nowCloseEnough, isGhostRep, elapsedMs, lineReviews })
  }

  // Put the cursor where typing starts: a ghost stage's first gap, or the end of the text.
  useEffect(() => {
    if (phase !== 'typing') return
    const ghostLine = pendingGhostLine.current
    if (ghostLine !== null) {
      pendingGhostLine.current = null
      focusOnType.current = false
      window.requestAnimationFrame(() => editorRef.current?.focusLine(ghostLine))
      return
    }
    if (!focusOnType.current) return
    focusOnType.current = false
    window.requestAnimationFrame(() => editorRef.current?.focusEnd())
  }, [phase, input])

  return {
    phase,
    input,
    submissionInput,
    closeEnough,
    inlineTaskProgress,
    minHeight,
    aiCompletionShown,
    aiCompletionStatus,
    history,
    feedback,
    latest,
    evaluating,
    error,
    failure,
    editorRef,
    previewRef,
    ensureInteractionId,
    reset,
    resetHistory: () => { setHistoryByKey({}); setFeedbackByKey({}) },
    start,
    repeat,
    revise,
    change,
    onEnterKey,
    submit,
    dismissFailure: () => setFailure(null),
    markAiCompletionShown: () => setAiCompletionShown(true),
    setAiCompletionStatus,
  }
}

export type RecallAttempt = ReturnType<typeof useRecallAttempt>
