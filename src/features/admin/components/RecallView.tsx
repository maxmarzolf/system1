import SignalSpecTable from '../SignalSpecTable'
import type { SignalSpec, SignalSpecCatalog } from '../signalSpecs'
import { TuneSection } from '@/shared/components/settingControls'

export function RecallSpec({ spec, title }: { spec: SignalSpec; title: string }) {
  return (
    <div className="admin-recall-spec">
      <div className="signal-spec-meta" aria-label="Spec details">
        <strong className="admin-recall-spec-title">{title}</strong>
        <span>Spec <code>{spec.algorithm}</code></span>
        <span>Version <code>v{spec.version}</code></span>
        <span>{spec.signals.length} signals</span>
      </div>
      <SignalSpecTable spec={spec} />
    </div>
  )
}

export function RecallView({ specs, scope }: { specs: SignalSpecCatalog | null; scope: string }) {
  if (!specs) return <p className="tune-footnote admin-page-error" aria-busy="true">Loading recall specs…</p>
  const algorithm = specs.algorithms.find((item) => item.slug === scope)
  const custom = specs.algorithms.filter((item) => !item.usesDefault)
  return (
    <TuneSection
      eyebrow="Recall"
      title={algorithm ? `${algorithm.name} signals` : 'All recall signals'}
      copy="Read-only. Recall answers are scored by the Signal Assessor against these specs, authored in backend/app/core/signal_catalog.py and reseeded on backend startup."
    >
      <div className="admin-recall-list">
        {algorithm ? (
          <>
            {algorithm.usesDefault ? <p className="tune-footnote">{algorithm.name} has no spec of its own, so it uses the default spec.</p> : null}
            {!algorithm.seeded ? <p className="tune-footnote signal-spec-warning">Not seeded in the database yet.</p> : null}
            <RecallSpec spec={algorithm.spec} title={algorithm.usesDefault ? 'Default spec' : algorithm.name} />
          </>
        ) : (
          <>
            <RecallSpec spec={specs.default} title="Default spec" />
            <p className="tune-footnote">
              Used by {specs.algorithms.length - custom.length} of {specs.algorithms.length} algorithms. These have their own:
            </p>
            {custom.map((item) => <RecallSpec key={item.slug} spec={item.spec} title={item.name} />)}
          </>
        )}
      </div>
    </TuneSection>
  )
}
