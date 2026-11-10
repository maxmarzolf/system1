import { useEffect, useMemo, useState } from 'react'
import { SignalAdminError, draftFromSignal, setSignalArchived, updateSignal } from '../api'
import type { AdminSignal, SignalAdminCatalog, SignalDraft } from '../api'
import { RevisionHistory } from './RevisionHistory'
import { SignalEditor } from './SignalEditor'
import { TryPanel } from './TryPanel'
import { APPLIES_LABELS, describeResponse, errorMessage, signalSummaryText, type FieldErrors } from '../lib'

export function SignalCard({
  signal,
  catalog,
  onSaved,
}: {
  signal: AdminSignal
  catalog: SignalAdminCatalog
  onSaved: () => void
}) {
  const original = useMemo(() => draftFromSignal(signal), [signal])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SignalDraft>(original)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const archived = signal.status === 'archived'

  useEffect(() => {
    setDraft(original)
    setErrors({})
    setConflict(false)
  }, [original])

  const handle = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setMessage('')
    setErrors({})
    setConflict(false)
    try {
      await action()
      setMessage(success)
      onSaved()
    } catch (reason) {
      if (reason instanceof SignalAdminError) {
        setErrors(reason.fieldErrors)
        setConflict(reason.status === 409)
      }
      setMessage(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={archived ? 'admin-signal admin-signal-archived' : 'admin-signal'}>
      <button type="button" className="admin-signal-summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="admin-signal-top">
          <span className="admin-signal-title">
            <strong>{signal.label}</strong>
            <code>{signal.key}</code>
            {archived ? <span className="admin-badge admin-badge-archived">Archived</span> : null}
            {dirty ? <span className="admin-badge admin-badge-warning">Unsaved</span> : null}
          </span>
          <span className="admin-signal-primitive">
            {signal.source === 'deterministic' ? 'Computed' : describeResponse(signal)}
          </span>
        </span>
        <span className="admin-signal-instructions">{signalSummaryText(signal, catalog)}</span>
        <span className="admin-signal-meta">
          <span>Applies: {APPLIES_LABELS[signal.appliesWhen]}</span>
          <span>Weight: {Math.round(signal.weight * 100)}%</span>
          <span>Role: {signal.role}</span>
          <span>Version: v{signal.version}</span>
        </span>
      </button>
      {open ? (
        <div className="admin-signal-body">
          <SignalEditor draft={draft} onChange={setDraft} errors={errors} catalog={catalog} isNew={false} />
          {message ? (
            <p className={conflict || Object.keys(errors).length ? 'admin-field-error' : 'admin-success'} role="status">
              {message}
              {conflict ? (
                <button type="button" className="secondary admin-small-button" onClick={onSaved}>Reload signal</button>
              ) : null}
            </p>
          ) : null}
          <div className="admin-actions">
            <button type="button" disabled={!dirty || busy}
              onClick={() => handle(() => updateSignal(signal.key, draft, signal.version), 'Saved. Applies to the next MCQ evaluation.')}>
              Save
            </button>
            <button type="button" className="secondary" disabled={!dirty || busy} onClick={() => setDraft(original)}>Discard</button>
            <span className="admin-actions-spacer" />
            <button type="button" className="secondary" disabled={busy || dirty}
              title={dirty ? 'Save or discard changes first' : undefined}
              onClick={() => handle(
                () => setSignalArchived(signal.key, !archived, signal.version),
                archived ? 'Restored. Runs again from the next evaluation.' : 'Archived. No longer sent to Jev.',
              )}>
              {archived ? 'Restore' : 'Archive'}
            </button>
          </div>
          {draft.source === 'jev' ? <TryPanel draft={draft} /> : null}
          <RevisionHistory subject={signal.key} />
        </div>
      ) : null}
    </article>
  )
}
