import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { FLOW_COACH_LABELS, type FlowGenerationContext } from './practiceFlow'
import { api, unwrap } from '@/api/client'
import type { AppTheme } from '@/app/theme'
import { createInteractionId } from '../lib/lineReview'
import { MicroDrillBlankEditor, MicroDrillInstructions } from '../components/markdown'
import type { FlowMicroDrill, FlowMicroDrillPrimaryActionState, PracticeFlowTransitionState, SubmissionSaveResponse } from '../lib/types'

export function FlowMicroDrillCard({ title, prompt, target, focus, rep, context, provider, theme, syntaxTheme, actionKey, onSave, primaryActionRef, onPrimaryActionStateChange }: {
  title: string; prompt: string; target: string; focus: string; rep: number; provider: string
  context: FlowGenerationContext
  theme: AppTheme; syntaxTheme: Record<string, CSSProperties>
  actionKey: string
  onSave: (drill: FlowMicroDrill, answer: string, elapsedMs: number, interactionId: string) => Promise<SubmissionSaveResponse | null>
  primaryActionRef: { current: () => void }
  onPrimaryActionStateChange: (state: FlowMicroDrillPrimaryActionState) => void
}) {
  const [drill, setDrill] = useState<FlowMicroDrill | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [answer, setAnswer] = useState({ code: '', complete: false })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SubmissionSaveResponse | null>(null)
  const startedAt = useRef(Date.now())
  const savingRef = useRef(false)
  const interactionId = useRef(createInteractionId())
  const generationContext = useRef(context).current
  useEffect(() => {
    const controller = new AbortController()
    setDrill(null)
    setError('')
    void (async () => {
      try {
        const payload = unwrap(
          await api.POST('/api/coach/micro-drill', {
            signal: controller.signal,
            body: { cardTitle: title, prompt, target, focus, rep, ...generationContext, llmProvider: provider },
          }),
          'Microdrill generation failed. Try again.',
        )
        if (!controller.signal.aborted) {
          setDrill(payload as unknown as FlowMicroDrill)
          startedAt.current = Date.now()
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to generate microdrill.')
      }
    })()
    return () => controller.abort()
  }, [title, prompt, target, focus, rep, generationContext, provider, retry])

  const submit = async () => {
    if (!drill || !answer.complete || savingRef.current || result) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const saved = await onSave(drill, answer.code, Math.max(1, Date.now() - startedAt.current), interactionId.current)
      if (!saved || !saved.saved) throw new Error('Your rep could not be saved. Please try again.')
      setResult(saved)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to submit microdrill.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  useEffect(() => {
    primaryActionRef.current = () => {
      void submit()
    }
    return () => {
      primaryActionRef.current = () => undefined
    }
  })

  useEffect(() => {
    onPrimaryActionStateChange({
      interactionKey: actionKey,
      ready: Boolean(drill),
      failed: Boolean(error && !drill),
      complete: answer.complete,
      saving,
      submitted: Boolean(result),
    })
  }, [actionKey, answer.complete, drill, error, onPrimaryActionStateChange, result, saving])

  return (
    <div className="card-grid micro-drill-card-grid drill-fade-in">
      <div className="panel prompt-surface-panel">
        <div className="prompt-surface-section">
          <div className="prompt-section-content">
            <span className="prompt-section-label">Microdrill · Rep {rep}</span>
            {drill ? <div className="prompt prompt-surface-body micro-drill-prompt"><MicroDrillInstructions text={drill.prompt} /></div> : !error && <p className="prompt prompt-surface-body" role="status">Preparing your microdrill…</p>}
            {error && <p className="prompt prompt-surface-body" role="alert">{error}</p>}
            {!drill && error && <button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Try again</button>}
            {result && <div className="submission-feedback-detail" role="status">
              <p>{result.evaluation.feedback.fullFeedback || (result.successful ? 'Sound. Rep complete.' : 'Rep logged. Review the focused decision before continuing.')}</p>
              {result.feedbackUnavailable && <p>{result.feedbackUnavailable.message}</p>}
            </div>}
          </div>
        </div>
      </div>
      {drill && <div className="panel micro-drill-answer-card">
        <span className="answer-label">Fill only the blanks</span>
        <MicroDrillBlankEditor template={drill.template} language={drill.language} theme={theme} syntaxTheme={syntaxTheme} onAnswerChange={setAnswer} disabled={saving || Boolean(result)} />
      </div>}
    </div>
  )
}

export function FlowCoachTransition({
  transition,
  settling,
}: {
  transition: PracticeFlowTransitionState
  settling: boolean
}) {
  const fromLabel = transition.fromStage ? FLOW_COACH_LABELS[transition.fromStage] : 'Start'
  const toLabel = FLOW_COACH_LABELS[transition.toStage]

  return (
    <section
      className={[
        'flow-transition-card',
        `flow-transition-card-${transition.toStage}`,
        settling ? 'flow-transition-card-settling' : '',
      ].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-label={`Coach transition to ${toLabel}`}
    >
      <div className="flow-transition-topline">
        <span className="flow-transition-eyebrow">Coach · Next modality</span>
        <div className="flow-transition-route" aria-label={`${fromLabel} to ${toLabel}`}>
          <span>{fromLabel}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 5.25 6.75 6.75L9 18.75" />
          </svg>
          <strong>{toLabel}</strong>
        </div>
      </div>
      <div className="flow-transition-copy">
        <h2>{transition.headline}</h2>
        <p>{transition.detail}</p>
      </div>
      <div className="flow-transition-status">
        <span className="flow-transition-status-dot" aria-hidden="true" />
        <span>{transition.status}</span>
      </div>
      <div className="flow-transition-progress" aria-hidden="true"><span /></div>
    </section>
  )
}

export function FlowNextIcon() {
  return (
    <svg
      className="flow-next-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  )
}
