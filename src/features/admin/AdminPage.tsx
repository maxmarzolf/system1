import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TopNav from '@/app/TopNav'
import { TuneSection } from '@/shared/components/settingControls'
import { MODALITIES, MODALITY_LABELS, isModality, type Modality } from '@/shared/modality'
import { fetchSignalAdminCatalog } from './api'
import type { SignalAdminCatalog } from './api'
import { DirectiveEditor } from './components/DirectiveEditor'
import { NewSignal } from './components/NewSignal'
import { SettingsView } from './components/SettingsView'
import { SignalCard } from './components/SignalCard'
import { errorMessage } from './lib'

const ALL_SCOPES = 'all'
const SETTINGS_VIEW = 'settings'

/**
 * Everything that configures grading and generation: each modality's correctness question and
 * signals (the same editor for every modality), and the server-side settings.
 */
export default function AdminPage() {
  // The view lives in the URL (?modality=total-recall&scope=binary-search, or ?view=settings).
  const [searchParams, setSearchParams] = useSearchParams()
  const settingsOpen = searchParams.get('view') === SETTINGS_VIEW
  const requested = searchParams.get('modality')
  const modality: Modality = isModality(requested) ? requested : 'mcq'
  const scope = searchParams.get('scope') || ALL_SCOPES
  const select = (next: Modality, nextScope: string) => setSearchParams(
    next === 'mcq' && nextScope === ALL_SCOPES ? {} : { modality: next, scope: nextScope },
  )

  const [catalog, setCatalog] = useState<SignalAdminCatalog | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    if (settingsOpen) return
    const controller = new AbortController()
    fetchSignalAdminCatalog(modality, controller.signal)
      .then((result) => {
        setCatalog(result)
        setError('')
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason))
      })
    return () => controller.abort()
  }, [modality, settingsOpen])
  useEffect(load, [load])

  const current = catalog && catalog.modality === modality ? catalog : null
  const label = MODALITY_LABELS[modality]
  const algorithmName = (slug: string) => current?.algorithms.find((algorithm) => algorithm.slug === slug)?.name ?? slug
  const signalCount = (slug: string) => current?.signals.filter((signal) => signal.scope === slug).length ?? 0
  const scopes = [
    { slug: ALL_SCOPES, label: 'All', count: current?.signals.length ?? 0 },
    { slug: 'general', label: 'General', count: signalCount('general') },
    ...(current?.algorithms ?? []).map((algorithm) => ({ slug: algorithm.slug, label: algorithm.name, count: signalCount(algorithm.slug) })),
  ]

  // The selected scope's signals; "All" groups every scope, general first. Archived signals stay
  // in their group, after the active ones.
  const visible = (current?.signals ?? [])
    .filter((signal) => scope === ALL_SCOPES || signal.scope === scope)
    .sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'))
  const groups = [...new Set(visible.map((signal) => signal.scope))].sort(
    (a, b) => Number(a !== 'general') - Number(b !== 'general'),
  )
  const scopeLabel = scope === ALL_SCOPES ? `All ${label}` : scope === 'general' ? 'General' : algorithmName(scope)
  const generalCount = signalCount('general')
  const scopeCopy = scope === ALL_SCOPES
    ? `Every ${label} signal, grouped by scope. Archived signals are not used and can be restored; keys are permanent.`
    : scope === 'general'
      ? `Used for every ${label} answer: Jev signals in one call with the correctness question, deterministic ones computed locally.`
      : `Used in addition to the ${generalCount} general signal${generalCount === 1 ? '' : 's'} when the item's algorithm is ${algorithmName(scope)}.`

  return (
    <div className="app app-tune">
      <TopNav pinned solid />

      <section className="tune-surface">
        <div className="tune-hero">
          <div>
            <h2>Admin</h2>
            <p>How every answer is graded and every question is written. Each modality has a correctness question and signals, edited the same way; settings apply server-wide.</p>
          </div>
          <div className="tune-hero-meta" aria-label="Admin page behavior">
            <span>Saved explicitly</span>
            <span>Applies next evaluation</span>
          </div>
        </div>

        <div className="tune-layout">
          <nav className="tune-rail" aria-label="Modalities, scopes and settings">
            {MODALITIES.map((item) => (
              <div key={item} className="admin-rail-group">
                <button
                  type="button"
                  className={`admin-rail-group-label${!settingsOpen && modality === item ? ' admin-rail-active-group' : ''}`}
                  onClick={() => select(item, ALL_SCOPES)}
                >
                  {MODALITY_LABELS[item]}
                </button>
                {!settingsOpen && modality === item ? scopes.map((entry) => {
                  const selected = scope === entry.slug
                  return (
                    <button
                      key={entry.slug}
                      type="button"
                      className={`admin-rail-item${selected ? ' admin-rail-item-current' : ''}${entry.slug !== ALL_SCOPES && !entry.count ? ' admin-rail-item-empty' : ''}`}
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => select(item, entry.slug)}
                    >
                      <span>{entry.label}</span>
                      {entry.count ? <span className="admin-rail-count">{entry.count}</span> : null}
                    </button>
                  )
                }) : null}
              </div>
            ))}
            <div className="admin-rail-group">
              <button
                type="button"
                className={`admin-rail-group-label${settingsOpen ? ' admin-rail-active-group' : ''}`}
                aria-current={settingsOpen ? 'page' : undefined}
                onClick={() => setSearchParams({ view: SETTINGS_VIEW })}
              >
                Settings
              </button>
            </div>
          </nav>

          <div className="tune-content">
            {settingsOpen ? <SettingsView /> : null}
            {!settingsOpen && error ? <p className="admin-field-error admin-page-error" role="alert">{error}</p> : null}
            {!settingsOpen && !current && !error ? <p className="tune-footnote admin-page-error" aria-busy="true">Loading signals…</p> : null}
            {!settingsOpen && current ? (
              <>
                {scope === ALL_SCOPES || scope === 'general' ? (
                  <TuneSection eyebrow={label} title="Correctness question"
                    copy={'Decides whether the answer was correct: Jev answers "1" (correct) or "0", or the modality’s own check decides. The labels are fixed and this question cannot be archived.'}>
                    <DirectiveEditor modality={modality} directive={current.directive} onSaved={load} />
                  </TuneSection>
                ) : null}

                <TuneSection eyebrow={label} title={`${scopeLabel} signals`} copy={scopeCopy}>
                  <div className="admin-signal-list">
                    {groups.map((group) => (
                      <div key={group} className="admin-signal-group">
                        {scope === ALL_SCOPES ? <h4>{group === 'general' ? 'General' : algorithmName(group)}</h4> : null}
                        {visible.filter((signal) => signal.scope === group).map((signal) => (
                          <SignalCard key={`${modality}:${signal.key}`} signal={signal} catalog={current} onSaved={load} />
                        ))}
                      </div>
                    ))}
                    {!groups.length ? <p className="tune-footnote">No {scopeLabel} signals yet.</p> : null}
                    <NewSignal
                      key={`${modality}:${scope}`}
                      catalog={current}
                      defaultScope={scope === ALL_SCOPES ? 'general' : scope}
                      onSaved={load}
                    />
                  </div>
                </TuneSection>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
