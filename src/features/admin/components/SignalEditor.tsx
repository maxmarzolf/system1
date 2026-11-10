import InfoTip from '@/shared/components/InfoTip'
import { SIGNAL_FIELD_HELP } from '../signalFieldHelp'
import { jevQuestionFor } from '../api'
import type { SignalAdminCatalog, SignalAppliesWhen, SignalAxis, SignalDraft, SignalPrimitive, SignalRole } from '../api'
import { ChoiceCriteriaEditor, NoulCriteriaEditor, ScoreCriteriaEditor } from './CriteriaEditors'
import { FieldError, JsonPreview } from './fields'
import { APPLIES_LABELS, PRIMITIVE_LABELS, ROLE_LABELS, type FieldErrors } from '../lib'

export function SignalEditor({
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
