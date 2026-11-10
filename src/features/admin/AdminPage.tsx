import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchSignalSpecCatalog } from './signalSpecs'
import type { SignalSpecCatalog } from './signalSpecs'
import TopNav from '@/app/TopNav'
import { TuneSection } from '@/shared/components/settingControls'
import { fetchSignalAdminCatalog } from './api'
import type { SignalAdminCatalog } from './api'
import { DirectiveEditor } from './components/DirectiveEditor'
import { NewSignal } from './components/NewSignal'
import { RecallView } from './components/RecallView'
import { SignalCard } from './components/SignalCard'
import { errorMessage } from './lib'

type QuestionType = 'mcq' | 'recall'
const QUESTION_TYPE_LABELS: Record<QuestionType, string> = { mcq: 'MCQ', recall: 'Recall' }
const ALL_SCOPES = 'all'

export default function AdminPage() {
  const [catalog, setCatalog] = useState<SignalAdminCatalog | null>(null)
  const [specs, setSpecs] = useState<SignalSpecCatalog | null>(null)
  const [error, setError] = useState('')
  // Question type and scope live in the URL (?type=recall&scope=binary-search), so views are linkable.
  const [searchParams, setSearchParams] = useSearchParams()
  const questionType: QuestionType = searchParams.get('type') === 'recall' ? 'recall' : 'mcq'
  const scope = searchParams.get('scope') || ALL_SCOPES
  const select = (type: QuestionType, nextScope: string) => setSearchParams(
    nextScope === ALL_SCOPES && type === 'mcq' ? {} : { type, scope: nextScope },
  )

  const load = useCallback(() => {
    fetchSignalAdminCatalog()
      .then((result) => {
        setCatalog(result)
        setError('')
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }, [])

  useEffect(load, [load])
  useEffect(() => {
    fetchSignalSpecCatalog().then(setSpecs).catch((reason: unknown) => setError(errorMessage(reason)))
  }, [])

  const algorithmName = (slug: string) => catalog?.algorithms.find((algorithm) => algorithm.slug === slug)?.name ?? slug
  const signalCount = (slug: string) => catalog?.signals.filter((signal) => signal.scope === slug).length ?? 0
  const mcqScopes = [
    { slug: ALL_SCOPES, label: 'All', count: catalog?.signals.length ?? 0 },
    { slug: 'general', label: 'General', count: signalCount('general') },
    ...(catalog?.algorithms ?? []).map((algorithm) => ({ slug: algorithm.slug, label: algorithm.name, count: signalCount(algorithm.slug) })),
  ]
  const recallScopes = [
    { slug: ALL_SCOPES, label: 'All', count: 0 },
    ...(specs?.algorithms ?? []).map((algorithm) => ({ slug: algorithm.slug, label: algorithm.name, count: algorithm.usesDefault ? 0 : algorithm.spec.signals.length })),
  ]

  // MCQ: the selected scope's signals; "All" groups every scope, general first. Archived signals
  // stay in their group, after the active ones.
  const visible = (catalog?.signals ?? [])
    .filter((signal) => scope === ALL_SCOPES || signal.scope === scope)
    .sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'))
  const groups = [...new Set(visible.map((signal) => signal.scope))].sort(
    (a, b) => Number(a !== 'general') - Number(b !== 'general'),
  )
  const scopeLabel = scope === ALL_SCOPES ? 'All MCQ' : scope === 'general' ? 'General' : algorithmName(scope)
  const generalCount = signalCount('general')
  const scopeCopy = scope === ALL_SCOPES
    ? 'Every MCQ signal, grouped by scope. Archived signals are not sent to Jev and can be restored; keys are permanent.'
    : scope === 'general'
      ? 'Asked for every MCQ, in one Jev call with the correctness question.'
      : `Asked in addition to the ${generalCount} general signal${generalCount === 1 ? '' : 's'} when the MCQ's algorithm is ${algorithmName(scope)}.`

  return (
    <div className="app app-tune">
      <TopNav pinned solid />

      <section className="tune-surface">
        <div className="tune-hero">
          <div>
            <h2>Admin</h2>
            <p>Signals each question type produces. MCQ signals are Jev questions you can edit; recall signals are the assessor&rsquo;s read-only specs.</p>
          </div>
          <div className="tune-hero-meta" aria-label="Admin page behavior">
            <span>Saved explicitly</span>
            <span>Applies next evaluation</span>
          </div>
        </div>

        <div className="tune-layout">
          <nav className="tune-rail" aria-label="Question types and scopes">
            {(['mcq', 'recall'] as QuestionType[]).map((type) => (
              <div key={type} className="admin-rail-group">
                <button
                  type="button"
                  className={`admin-rail-group-label${questionType === type ? ' admin-rail-active-group' : ''}`}
                  onClick={() => select(type, ALL_SCOPES)}
                >
                  {QUESTION_TYPE_LABELS[type]}
                </button>
                {(type === 'mcq' ? mcqScopes : recallScopes).map((item) => {
                  const current = questionType === type && scope === item.slug
                  return (
                    <button
                      key={item.slug}
                      type="button"
                      className={`admin-rail-item${current ? ' admin-rail-item-current' : ''}${item.slug !== ALL_SCOPES && !item.count ? ' admin-rail-item-empty' : ''}`}
                      aria-current={current ? 'page' : undefined}
                      onClick={() => select(type, item.slug)}
                    >
                      <span>{item.label}</span>
                      {item.count ? <span className="admin-rail-count">{item.count}</span> : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          <div className="tune-content">
            {error ? <p className="admin-field-error admin-page-error" role="alert">{error}</p> : null}
            {questionType === 'recall' ? <RecallView specs={specs} scope={scope} /> : null}
            {questionType === 'mcq' && !catalog && !error ? <p className="tune-footnote admin-page-error" aria-busy="true">Loading signals…</p> : null}
            {questionType === 'mcq' && catalog ? (
              <>
                {scope === ALL_SCOPES || scope === 'general' ? (
                  <TuneSection eyebrow="MCQ" title="Correctness question"
                    copy={'Decides whether the answer was correct. Jev answers "1" (correct) or "0"; the labels are fixed and this question cannot be archived.'}>
                    <DirectiveEditor directive={catalog.directive} onSaved={load} />
                  </TuneSection>
                ) : null}

                <TuneSection eyebrow="MCQ" title={`${scopeLabel} signals`} copy={scopeCopy}>
                  <div className="admin-signal-list">
                    {groups.map((group) => (
                      <div key={group} className="admin-signal-group">
                        {scope === ALL_SCOPES ? <h4>{group === 'general' ? 'General' : algorithmName(group)}</h4> : null}
                        {visible.filter((signal) => signal.scope === group).map((signal) => (
                          <SignalCard key={signal.key} signal={signal} catalog={catalog} onSaved={load} />
                        ))}
                      </div>
                    ))}
                    {!groups.length ? <p className="tune-footnote">No {scopeLabel} signals yet.</p> : null}
                    <NewSignal
                      key={scope}
                      catalog={catalog}
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
