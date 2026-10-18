import { useEffect, useState } from 'react'
import SignalSpecTable from './SignalSpecTable'
import { fetchSignalSpecCatalog } from './signalSpecs'
import type { SignalSpecCatalog } from './signalSpecs'

export default function SignalSpecViewer() {
  const [catalog, setCatalog] = useState<SignalSpecCatalog | null>(null)
  const [error, setError] = useState('')
  const [selectedSlug, setSelectedSlug] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetchSignalSpecCatalog(controller.signal)
      .then((result) => {
        setCatalog(result)
        setSelectedSlug((current) => current || result.algorithms.find((item) => !item.usesDefault)?.slug || result.algorithms[0]?.slug || '')
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Signal specs unavailable')
      })
    return () => controller.abort()
  }, [])

  if (error) return <p className="tune-footnote" role="alert">{error}</p>
  if (!catalog) return <p className="tune-footnote" aria-busy="true">Loading signal specs…</p>

  const selected = catalog.algorithms.find((item) => item.slug === selectedSlug) ?? catalog.algorithms[0]
  const customCount = catalog.algorithms.filter((item) => !item.usesDefault).length

  return (
    <div className="signal-spec-viewer" id="signals">
      <div className="tune-control-grid">
        <label className="tune-control">
          <span className="tune-control-label">Algorithm</span>
          <select value={selected?.slug ?? ''} onChange={(event) => setSelectedSlug(event.target.value)}>
            {catalog.algorithms.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}{item.usesDefault ? ' (default spec)' : ''}
              </option>
            ))}
          </select>
          <span className="tune-control-description">
            {customCount} of {catalog.algorithms.length} algorithms have their own spec. The rest use the default.
          </span>
        </label>
        {selected ? (
          <div className="signal-spec-meta" aria-label="Spec details">
            <span>Spec <code>{selected.spec.algorithm}</code></span>
            <span>Version <code>v{selected.spec.version}</code></span>
            <span>{selected.spec.signals.length} signals</span>
            {!selected.seeded ? <span className="signal-spec-warning">Not seeded in database</span> : null}
          </div>
        ) : null}
      </div>
      {selected ? <SignalSpecTable spec={selected.spec} /> : null}
      <p className="tune-footnote">
        Read-only. Specs are authored in <code>backend/app/core/signal_catalog.py</code> and reseeded on backend startup.
      </p>
    </div>
  )
}
