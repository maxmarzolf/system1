import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SignalSpecTable from './SignalSpecTable'
import { fetchSignalSpecCatalog } from './signalSpecs'
import type { SignalSpec, SignalSpecCatalog } from './signalSpecs'
import TopNav from './TopNav'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import { TuneSection } from './tuneControls'
import InfoTip from './InfoTip'
import { SIGNAL_FIELD_HELP } from './signalFieldHelp'
import {
  SignalAdminError,
  createSignal,
  draftFromSignal,
  emptySignalDraft,
  fetchMcqSamples,
  fetchSignalAdminCatalog,
  fetchSignalRevisions,
  jevQuestionFor,
  setSignalArchived,
  trySignal,
  updateDirective,
  updateSignal,
} from './signalAdmin'
import type {
  AdminSignal,
  CorrectnessDirective,
  McqSample,
  SignalAdminCatalog,
  SignalAppliesWhen,
  SignalAxis,
  SignalDraft,
  SignalPrimitive,
  SignalRevision,
  SignalRole,
  SignalTryResult,
} from './signalAdmin'

type FieldErrors = Record<string, string>

const PRIMITIVE_LABELS: Record<SignalPrimitive, string> = {
  choice: 'Choice — pick one label',
  score: 'Score — ordered levels',
  noul: 'Noul — yes probability',
}
const ROLE_LABELS: Record<SignalRole, string> = {
  dimension: 'Dimension (scored)',
  modifier: 'Modifier (scored)',
  diagnostic: 'Diagnostic (recorded, not scored)',
}
const APPLIES_LABELS: Record<SignalAppliesWhen, string> = {
  always: 'Always',
  correct: 'Correct answers only',
  incorrect: 'Incorrect answers only',
}

const formatShare = (share: number) => `${Math.round(share * 1000) / 10}%`

const describeResponse = (draft: SignalDraft) => {
  if (draft.source === 'deterministic') return `computed: ${draft.implementation ?? '—'}`
  if (draft.primitive === 'score') return `Score 0–${Math.max((Array.isArray(draft.criteria) ? draft.criteria.length : 1) - 1, 0)}`
  if (draft.primitive === 'choice') {
    const labels = draft.criteria && !Array.isArray(draft.criteria) ? Object.keys(draft.criteria) : []
    return `Choice (${labels.length} labels)`
  }
  return 'Noul'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  return errors[field] ? <span className="admin-field-error" role="alert">{errors[field]}</span> : null
}

function JsonPreview({ value }: { value: unknown }) {
  return <pre className="signal-trace-json">{JSON.stringify(value, null, 2)}</pre>
}

// ─── Criteria editors ───

type ChoiceRow = { label: string; description: string; score: string }

