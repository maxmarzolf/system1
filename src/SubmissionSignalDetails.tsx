type RubricEntry = {
  key?: string
  label?: string
  status?: string
  score?: number
  evidence?: string[]
}

type SignalResultEntry = {
  key?: string
  label?: string
  role?: string
  status?: string
  raw?: unknown
  score?: number | null
  confidence?: number | null
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="signal-trace-json">{JSON.stringify(value, null, 2)}</pre>
}

function RubricRows({ title, entries }: { title: string; entries: Record<string, unknown> }) {
  const rows = Object.entries(entries).map(([key, raw]) => ({ key, ...(asRecord(raw) as RubricEntry) }))
  if (!rows.length) return null
  return (
    <div className="signal-trace-rubric">
      <h5>{title}</h5>
      <table className="signal-spec-table">
        <thead>
          <tr>
            <th scope="col">Signal</th>
            <th scope="col">Status</th>
            <th scope="col">Score</th>
            <th scope="col">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                <strong>{row.label || row.key}</strong>
                <code>{row.key}</code>
              </th>
              <td><span className={`signal-status signal-status-${row.status || 'unknown'}`}>{row.status || '—'}</span></td>
              <td>{typeof row.score === 'number' ? row.score.toFixed(1) : '—'}</td>
              <td>{row.evidence?.length ? row.evidence.join(' ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SignalResultRows({ entries }: { entries: Record<string, unknown> }) {
  const rows = Object.entries(entries).map(([key, raw]) => ({ key, ...(asRecord(raw) as SignalResultEntry) }))
  if (!rows.length) return null
  return (
    <div className="signal-trace-rubric">
      <h5>Signal results</h5>
      <table className="signal-spec-table">
        <thead>
          <tr>
            <th scope="col">Signal</th>
            <th scope="col">Status</th>
            <th scope="col">Answer</th>
            <th scope="col">Score</th>
            <th scope="col">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                <strong>{row.label || row.key}</strong>
                <code>{row.key}</code>
              </th>
              <td><span className={`signal-status signal-status-${row.status || 'unknown'}`}>{row.status || '—'}</span></td>
              <td>{row.raw === null || row.raw === undefined ? '—' : String(row.raw)}</td>
              <td>{typeof row.score === 'number' ? row.score.toFixed(1) : '—'}</td>
              <td>{typeof row.confidence === 'number' ? row.confidence.toFixed(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Everything a stored submission evaluation says: spec, verdict, provenance, scores, and every signal. */
export default function SubmissionSignalDetails({ evaluation: rawEvaluation }: { evaluation: unknown }) {
  const evaluation = asRecord(rawEvaluation)
  if (!Object.keys(evaluation).length) {
    return <p className="signal-trace-empty">No evaluation was stored for this submission.</p>
  }
  const spec = asRecord(evaluation.signalSpec)
  const score = asRecord(evaluation.score)
  const primaryFailure = asRecord(evaluation.primaryFailure)
  const provenance = asRecord(evaluation.provenance)
  const correctness = asRecord(evaluation.correctness)
  const flags = Array.isArray(provenance.flags) ? provenance.flags.map(String) : []

  return (
    <div className="submission-signal-details">
      <dl className="signal-trace-facts">
        <div><dt>Spec</dt><dd><code>{String(spec.algorithm ?? '—')}</code> v{String(spec.version ?? '—')}{spec.hash ? <> · <code>{String(spec.hash)}</code></> : null}</dd></div>
        <div><dt>Verdict</dt><dd>{String(evaluation.verdict ?? '—')}</dd></div>
        <div><dt>Primary failure</dt><dd>{String(primaryFailure.label ?? primaryFailure.key ?? '—')}</dd></div>
        <div><dt>Source</dt><dd>{String(provenance.source ?? '—')}{provenance.provider ? ` · ${String(provenance.provider)}` : ''}</dd></div>
        {provenance.model ? <div><dt>Jev model</dt><dd><code>{String(provenance.model)}</code></dd></div> : null}
        {Object.keys(correctness).length ? (
          <div>
            <dt>Jev correctness</dt>
            <dd>
              {String(correctness.label)} · confidence {typeof correctness.confidence === 'number' ? correctness.confidence.toFixed(2) : '—'}
              {correctness.answerKeyAgreement === false ? ' · disagrees with answer key' : ''}
            </dd>
          </div>
        ) : null}
        {flags.length ? <div><dt>Flags</dt><dd>{flags.join(', ')}</dd></div> : null}
      </dl>
      {Object.keys(score).length ? (
        <dl className="signal-trace-facts signal-trace-scores">
          {Object.entries(score).map(([key, value]) => (
            <div key={key}><dt>{key}</dt><dd>{typeof value === 'number' ? value.toFixed(1) : String(value)}</dd></div>
          ))}
        </dl>
      ) : null}
      <RubricRows title="Dimensions" entries={asRecord(evaluation.dimensions)} />
      <RubricRows title="Modifiers" entries={asRecord(evaluation.modifiers)} />
      <SignalResultRows entries={asRecord(evaluation.signalResults)} />
      {Array.isArray(evaluation.jevTrace) ? (
        <details className="signal-trace-raw">
          <summary>Jev answers</summary>
          <JsonBlock value={evaluation.jevTrace} />
        </details>
      ) : null}
      <details className="signal-trace-raw">
        <summary>Raw evaluation</summary>
        <JsonBlock value={evaluation} />
      </details>
    </div>
  )
}
