import type { ReactNode } from 'react'

type TuneSectionProps = {
  eyebrow: string
  title: string
  copy: string
  action?: ReactNode
  children: ReactNode
}

export type SelectOption<T extends string> = {
  value: T
  label: string
}

type SelectControlProps<T extends string> = {
  label: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  description?: string
}

export function TuneSection({ eyebrow, title, copy, action, children }: TuneSectionProps) {
  return (
    <section className="tune-section">
      <div className="tune-section-header">
        <div>
          <p className="tune-eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          <p className="tune-copy">{copy}</p>
        </div>
        {action ? <div className="tune-section-action">{action}</div> : null}
      </div>
      <div className="tune-section-body">{children}</div>
    </section>
  )
}

export function SelectControl<T extends string>({ label, value, options, onChange, description }: SelectControlProps<T>) {
  return (
    <label className="tune-control">
      <span className="tune-control-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description ? <span className="tune-control-description">{description}</span> : null}
    </label>
  )
}

export function ToggleControl({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <label className="tune-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function NumberControl({
  label,
  value,
  min,
  max,
  onChange,
  description,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  description?: string
}) {
  return (
    <label className="tune-control">
      <span className="tune-control-label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(event) => {
          const nextValue = Number.parseInt(event.currentTarget.value, 10)
          onChange(Number.isNaN(nextValue) ? min : nextValue)
        }}
      />
      {description ? <span className="tune-control-description">{description}</span> : null}
    </label>
  )
}
