import { useEffect, useMemo, useState } from 'react'
import InfoTip from '@/shared/components/InfoTip'
import type { Modality } from '@/shared/modality'
import { SIGNAL_FIELD_HELP } from '../signalFieldHelp'
import { SignalAdminError, updateDirective } from '../api'
import type { CorrectnessDirective, CorrectnessSource } from '../api'
import { RevisionHistory } from './RevisionHistory'
import { FieldError, JsonPreview } from './fields'
import { errorMessage, formatShare, type FieldErrors } from '../lib'

const SOURCE_LABELS: Record<CorrectnessSource, string> = {
  jev: 'Jev answers this question',
  deterministic: "The modality's own check decides (no Jev call for correctness)",
}

/** The correctness question for one modality, and who decides it. */
export function DirectiveEditor({ modality, directive, onSaved }: { modality: Modality; directive: CorrectnessDirective; onSaved: () => void }) {
  const original = useMemo(() => ({
    instructions: directive.instructions,
    criteria: { '1': directive.criteria['1'] ?? '', '0': directive.criteria['0'] ?? '' },
    correctnessWeight: directive.correctnessWeight,
    correctnessSource: directive.correctnessSource ?? 'jev',
  }), [directive])
  const [draft, setDraft] = useState(original)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)

  useEffect(() => setDraft(original), [original])

  const save = async () => {
    setBusy(true)
    setMessage('')
    setErrors({})
    try {
      await updateDirective(modality, { ...draft, version: directive.version })
      setMessage('Saved. Applies to the next evaluation.')
      onSaved()
    } catch (reason) {
      if (reason instanceof SignalAdminError) setErrors(reason.fieldErrors)
      setMessage(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-editor">
      <label className="tune-control">
        <span className="tune-control-label">Who decides correctness</span>
        <select value={draft.correctnessSource}
          onChange={(event) => setDraft({ ...draft, correctnessSource: event.target.value as CorrectnessSource })}>
          {(Object.keys(SOURCE_LABELS) as CorrectnessSource[]).map((source) => (
            <option key={source} value={source}>{SOURCE_LABELS[source]}</option>
          ))}
        </select>
        <span className="tune-control-description">
          Either way, an empty, unparseable or non-returning code answer is incorrect, and the modality&rsquo;s check is the fallback when Jev is unavailable.
        </span>
        <FieldError errors={errors} field="correctnessSource" />
      </label>
      <label className="tune-control">
        <span className="tune-control-label">Instructions <InfoTip label="correctness instructions">{SIGNAL_FIELD_HELP.directiveInstructions}</InfoTip></span>
        <textarea className="admin-textarea" rows={3} value={draft.instructions}
          onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
        <FieldError errors={errors} field="instructions" />
      </label>
      <div className="admin-control-pair">
        {(['1', '0'] as const).map((label) => (
          <label key={label} className="tune-control">
            <span className="tune-control-label">
              Label <code>{label}</code> {label === '1' ? '— answered correctly' : '— answered incorrectly'} (fixed){' '}
              <InfoTip label={`label ${label}`}>
                {label === '1' ? SIGNAL_FIELD_HELP.directiveCorrect : SIGNAL_FIELD_HELP.directiveIncorrect}
              </InfoTip>
            </span>
            <input value={draft.criteria[label]}
              onChange={(event) => setDraft({ ...draft, criteria: { ...draft.criteria, [label]: event.target.value } })} />
          </label>
        ))}
      </div>
      <FieldError errors={errors} field="criteria" />
      <div className="admin-control-pair">
        <label className="tune-control">
          <span className="tune-control-label">Weight <InfoTip label="correctness weight">{SIGNAL_FIELD_HELP.directiveWeight}</InfoTip></span>
          <input type="number" min={0} max={1} step={0.05} value={draft.correctnessWeight}
            onChange={(event) => setDraft({ ...draft, correctnessWeight: Number.parseFloat(event.target.value) || 0 })} />
          <span className="tune-control-description">{formatShare(directive.weightShare)} of the overall score (general signals only).</span>
          <FieldError errors={errors} field="correctnessWeight" />
        </label>
      </div>
      {message ? <p className={Object.keys(errors).length ? 'admin-field-error' : 'admin-success'} role="status">{message}</p> : null}
      <div className="admin-actions">
        <button type="button" disabled={!dirty || busy} onClick={save}>Save</button>
        <button type="button" className="secondary" disabled={!dirty || busy} onClick={() => setDraft(original)}>Discard</button>
      </div>
      {draft.correctnessSource === 'jev' ? (
        <details className="signal-trace-raw">
          <summary>Sent to Jev</summary>
          <JsonPreview value={{ correctness: { type: 'choice', instructions: draft.instructions, criteria: draft.criteria } }} />
        </details>
      ) : null}
      <RevisionHistory modality={modality} subject="directive" />
    </div>
  )
}
