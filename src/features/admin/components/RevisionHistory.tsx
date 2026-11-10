import { useState } from 'react'
import { fetchSignalRevisions } from '../api'
import type { SignalRevision } from '../api'
import { JsonPreview } from './fields'
import { errorMessage } from '../lib'

export function RevisionHistory({ subject }: { subject: string }) {
  const [revisions, setRevisions] = useState<SignalRevision[] | null>(null)
  const [error, setError] = useState('')
  return (
    <details className="signal-trace-raw" onToggle={(event) => {
      if (!(event.currentTarget as HTMLDetailsElement).open) return
      fetchSignalRevisions(subject).then(setRevisions).catch((reason: unknown) => setError(errorMessage(reason)))
    }}>
      <summary>History</summary>
      {error ? <p className="admin-field-error">{error}</p> : null}
      {revisions?.length === 0 ? <p className="tune-footnote">No changes recorded.</p> : null}
      {revisions?.length ? (
        <ol className="admin-revisions">
          {revisions.map((revision) => (
            <li key={revision.id}>
              <strong>{revision.action}</strong> <span>{new Date(revision.createdAt).toLocaleString()}</span>
              <details>
                <summary>Before / after</summary>
                <JsonPreview value={{ before: revision.before, after: revision.after }} />
              </details>
            </li>
          ))}
        </ol>
      ) : null}
    </details>
  )
}
