import { useEffect, useState } from 'react'
import SignalSpecTable from './SignalSpecTable'
import { fetchSignalSpecPreview } from './signalSpecs'
import type { SignalSpecPreview, SignalSpecPreviewRequest } from './signalSpecs'

export type SignalTrace = {
  submittedAt: string
  cardId: string
  modality: string
  request: {
    categoryTags: string[]
    elapsedMs: number
    signals: Record<string, unknown>
  }
  response: {
    attemptId: number | null
    successful: boolean
    evaluation: Record<string, unknown>
    feedbackUnavailable?: { code: string; message: string; provider: string } | null
  } | null
  error?: string
}

type SignalTroubleshootingPanelProps = {
  previewRequest: SignalSpecPreviewRequest | null
  outgoingSignals: Record<string, unknown>
  lastTrace: SignalTrace | null
}

type RubricEntry = {
  key?: string
  label?: string
  status?: string
  score?: number
  evidence?: string[]
}

const OPEN_STORAGE_KEY = 'system1.signalTroubleshooting.open'

const readOpen = () => {
  try {
    return window.localStorage.getItem(OPEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const writeOpen = (open: boolean) => {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0')
  } catch {
    // Remembering the panel state is a convenience only.
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const SOURCE_LABELS: Record<SignalSpecPreview['source'], string> = {
  problem: 'matched the card’s problem',
  'skill-tag': 'matched the primary skill tag',
  default: 'no match, using the default spec',
}

function JsonBlock({ value }: { value: unknown }) {
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

function NextSubmission({ previewRequest, outgoingSignals }: Omit<SignalTroubleshootingPanelProps, 'lastTrace'>) {
  const [preview, setPreview] = useState<SignalSpecPreview | null>(null)
  const [error, setError] = useState('')
  const requestKey = previewRequest ? JSON.stringify(previewRequest) : ''

  useEffect(() => {
    if (!requestKey) return
    const controller = new AbortController()
    fetchSignalSpecPreview(JSON.parse(requestKey) as SignalSpecPreviewRequest, controller.signal)
      .then((result) => {
        setPreview(result)
        setError('')
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Preview unavailable')
      })
    return () => controller.abort()
  }, [requestKey])

  return (
    <section className="signal-trace-section" aria-label="Next submission">
      <h4>Next submission</h4>
      {!previewRequest ? <p className="signal-trace-empty">No card loaded.</p> : null}
      {error ? <p className="signal-trace-error" role="alert">{error}</p> : null}
      {preview ? (
        <>
          <dl className="signal-trace-facts">
            <div><dt>Spec</dt><dd><code>{preview.spec.algorithm}</code> v{preview.spec.version}</dd></div>
            <div><dt>Resolved by</dt><dd>{SOURCE_LABELS[preview.source]}</dd></div>
            <div><dt>Primary tag</dt><dd><code>{preview.primaryPatternTag || 'none'}</code></dd></div>
            <div><dt>Card</dt><dd><code>{previewRequest?.cardId}</code></dd></div>
          </dl>
          <SignalSpecTable spec={preview.spec} showStrategy={false} />
          <details className="signal-trace-raw">
            <summary>Client signals sent with the attempt</summary>
            <JsonBlock value={outgoingSignals} />
          </details>
          <details className="signal-trace-raw">
            <summary>Category tags</summary>
            <JsonBlock value={previewRequest?.categoryTags ?? []} />
          </details>
          <details className="signal-trace-raw">
            <summary>Assessor system prompt</summary>
            <pre className="signal-trace-json">{preview.assessorPayload.systemPrompt}</pre>
          </details>
        </>
      ) : null}
    </section>
  )
}

function LastSubmission({ trace }: { trace: SignalTrace | null }) {
  if (!trace) {
    return (
      <section className="signal-trace-section" aria-label="Last submission">
        <h4>Last submission</h4>
        <p className="signal-trace-empty">Nothing submitted yet in this session.</p>
      </section>
    )
  }
  const evaluation = asRecord(trace.response?.evaluation)
  const spec = asRecord(evaluation.signalSpec)
  const score = asRecord(evaluation.score)
  const primaryFailure = asRecord(evaluation.primaryFailure)
  const provenance = asRecord(evaluation.provenance)

  return (
    <section className="signal-trace-section" aria-label="Last submission">
      <h4>Last submission</h4>
      <dl className="signal-trace-facts">
        <div><dt>Card</dt><dd><code>{trace.cardId}</code></dd></div>
        <div><dt>Modality</dt><dd>{trace.modality}</dd></div>
        <div><dt>Submitted</dt><dd>{new Date(trace.submittedAt).toLocaleTimeString()}</dd></div>
        <div><dt>Elapsed</dt><dd>{(trace.request.elapsedMs / 1000).toFixed(1)}s</dd></div>
        {trace.response ? (
          <>
            <div><dt>Spec used</dt><dd><code>{String(spec.algorithm ?? '—')}</code> v{String(spec.version ?? '—')}</dd></div>
            <div><dt>Verdict</dt><dd>{String(evaluation.verdict ?? '—')}</dd></div>
            <div><dt>Primary failure</dt><dd>{String(primaryFailure.label ?? primaryFailure.key ?? '—')}</dd></div>
            <div><dt>Source</dt><dd>{String(provenance.source ?? '—')}{provenance.provider ? ` · ${String(provenance.provider)}` : ''}</dd></div>
          </>
        ) : null}
      </dl>
      {trace.error ? <p className="signal-trace-error" role="alert">{trace.error}</p> : null}
      {trace.response?.feedbackUnavailable ? (
        <p className="signal-trace-error" role="alert">
          Assessor unavailable ({trace.response.feedbackUnavailable.code}): {trace.response.feedbackUnavailable.message}
        </p>
      ) : null}
      {Object.keys(score).length ? (
        <dl className="signal-trace-facts signal-trace-scores">
          {Object.entries(score).map(([key, value]) => (
            <div key={key}><dt>{key}</dt><dd>{typeof value === 'number' ? value.toFixed(1) : String(value)}</dd></div>
          ))}
        </dl>
      ) : null}
      <RubricRows title="Dimensions" entries={asRecord(evaluation.dimensions)} />
      <RubricRows title="Modifiers" entries={asRecord(evaluation.modifiers)} />
      <details className="signal-trace-raw">
        <summary>Client signals sent</summary>
        <JsonBlock value={trace.request.signals} />
      </details>
      {trace.response ? (
        <details className="signal-trace-raw">
          <summary>Raw evaluation response</summary>
          <JsonBlock value={evaluation} />
        </details>
      ) : null}
    </section>
  )
}

export default function SignalTroubleshootingPanel({ previewRequest, outgoingSignals, lastTrace }: SignalTroubleshootingPanelProps) {
  const [open, setOpen] = useState(readOpen)

  return (
    <details
      className="signal-trace-panel"
      open={open}
      onToggle={(event) => {
        const next = (event.currentTarget as HTMLDetailsElement).open
        setOpen(next)
        writeOpen(next)
      }}
    >
      <summary>
        <span>Signal troubleshooting</span>
        {lastTrace?.response ? (
          <span className="signal-trace-summary-meta">
            last: {String(asRecord(asRecord(lastTrace.response.evaluation).signalSpec).algorithm ?? '—')}
            {' · '}
            {String(asRecord(lastTrace.response.evaluation).verdict ?? '—')}
          </span>
        ) : null}
      </summary>
      {open ? (
        <div className="signal-trace-body">
          <NextSubmission previewRequest={previewRequest} outgoingSignals={outgoingSignals} />
          <LastSubmission trace={lastTrace} />
        </div>
      ) : null}
    </details>
  )
}
