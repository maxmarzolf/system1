import { useState } from 'react'
import InfoTip from '@/shared/components/InfoTip'
import { MODALITY_LABELS, type Modality } from '@/shared/modality'
import { SIGNAL_FIELD_HELP } from '../signalFieldHelp'
import { SignalAdminError, fetchSignalSamples, trySignal } from '../api'
import type { SignalDraft, SignalSample, SignalTryResult } from '../api'
import { JsonPreview } from './fields'
import { errorMessage } from '../lib'

const firstWrongChoice = (sample: SignalSample) =>
  sample.choices.find((choice) => choice.id !== sample.correctChoiceId)?.id ?? sample.correctChoiceId ?? ''

/**
 * Run an unsaved draft against one stored item. MCQ picks a choice; every other modality grades
 * a pasted answer (prefilled with the item's reference, so edit it to try a mistake). The server
 * builds the same state the evaluation pipeline would send.
 */
export function TryPanel({ modality, draft }: { modality: Modality; draft: SignalDraft }) {
  const [samples, setSamples] = useState<SignalSample[] | null>(null)
  const [sampleId, setSampleId] = useState('')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<SignalTryResult | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const isMcq = modality === 'mcq'
  const sample = samples?.find((item) => item.id === sampleId)

  const choose = (next: SignalSample | undefined) => {
    setSampleId(next?.id ?? '')
    setAnswer(next ? (isMcq ? firstWrongChoice(next) : next.reference) : '')
  }

  const loadSamples = () => {
    fetchSignalSamples(modality)
      .then((items) => {
        setSamples(items)
        choose(items[0])
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }

  const run = async () => {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      setResult(await trySignal(modality, draft, sampleId, answer, modality === 'ghost-rep' ? sample?.reference ?? '' : ''))
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
        {samples && !samples.length ? (
          <p className="tune-footnote">No stored {MODALITY_LABELS[modality]} items yet. Practise one first.</p>
        ) : null}
        {samples?.length ? (
          <>
            <label className="tune-control">
              <span className="tune-control-label">Stored item <InfoTip label="stored item">{SIGNAL_FIELD_HELP.tryQuestion}</InfoTip></span>
              <select value={sampleId} onChange={(event) => choose(samples.find((item) => item.id === event.target.value))}>
                {samples.map((item) => <option key={item.id} value={item.id}>{item.title.slice(0, 110)}</option>)}
              </select>
            </label>
            <label className="tune-control">
              <span className="tune-control-label">Submitted answer <InfoTip label="submitted answer">{SIGNAL_FIELD_HELP.tryAnswer}</InfoTip></span>
              {isMcq ? (
                <select value={answer} onChange={(event) => setAnswer(event.target.value)}>
                  {sample?.choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.id}. {choice.text.slice(0, 90)}{choice.id === sample.correctChoiceId ? ' (correct)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <textarea className="admin-textarea admin-code" rows={8} spellCheck={false} value={answer}
                  onChange={(event) => setAnswer(event.target.value)} />
              )}
            </label>
            <div className="admin-actions">
              <button type="button" onClick={run} disabled={running || !sampleId || !answer.trim()}>
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
              <div><dt>Answered correctly</dt><dd>{result.answeredCorrectly ? 'yes' : 'no'} <span className="tune-footnote">(deterministic check)</span></dd></div>
              <div><dt>Applies</dt><dd>{result.applies ? 'yes' : 'no — would be not_applicable'}</dd></div>
              <div><dt>Answer</dt><dd><code>{result.result.raw === null ? '—' : String(result.result.raw)}</code></dd></div>
              <div><dt>Score</dt><dd>{result.result.score === null ? '— (not scored)' : result.result.score.toFixed(1)}</dd></div>
              <div><dt>Confidence</dt><dd>{result.result.confidence === null ? '—' : result.result.confidence.toFixed(2)}</dd></div>
              {result.model ? <div><dt>Model</dt><dd><code>{result.model}</code></dd></div> : null}
            </dl>
            <JsonPreview value={{ state: result.state, question: result.question, answer: result.answer }} />
          </div>
        ) : null}
      </div>
    </details>
  )
}
