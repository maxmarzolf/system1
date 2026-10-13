import { useEffect, useRef, useState } from 'react'
import { apiUrl } from './api'
import RecallCodeEditor from './RecallCodeEditor'
import { LADDER_REPS_PER_RUNG, LADDER_RUNGS, type SlidingWindowTechnique } from './windowLadderPlan'
import type { AppTheme } from './theme'

type LadderAttempt = {
  rungIndex: number
  successful: boolean
  strength: string
  weakness: string
  question: string
}

export type LadderQuestion = {
  rungTitle: string
  question: string
  starterCode: string
  solution: string
  language: string
}

type LadderSaveResult = {
  saved: boolean
  successful: boolean
  evaluation: {
    feedback: {
      fullFeedback?: string
      primaryFocus?: string
      nextMove?: string
      why?: string
      affirmation?: string
      strengths?: string[]
    } | Record<string, never>
  }
}

type LadderRequest = {
  rungIndex: number
  rep: number
  recentAttempts: LadderAttempt[]
  version: number
}

const interactionId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

const completedAttempt = (result: LadderSaveResult, question: LadderQuestion, rungIndex: number): LadderAttempt => {
  const feedback = result.evaluation.feedback
  return {
    rungIndex,
    successful: result.successful,
    strength: (feedback.affirmation || feedback.strengths?.join('; ') || '').slice(0, 400),
    weakness: (feedback.primaryFocus || feedback.why || '').slice(0, 400),
    question: question.question.slice(0, 500),
  }
}

const loadProgress = (key: string): { request: LadderRequest; complete: boolean } => {
  const fresh = { request: { rungIndex: 0, rep: 1, recentAttempts: [], version: 0 }, complete: false }
  if (typeof window === 'undefined') return fresh
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || 'null')
    if (!saved || !Number.isInteger(saved.rungIndex) || !Number.isInteger(saved.rep)) return fresh
    if (saved.rungIndex < 0 || saved.rungIndex > 4 || saved.rep < 1 || saved.rep > LADDER_REPS_PER_RUNG) return fresh
    return {
      request: {
        rungIndex: saved.rungIndex,
        rep: saved.rep,
        recentAttempts: Array.isArray(saved.recentAttempts) ? saved.recentAttempts.slice(-8) : [],
        version: 0,
      },
      complete: saved.complete === true,
    }
  } catch {
    return fresh
  }
}

