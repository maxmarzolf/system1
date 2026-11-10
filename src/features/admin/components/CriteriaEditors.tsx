import { useState } from 'react'
import InfoTip from '@/shared/components/InfoTip'
import { SIGNAL_FIELD_HELP } from '../signalFieldHelp'
import type { ChoiceRow } from '../lib'

export function ChoiceCriteriaEditor({
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

export function ScoreCriteriaEditor({ levels, onChange }: { levels: string[]; onChange: (levels: string[]) => void }) {
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

export function NoulCriteriaEditor({
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