function ChoiceCriteriaEditor({
  criteria,
  scoreMap,
  showScores,
  onChange,
}: {
  criteria: Record<string, string | null>
  scoreMap: Record<string, number>
  showScores: boolean
  onChange: (criteria: Record<string, string | null>, scoreMap: Record<string, number>) => void
}) {
  const [rows, setRows] = useState<ChoiceRow[]>(() => {
    const entries = Object.entries(criteria)
    return entries.length
      ? entries.map(([label, description]) => ({
          label,
          description: description ?? '',
          score: scoreMap[label] === undefined ? '' : String(scoreMap[label]),
        }))
      : [{ label: '', description: '', score: '' }]
  })

  const commit = (next: ChoiceRow[]) => {
    setRows(next)
    const nextCriteria: Record<string, string | null> = {}
    const nextScores: Record<string, number> = {}
    for (const row of next) {
      const label = row.label.trim()
      if (!label && !row.description.trim()) continue
      nextCriteria[label] = row.description.trim() || null
      const score = Number.parseFloat(row.score)
      if (row.score.trim() !== '' && !Number.isNaN(score)) nextScores[label] = score
    }
    onChange(nextCriteria, nextScores)
  }
  const update = (index: number, patch: Partial<ChoiceRow>) =>
    commit(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  const labels = rows.map((row) => row.label.trim()).filter(Boolean)
  const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index)

  return (
    <div className="admin-criteria">
      <div className={showScores ? 'admin-criteria-head admin-criteria-head-scored' : 'admin-criteria-head'}>
        <span>Label</span>
        <span>Description sent to Jev</span>
        {showScores ? <span>Score 0–100 <InfoTip label="score map">{SIGNAL_FIELD_HELP.scoreMap}</InfoTip></span> : null}
        <span aria-hidden="true" />
      </div>
      {rows.map((row, index) => (
        <div key={index} className={showScores ? 'admin-criteria-row admin-criteria-row-scored' : 'admin-criteria-row'}>
          <input
            aria-label={`Label ${index + 1}`}
            value={row.label}
            placeholder="off_by_one"
            onChange={(event) => update(index, { label: event.target.value })}
          />
          <input
            aria-label={`Description ${index + 1}`}
            value={row.description}
            placeholder="What this label means"
            onChange={(event) => update(index, { description: event.target.value })}
          />
          {showScores ? (
            <input
              aria-label={`Score ${index + 1}`}
              type="number"
              min={0}
              max={100}
              value={row.score}
              placeholder="—"
              onChange={(event) => update(index, { score: event.target.value })}
            />
          ) : null}
          <button type="button" className="secondary admin-icon-button" aria-label={`Remove label ${index + 1}`}
            onClick={() => commit(rows.filter((_row, rowIndex) => rowIndex !== index))}>
            ×
          </button>
        </div>
      ))}
      {duplicates.length ? <span className="admin-field-error">Duplicate labels: {[...new Set(duplicates)].join(', ')}</span> : null}
      <button type="button" className="secondary admin-small-button" onClick={() => commit([...rows, { label: '', description: '', score: '' }])}>
        Add label
      </button>
    </div>
  )
}

