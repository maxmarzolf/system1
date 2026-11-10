import { useState } from 'react'
import InfoTip from '@/shared/components/InfoTip'
import { SIGNAL_FIELD_HELP } from '../signalFieldHelp'
import { SignalAdminError, fetchMcqSamples, trySignal } from '../api'
import type { McqSample, SignalDraft, SignalTryResult } from '../api'
import { JsonPreview } from './fields'
import { errorMessage } from '../lib'

export function TryPanel({ draft }: { draft: SignalDraft }) {
  const [samples, setSamples] = useState<McqSample[] | null>(null)
  const [problemId, setProblemId] = useState('')
  const [choiceId, setChoiceId] = useState('')
  const [result, setResult] = useState<SignalTryResult | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  const loadSamples = () => {
    fetchMcqSamples()
      .then((items) => {
        setSamples(items)
        const first = items[0]
        if (first) {
          setProblemId(first.id)
          setChoiceId(first.choices.find((choice) => choice.id !== first.correctChoiceId)?.id ?? first.correctChoiceId)
        }
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }
  const sample = samples?.find((item) => item.id === problemId)

  const run = async () => {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      setResult(await trySignal(draft, problemId, choiceId))
    } catch (reason) {
      setError(reason instanceof SignalAdminError && Object.keys(reason.fieldErrors).length
        ? Object.values(reason.fieldErrors).join(' ')
        : errorMessage(reason))
    } finally {
      setRunning(false)
    }
  }

  return (
    <details className="signal-trace-raw" onToggle={(event) => {
      if ((event.currentTarget as HTMLDetailsElement).open && samples === null) loadSamples()
    }}>
      <summary>Try it against Jev</summary>
      <div className="admin-try">
        {samples && !samples.length ? <p className="tune-footnote">No stored MCQs yet. Generate some on the practice page.</p> : null}
        {samples?.length ? (
          <>
            <label className="tune-control">
              <span className="tune-control-label">Stored question <InfoTip label="stored question">{SIGNAL_FIELD_HELP.tryQuestion}</InfoTip></span>
              <select value={problemId} onChange={(event) => {
                const next = samples.find((item) => item.id === event.target.value)
                setProblemId(event.target.value)
                setChoiceId(next?.choices[0]?.id ?? '')
              }}>
                {samples.map((item) => <option key={item.id} value={item.id}>{item.question.slice(0, 110)}</option>)}
              </select>
            </label>
            <label className="tune-control">
              <span className="tune-control-label">Submitted answer <InfoTip label="submitted answer">{SIGNAL_FIELD_HELP.tryAnswer}</InfoTip></span>
              <select value={choiceId} onChange={(event) => setChoiceId(event.target.value)}>
                {sample?.choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.id}. {choice.text.slice(0, 90)}{choice.id === sample.correctChoiceId ? ' (correct)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-actions">
              <button type="button" onClick={run} disabled={running || !problemId || !choiceId}>
                {running ? 'Asking Jev…' : 'Run draft'}
              </button>
              <span className="tune-footnote">Uses the unsaved draft. One Jev call; nothing is stored.</span>
            </div>
          </>
        ) : null}
        {error ? <p className="admin-field-error" role="alert">{error}</p> : null}
        {result ? (
          <div className="admin-try-result">
            <dl className="signal-trace-facts">
              <div><dt>Answered correctly</dt><dd>{result.answeredCorrectly ? 'yes' : 'no'}</dd></div>
              <div><dt>Applies</dt><dd>{result.applies ? 'yes' : 'no — would be not_applicable'}</dd></div>
              <div><dt>Answer</dt><dd><code>{result.result.raw === null ? '—' : String(result.result.raw)}</code></dd></div>
              <div><dt>Score</dt><dd>{result.result.score === null ? '— (not scored)' : result.result.score.toFixed(1)}</dd></div>
              <div><dt>Confidence</dt><dd>{result.result.confidence === null ? '—' : result.result.confidence.toFixed(2)}</dd></div>
              {result.model ? <div><dt>Model</dt><dd><code>{result.model}</code></dd></div> : null}
            </dl>
            <JsonPreview value={{ question: result.question, answer: result.answer }} />
          </div>
        ) : null}
      </div>
    </details>
  )
}
