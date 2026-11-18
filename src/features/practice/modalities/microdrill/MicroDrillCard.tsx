import { type CSSProperties, useEffect, useRef, useState } from 'react'
import type { FlowGenerationContext } from '@/features/practice/flow/practiceFlow'
import { api, unwrap } from '@/api/client'
import type { AppTheme } from '@/app/theme'
import EvaluationResult from '@/shared/evaluation/EvaluationResult'
import type { SubmitResponse } from '@/shared/evaluation/evaluation'
import { createInteractionId } from '@/features/practice/submission/submission'
import { useSubmission } from '@/features/practice/submission/useSubmission'
import { MicroDrillBlankEditor, MicroDrillInstructions } from './MicroDrillEditor'
import type { FlowMicroDrill, FlowMicroDrillPrimaryActionState } from '@/features/practice/lib/types'

export default function MicroDrillCard({ title, prompt, target, tags, focus, rep, context, provider, theme, syntaxTheme, actionKey, onSave, primaryActionRef, onPrimaryActionStateChange }: {
  title: string; prompt: string; target: string
  /** The card's tags; the stored drill is filed under their algorithm. */
  tags: string[]
  focus: string; rep: number; provider: string
  context: FlowGenerationContext
  theme: AppTheme; syntaxTheme: Record<string, CSSProperties>
  actionKey: string
  onSave: (drill: FlowMicroDrill, answer: string, elapsedMs: number, interactionId: string) => Promise<SubmitResponse | null>
  primaryActionRef: { current: () => void }
  onPrimaryActionStateChange: (state: FlowMicroDrillPrimaryActionState) => void
}) {
  const [drill, setDrill] = useState<FlowMicroDrill | null>(null)
  const [generationError, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [answer, setAnswer] = useState({ code: '', complete: false })
  const submission = useSubmission(onSave)
  const { result, saving } = submission
  const error = generationError || submission.error
  const startedAt = useRef(0)
  const interactionId = useRef(createInteractionId())
  // Generated once per card: later context changes don't regenerate the drill.
  const [generationContext] = useState(context)
  useEffect(() => {
    // The card is keyed per rep, so a new drill only loads on mount or Try again (which clears).
    const controller = new AbortController()
    void (async () => {
      try {
        const payload = unwrap(
          await api.POST('/api/coach/micro-drill', {
            signal: controller.signal,
            body: { cardTitle: title, prompt, target, focus, rep, tags, ...generationContext, llmProvider: provider },
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
  }, [title, prompt, target, tags, focus, rep, generationContext, provider, retry])

  const submit = async () => {
    if (!drill || !answer.complete || result) return
    await submission.submit(drill, answer.code, Math.max(1, Date.now() - startedAt.current), interactionId.current)
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
      failed: Boolean(generationError && !drill),
      complete: answer.complete,
      saving,
      submitted: Boolean(result),
    })
  }, [actionKey, answer.complete, drill, generationError, onPrimaryActionStateChange, result, saving])

  return (
    <div className="card-grid micro-drill-card-grid drill-fade-in">
      <div className="panel prompt-surface-panel">
        <div className="prompt-surface-section">
          <div className="prompt-section-content">
            <span className="prompt-section-label">Microdrill · Rep {rep}</span>
            {drill ? <div className="prompt prompt-surface-body micro-drill-prompt"><MicroDrillInstructions text={drill.prompt} /></div> : !error && <p className="prompt prompt-surface-body" role="status">Preparing your microdrill…</p>}
            {error && <p className="prompt prompt-surface-body" role="alert">{error}</p>}
            {!drill && error && <button type="button" className="secondary" onClick={() => { setDrill(null); setError(''); setRetry(value => value + 1) }}>Try again</button>}
            {result && <div className="submission-feedback-detail" role="status">
              <EvaluationResult evaluation={result.evaluation} />
              {result.feedbackUnavailable && <p>{String(result.feedbackUnavailable.message ?? '')}</p>}
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