export default function SlidingWindowLadder({
  cardId, cardTitle, cardPrompt, cardTarget, technique, provider, theme, onSave, onClose,
}: {
  cardId: string
  cardTitle: string
  cardPrompt: string
  cardTarget: string
  technique: SlidingWindowTechnique
  provider: string
  theme: AppTheme
  onSave: (question: LadderQuestion, answer: string, elapsedMs: number, interaction: string, rungIndex: number, rep: number) => Promise<LadderSaveResult | null>
  onClose: () => void
}) {
  const storageKey = `system1-ladder-v1:${cardId}:${technique}`
  const [initialProgress] = useState(() => loadProgress(storageKey))
  const [request, setRequest] = useState<LadderRequest>(initialProgress.request)
  const [question, setQuestion] = useState<LadderQuestion | null>(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<LadderSaveResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(initialProgress.complete)
  const startedAt = useRef(Date.now())
  const savingRef = useRef(false)
  const questionInteraction = useRef(interactionId())

  useEffect(() => {
    const counted = Boolean(result?.successful)
    const finishedRung = counted && request.rep === LADDER_REPS_PER_RUNG
    const finishedLadder = finishedRung && request.rungIndex === LADDER_RUNGS[technique].length - 1
    const recentAttempts = result && question
      ? [...request.recentAttempts, completedAttempt(result, question, request.rungIndex)].slice(-8)
      : request.recentAttempts
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        rungIndex: finishedRung && !finishedLadder ? request.rungIndex + 1 : request.rungIndex,
        rep: finishedLadder ? LADDER_REPS_PER_RUNG : finishedRung ? 1 : request.rep + (counted ? 1 : 0),
        recentAttempts,
        complete: complete || finishedLadder,
      }))
    } catch { /* Continue the active Ladder when storage is unavailable. */ }
  }, [storageKey, request, question, result, complete, technique])

  useEffect(() => {
    if (complete) return
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(apiUrl('/api/coach/sliding-window-ladder'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            cardTitle, cardPrompt, cardTarget, technique,
            rungIndex: request.rungIndex,
            rep: request.rep,
            recentAttempts: request.recentAttempts,
            llmProvider: provider,
          }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Unable to generate a Ladder question.')
        if (controller.signal.aborted) return
        const next = payload as LadderQuestion
        setQuestion(next)
        setAnswer(next.starterCode)
        startedAt.current = Date.now()
        questionInteraction.current = interactionId()
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Unable to generate a Ladder question.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [cardTitle, cardPrompt, cardTarget, technique, provider, request, complete])

  const submit = async () => {
    if (!question || !answer.trim() || answer.trim() === question.starterCode.trim() || savingRef.current || result) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const saved = await onSave(
        question, answer, Math.max(1, Date.now() - startedAt.current),
        questionInteraction.current, request.rungIndex, request.rep,
      )
      if (!saved?.saved) throw new Error('Your answer could not be saved. Submit again to continue.')
      setResult(saved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit this rung.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const next = () => {
    if (!result || !question) return
    const previous = [...request.recentAttempts, completedAttempt(result, question, request.rungIndex)].slice(-8)
    const finishedRung = result.successful && request.rep === LADDER_REPS_PER_RUNG
    if (finishedRung && request.rungIndex === LADDER_RUNGS[technique].length - 1) {
      setComplete(true)
      return
    }
    setQuestion(null)
    setAnswer('')
    setResult(null)
    setError('')
    setLoading(true)
    setRequest({
      rungIndex: finishedRung ? request.rungIndex + 1 : request.rungIndex,
      rep: finishedRung ? 1 : request.rep + (result.successful ? 1 : 0),
      recentAttempts: previous,
      version: request.version + 1,
    })
  }

  const retryGeneration = () => {
    setError('')
    setLoading(true)
    setRequest((current) => ({ ...current, version: current.version + 1 }))
  }

  const restart = () => {
    setQuestion(null)
    setAnswer('')
    setResult(null)
    setError('')
    setLoading(true)
    setComplete(false)
    setRequest({ rungIndex: 0, rep: 1, recentAttempts: [], version: request.version + 1 })
  }

  return (
    <div id="sliding-window-ladder" className="card-grid ladder-grid drill-fade-in">
      <div className="panel prompt-surface-panel">
        <div className="prompt-surface-section">
          <div className="prompt-section-content">
            <span className="prompt-section-label">Sliding Window Ladder · {technique} window</span>
            <h3 className="ladder-rung-title">{LADDER_RUNGS[technique][request.rungIndex]}</h3>
            <p className="ladder-progress">Rung {request.rungIndex + 1} of {LADDER_RUNGS[technique].length} · Rep {request.rep} of {LADDER_REPS_PER_RUNG} · {request.rep - 1} complete</p>
            {complete ? <p role="status">Ladder complete. You built each piece and combined them.</p> : (
              loading ? <p role="status">Writing a new question for this rung…</p> : question && <p className="prompt prompt-surface-body">{question.question}</p>
            )}
            {error && <p role="alert">{error}</p>}
            {!question && error && <button type="button" className="secondary" onClick={retryGeneration}>Try again</button>}
            {result && <div className="submission-feedback-detail" role="status">
              <p>{result.evaluation.feedback.fullFeedback || (result.successful ? 'Sound. This rep counts.' : 'This rung needs another rep.')}</p>
              {result.evaluation.feedback.nextMove && <p>{result.evaluation.feedback.nextMove}</p>}
              {!result.successful && <p>The next question stays on this rung.</p>}
              <details><summary>Reference solution</summary><pre>{question?.solution}</pre></details>
            </div>}
          </div>
        </div>
      </div>
      {!complete && question && <div className="panel micro-drill-answer-card ladder-answer-card">
        <span className="answer-label">Write the complete function body</span>
        <RecallCodeEditor
          key={`${request.rungIndex}-${request.rep}-${request.version}`}
          value={answer}
          language="python"
          theme={theme}
          editable={!saving && !result}
          disabled={saving || Boolean(result)}
          placeholder="Write the code for this rung"
          lineMeta={[]}
          minHeight={220}
          intellisense={false}
          commonPatterns={false}
          onChange={setAnswer}
        />
        <div className="ladder-actions">
          {result
            ? <button type="button" onClick={next}>{result.successful && request.rep === LADDER_REPS_PER_RUNG ? 'Next rung' : 'Next question'}</button>
            : <button type="button" onClick={() => void submit()} disabled={saving || !answer.trim() || answer.trim() === question.starterCode.trim()}>{saving ? 'Checking…' : 'Submit rep'}</button>}
        </div>
      </div>}
      {complete && <div className="panel ladder-complete">
        <button type="button" onClick={onClose}>Return to card</button>
        <button type="button" className="secondary" onClick={restart}>Start Ladder again</button>
      </div>}
    </div>
  )
}
