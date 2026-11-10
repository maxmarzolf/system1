import { useState } from 'react'
import { SignalAdminError, createSignal, emptySignalDraft } from '../api'
import type { SignalAdminCatalog, SignalDraft } from '../api'
import { SignalEditor } from './SignalEditor'
import { TryPanel } from './TryPanel'
import { errorMessage, type FieldErrors } from '../lib'

export function NewSignal({
  catalog,
  defaultScope,
  onSaved,
}: {
  catalog: SignalAdminCatalog
  defaultScope: string
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SignalDraft>(emptySignalDraft)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    setMessage('')
    setErrors({})
    try {
      const created = await createSignal(draft)
      setMessage(`Created ${created.key}. Applies to the next MCQ evaluation.`)
      setDraft(emptySignalDraft())
      setOpen(false)
      onSaved()
    } catch (reason) {
      if (reason instanceof SignalAdminError) setErrors(reason.fieldErrors)
      setMessage(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  const toggle = () => {
    if (!open) {
      setMessage('')
      setDraft((current) => (current.key || current.label ? current : { ...emptySignalDraft(), scope: defaultScope }))
    }
    setOpen((value) => !value)
  }

  return (
    <article className="admin-signal admin-signal-new">
      <button type="button" className="admin-signal-summary" aria-expanded={open} onClick={toggle}>
        <span className="admin-signal-title">
          <strong>+ New signal</strong>
        </span>
        <span className="admin-signal-meta">
          <span>Define a Jev question, try it on a stored MCQ, then create it.</span>
        </span>
      </button>
      {message && !open ? <p className="admin-success admin-signal-new-message" role="status">{message}</p> : null}
      {open ? (
        <div className="admin-signal-body">
          <SignalEditor draft={draft} onChange={setDraft} errors={errors} catalog={catalog} isNew />
          {message ? <p className={Object.keys(errors).length ? 'admin-field-error' : 'admin-success'} role="status">{message}</p> : null}
          <div className="admin-actions">
            <button type="button" disabled={busy} onClick={create}>Create signal</button>
            <button type="button" className="secondary" disabled={busy}
              onClick={() => { setDraft({ ...emptySignalDraft(), scope: defaultScope }); setErrors({}); setOpen(false) }}>
              Cancel
            </button>
          </div>
          {draft.source === 'jev' ? <TryPanel draft={draft} /> : null}
        </div>
      ) : null}
    </article>
  )
}