function ScoreCriteriaEditor({ levels, onChange }: { levels: string[]; onChange: (levels: string[]) => void }) {
  const rows = levels.length ? levels : ['', '']
  const move = (index: number, offset: number) => {
    const next = [...rows]
    const [level] = next.splice(index, 1)
    next.splice(index + offset, 0, level)
    onChange(next)
  }
  return (
    <div className="admin-criteria">
      <div className="admin-criteria-head admin-criteria-head-levels">
        <span>#</span>
        <span>Level description, lowest first</span>
        <span aria-hidden="true" />
      </div>
      {rows.map((level, index) => (
        <div key={index} className="admin-criteria-row admin-criteria-row-levels">
          <code>{index}</code>
          <input
            aria-label={`Level ${index}`}
            value={level}
            onChange={(event) => onChange(rows.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
          />
          <span className="admin-row-actions">
            <button type="button" className="secondary admin-icon-button" aria-label={`Move level ${index} up`}
              disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" className="secondary admin-icon-button" aria-label={`Move level ${index} down`}
              disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button>
            <button type="button" className="secondary admin-icon-button" aria-label={`Remove level ${index}`}
              onClick={() => onChange(rows.filter((_item, itemIndex) => itemIndex !== index))}>×</button>
          </span>
        </div>
      ))}
      <button type="button" className="secondary admin-small-button" onClick={() => onChange([...rows, ''])}>Add level</button>
    </div>
  )
}

function NoulCriteriaEditor({
  criteria,
  onChange,
}: {
  criteria: Record<string, string | null>
  onChange: (criteria: Record<string, string | null> | null) => void
}) {
  const update = (key: 'true' | 'false', value: string) => {
    const next = { true: criteria.true ?? null, false: criteria.false ?? null, [key]: value || null }
    onChange(next.true || next.false ? next : null)
  }
  return (
    <div className="admin-control-pair">
      <label className="tune-control">
        <span className="tune-control-label">Yes means (optional) <InfoTip label="yes outcome">{SIGNAL_FIELD_HELP.criteria.noul}</InfoTip></span>
        <input value={criteria.true ?? ''} onChange={(event) => update('true', event.target.value)} />
      </label>
      <label className="tune-control">
        <span className="tune-control-label">No means (optional) <InfoTip label="no outcome">{SIGNAL_FIELD_HELP.criteria.noul}</InfoTip></span>
        <input value={criteria.false ?? ''} onChange={(event) => update('false', event.target.value)} />
      </label>
    </div>
  )
}

// ─── Signal editor ───

function SignalEditor({
  draft,
  onChange,
  errors,
  catalog,
  isNew,
}: {
  draft: SignalDraft
  onChange: (draft: SignalDraft) => void
  errors: FieldErrors
  catalog: SignalAdminCatalog
  isNew: boolean
}) {
  const set = <K extends keyof SignalDraft>(key: K, value: SignalDraft[K]) => onChange({ ...draft, [key]: value })
  const setPrimitive = (primitive: SignalPrimitive) => {
    const criteria = primitive === 'score' ? ['', ''] : primitive === 'choice' ? {} : null
    onChange({ ...draft, primitive, criteria, scoreMap: {} })
  }
  const choiceCriteria = draft.criteria && !Array.isArray(draft.criteria) ? draft.criteria : {}

  return (
    <div className="admin-editor">
      <div className="admin-control-pair">
        <label className="tune-control">
          <span className="tune-control-label">Key {isNew ? '' : '(permanent)'} <InfoTip label="key">{SIGNAL_FIELD_HELP.key}</InfoTip></span>
          <input value={draft.key} disabled={!isNew} placeholder="heapInvariant" onChange={(event) => set('key', event.target.value)} />
          <FieldError errors={errors} field="key" />
        </label>
        <label className="tune-control">
          <span className="tune-control-label">Label <InfoTip label="label">{SIGNAL_FIELD_HELP.label}</InfoTip></span>
          <input value={draft.label} onChange={(event) => set('label', event.target.value)} />
          <FieldError errors={errors} field="label" />
        </label>
      </div>

      <label className="tune-control">
        <span className="tune-control-label">
          Description (admins only, not sent to Jev) <InfoTip label="description">{SIGNAL_FIELD_HELP.description}</InfoTip>
        </span>
        <textarea
          className="admin-textarea"
          rows={2}
          value={draft.description}
          placeholder="What this signal is for and how to read it."
          onChange={(event) => set('description', event.target.value)}
        />
        <FieldError errors={errors} field="description" />
      </label>

      <div className="admin-control-pair">
        <label className="tune-control">
          <span className="tune-control-label">Scope <InfoTip label="scope">{SIGNAL_FIELD_HELP.scope}</InfoTip></span>
          <select value={draft.scope} onChange={(event) => set('scope', event.target.value)}>
            <option value="general">General — every MCQ</option>
            {catalog.algorithms.map((algorithm) => (
              <option key={algorithm.slug} value={algorithm.slug}>{algorithm.name} only</option>
            ))}
          </select>
          <FieldError errors={errors} field="scope" />
        </label>
        <label className="tune-control">
          <span className="tune-control-label">Source <InfoTip label="source">{SIGNAL_FIELD_HELP.source}</InfoTip></span>
          <select
            value={draft.source}
            disabled={!isNew}
            onChange={(event) => {
              const source = event.target.value as SignalDraft['source']
              onChange(source === 'deterministic'
                ? { ...draft, source, primitive: null, criteria: null, scoreMap: {}, instructions: '', needsCorrectness: false,
                    implementation: catalog.implementations[0]?.name ?? null }
                : { ...draft, source, implementation: null, primitive: 'noul', criteria: null })
            }}
          >
            <option value="jev">Jev question</option>
            <option value="deterministic">Computed in code</option>
          </select>
        </label>
      </div>

      {draft.source === 'deterministic' ? (
        <label className="tune-control">
          <span className="tune-control-label">Implementation <InfoTip label="implementation">{SIGNAL_FIELD_HELP.implementation}</InfoTip></span>
          <select value={draft.implementation ?? ''} disabled={!isNew} onChange={(event) => set('implementation', event.target.value)}>
            {catalog.implementations.map((implementation) => (
              <option key={implementation.name} value={implementation.name}>{implementation.name}</option>
            ))}
          </select>
          <span className="tune-control-description">
            {catalog.implementations.find((item) => item.name === draft.implementation)?.description ?? ''} Logic lives in code.
          </span>
          <FieldError errors={errors} field="implementation" />
        </label>
      ) : (
        <>
          <label className="tune-control">
            <span className="tune-control-label">Jev primitive <InfoTip label="Jev primitive">{SIGNAL_FIELD_HELP.primitive}</InfoTip></span>
            <select value={draft.primitive ?? 'noul'} onChange={(event) => setPrimitive(event.target.value as SignalPrimitive)}>
              {(Object.keys(PRIMITIVE_LABELS) as SignalPrimitive[]).map((primitive) => (
                <option key={primitive} value={primitive}>{PRIMITIVE_LABELS[primitive]}</option>
              ))}
            </select>
            <FieldError errors={errors} field="primitive" />
          </label>
          <label className="tune-control">
            <span className="tune-control-label">Instructions (the question Jev answers) <InfoTip label="instructions">{SIGNAL_FIELD_HELP.instructions}</InfoTip></span>
            <textarea
              className="admin-textarea"
              rows={3}
              value={draft.instructions}
              onChange={(event) => set('instructions', event.target.value)}
            />
            <span className="tune-control-description">
              Jev reads the state fields{' '}
              {[...catalog.stateFields, ...(draft.needsCorrectness ? ['answeredCorrectly'] : [])].map((field, index, fields) => (
                <span key={field}><code>{field}</code>{index < fields.length - 1 ? ', ' : ''}</span>
              ))}.
            </span>
            <FieldError errors={errors} field="instructions" />
          </label>
          <div className="tune-control">
            <span className="tune-control-label">Criteria <InfoTip label="criteria">{SIGNAL_FIELD_HELP.criteria[draft.primitive ?? 'noul']}</InfoTip></span>
            {draft.primitive === 'choice' ? (
              <ChoiceCriteriaEditor
                key={`${draft.key}-choice`}
                criteria={choiceCriteria}
                scoreMap={draft.scoreMap}
                showScores={draft.role !== 'diagnostic'}
                onChange={(criteria, scoreMap) => onChange({ ...draft, criteria, scoreMap })}
              />
            ) : draft.primitive === 'score' ? (
              <ScoreCriteriaEditor
                levels={Array.isArray(draft.criteria) ? draft.criteria : []}
                onChange={(levels) => set('criteria', levels)}
              />
            ) : (
              <NoulCriteriaEditor criteria={choiceCriteria} onChange={(criteria) => set('criteria', criteria)} />
            )}
            <FieldError errors={errors} field="criteria" />
            <FieldError errors={errors} field="scoreMap" />
          </div>
        </>
      )}

      <div className="admin-control-grid">
        <label className="tune-control">
          <span className="tune-control-label">Role <InfoTip label="role">{SIGNAL_FIELD_HELP.role}</InfoTip></span>
          <select value={draft.role} onChange={(event) => set('role', event.target.value as SignalRole)}>
            {(Object.keys(ROLE_LABELS) as SignalRole[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
          <FieldError errors={errors} field="role" />
        </label>
        <label className="tune-control">
          <span className="tune-control-label">Weight <InfoTip label="weight">{SIGNAL_FIELD_HELP.weight}</InfoTip></span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={draft.role === 'diagnostic' ? 0 : draft.weight}
            disabled={draft.role === 'diagnostic'}
            onChange={(event) => set('weight', Number.parseFloat(event.target.value) || 0)}
          />
          <FieldError errors={errors} field="weight" />
        </label>
        <label className="tune-control">
          <span className="tune-control-label">Applies <InfoTip label="applies">{SIGNAL_FIELD_HELP.appliesWhen}</InfoTip></span>
          <select value={draft.appliesWhen} onChange={(event) => set('appliesWhen', event.target.value as SignalAppliesWhen)}>
            {(Object.keys(APPLIES_LABELS) as SignalAppliesWhen[]).map((value) => (
              <option key={value} value={value}>{APPLIES_LABELS[value]}</option>
            ))}
          </select>
          <FieldError errors={errors} field="appliesWhen" />
        </label>
        <label className="tune-control">
          <span className="tune-control-label">Axis <InfoTip label="axis">{SIGNAL_FIELD_HELP.axis}</InfoTip></span>
          <select value={draft.axis ?? ''} onChange={(event) => set('axis', (event.target.value || null) as SignalAxis | null)}>
            <option value="">None</option>
            <option value="fidelity">Fidelity</option>
            <option value="executable">Executable</option>
            <option value="fluency">Fluency</option>
          </select>
          <FieldError errors={errors} field="axis" />
        </label>
        <label className="tune-control">
          <span className="tune-control-label">Display order <InfoTip label="display order">{SIGNAL_FIELD_HELP.displayOrder}</InfoTip></span>
          <input type="number" step={10} value={draft.displayOrder}
            onChange={(event) => set('displayOrder', Number.parseInt(event.target.value, 10) || 0)} />
        </label>
      </div>
      {draft.source === 'jev' ? (
        <label className="tune-toggle">
          <input type="checkbox" checked={draft.needsCorrectness} onChange={(event) => set('needsCorrectness', event.target.checked)} />
          <span>
            Needs the correctness result (adds <code>answeredCorrectly</code>; costs a second Jev call){' '}
            <InfoTip label="needs the correctness result">{SIGNAL_FIELD_HELP.needsCorrectness}</InfoTip>
          </span>
        </label>
      ) : null}

      <details className="signal-trace-raw" open>
        <summary>Sent to Jev</summary>
        {jevQuestionFor(draft) ? <JsonPreview value={{ [draft.key || 'newSignal']: jevQuestionFor(draft) }} /> : (
          <p className="tune-footnote">Computed locally; nothing is sent to Jev.</p>
        )}
      </details>
    </div>
  )
}

// ─── Try it ───

function TryPanel({ draft }: { draft: SignalDraft }) {
  const [samples, setSamples] = useState<McqSample[] | null>(null)
  const [problemId, setProblemId] = useState('')
  const [choiceId, setChoiceId] = useState('')
  const [result, setResult] = useState<SignalTryResult | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  const loadSamples = () => {
    fetchMcqSamples()
      .then((items) => {
        setSamples(items)
        const first = items[0]
        if (first) {
          setProblemId(first.id)
          setChoiceId(first.choices.find((choice) => choice.id !== first.correctChoiceId)?.id ?? first.correctChoiceId)
        }
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }
  const sample = samples?.find((item) => item.id === problemId)

  const run = async () => {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      setResult(await trySignal(draft, problemId, choiceId))
    } catch (reason) {
      setError(reason instanceof SignalAdminError && Object.keys(reason.fieldErrors).length
        ? Object.values(reason.fieldErrors).join(' ')
        : errorMessage(reason))
    } finally {
      setRunning(false)
    }
  }

  return (
    <details className="signal-trace-raw" onToggle={(event) => {
      if ((event.currentTarget as HTMLDetailsElement).open && samples === null) loadSamples()
    }}>
      <summary>Try it against Jev</summary>
      <div className="admin-try">
        {samples && !samples.length ? <p className="tune-footnote">No stored MCQs yet. Generate some on the practice page.</p> : null}
        {samples?.length ? (
          <>
            <label className="tune-control">
              <span className="tune-control-label">Stored question <InfoTip label="stored question">{SIGNAL_FIELD_HELP.tryQuestion}</InfoTip></span>
              <select value={problemId} onChange={(event) => {
                const next = samples.find((item) => item.id === event.target.value)
                setProblemId(event.target.value)
                setChoiceId(next?.choices[0]?.id ?? '')
              }}>
                {samples.map((item) => <option key={item.id} value={item.id}>{item.question.slice(0, 110)}</option>)}
              </select>
            </label>
            <label className="tune-control">
              <span className="tune-control-label">Submitted answer <InfoTip label="submitted answer">{SIGNAL_FIELD_HELP.tryAnswer}</InfoTip></span>
              <select value={choiceId} onChange={(event) => setChoiceId(event.target.value)}>
                {sample?.choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.id}. {choice.text.slice(0, 90)}{choice.id === sample.correctChoiceId ? ' (correct)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-actions">
              <button type="button" onClick={run} disabled={running || !problemId || !choiceId}>
                {running ? 'Asking Jev…' : 'Run draft'}
              </button>
              <span className="tune-footnote">Uses the unsaved draft. One Jev call; nothing is stored.</span>
            </div>
          </>
        ) : null}
        {error ? <p className="admin-field-error" role="alert">{error}</p> : null}
        {result ? (
          <div className="admin-try-result">
            <dl className="signal-trace-facts">
              <div><dt>Answered correctly</dt><dd>{result.answeredCorrectly ? 'yes' : 'no'}</dd></div>
              <div><dt>Applies</dt><dd>{result.applies ? 'yes' : 'no — would be not_applicable'}</dd></div>
              <div><dt>Answer</dt><dd><code>{result.result.raw === null ? '—' : String(result.result.raw)}</code></dd></div>
              <div><dt>Score</dt><dd>{result.result.score === null ? '— (not scored)' : result.result.score.toFixed(1)}</dd></div>
              <div><dt>Confidence</dt><dd>{result.result.confidence === null ? '—' : result.result.confidence.toFixed(2)}</dd></div>
              {result.model ? <div><dt>Model</dt><dd><code>{result.model}</code></dd></div> : null}
            </dl>
            <JsonPreview value={{ question: result.question, answer: result.answer }} />
          </div>
        ) : null}
      </div>
    </details>
  )
}

// ─── Revisions ───

function RevisionHistory({ subject }: { subject: string }) {
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

// ─── Signal card ───

/** The collapsed card's middle line: what Jev is asked, or what the code computes. */
const signalSummaryText = (signal: AdminSignal, catalog: SignalAdminCatalog) => {
  if (signal.source === 'deterministic') {
    const implementation = catalog.implementations.find((item) => item.name === signal.implementation)
    return `Computed in code${implementation?.description ? `: ${implementation.description}` : '.'}`
  }
  return signal.instructions || 'No instructions yet.'
}

function SignalCard({
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

// ─── Correctness question ───

function DirectiveEditor({ directive, onSaved }: { directive: CorrectnessDirective; onSaved: () => void }) {
  const original = useMemo(() => ({
    instructions: directive.instructions,
    criteria: { '1': directive.criteria['1'] ?? '', '0': directive.criteria['0'] ?? '' },
    correctnessWeight: directive.correctnessWeight,
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
      await updateDirective({ ...draft, version: directive.version })
      setMessage('Saved. Applies to the next MCQ evaluation.')
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
          <span className="tune-control-description">{formatShare(directive.weightShare)} of a general MCQ's overall score.</span>
          <FieldError errors={errors} field="correctnessWeight" />
        </label>
      </div>
      {message ? <p className={Object.keys(errors).length ? 'admin-field-error' : 'admin-success'} role="status">{message}</p> : null}
      <div className="admin-actions">
        <button type="button" disabled={!dirty || busy} onClick={save}>Save</button>
        <button type="button" className="secondary" disabled={!dirty || busy} onClick={() => setDraft(original)}>Discard</button>
      </div>
      <details className="signal-trace-raw">
        <summary>Sent to Jev</summary>
        <JsonPreview value={{ correctness: { type: 'choice', instructions: draft.instructions, criteria: draft.criteria } }} />
      </details>
      <RevisionHistory subject={`directive:${directive.modality}`} />
    </div>
  )
}

// ─── New signal ───

function NewSignal({
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

// ─── Recall (read-only specs) ───

function RecallSpec({ spec, title }: { spec: SignalSpec; title: string }) {
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

function RecallView({ specs, scope }: { specs: SignalSpecCatalog | null; scope: string }) {
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

// ─── Page ───

type QuestionType = 'mcq' | 'recall'
const QUESTION_TYPE_LABELS: Record<QuestionType, string> = { mcq: 'MCQ', recall: 'Recall' }
const ALL_SCOPES = 'all'

export default function AdminPage() {
  const configuredProviderLabel = useConfiguredProviderLabel()
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
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} pinned solid />

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
