import type { SignalSpec } from './signalSpecs'

type SignalSpecTableProps = {
  spec: SignalSpec
  showStrategy?: boolean
}

const formatWeight = (weight: number) => `${Math.round(weight * 100)}%`

export default function SignalSpecTable({ spec, showStrategy = true }: SignalSpecTableProps) {
  return (
    <div className="signal-spec">
      <div className="signal-spec-table-wrap">
        <table className="signal-spec-table">
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Role</th>
              <th scope="col">Kind</th>
              <th scope="col">Weight</th>
              <th scope="col">Axis</th>
              <th scope="col">Assessor guidance</th>
              {showStrategy ? <th scope="col">Variation strategy</th> : null}
            </tr>
          </thead>
          <tbody>
            {spec.signals.map((signal) => (
              <tr key={signal.key}>
                <th scope="row">
                  <strong>{signal.label}</strong>
                  <code>{signal.key}</code>
                </th>
                <td>{signal.role}</td>
                <td>{signal.kind === 'boolean' ? 'valid / error' : 'score 0–100'}</td>
                <td>{formatWeight(signal.weight)}</td>
                <td>{signal.axis ?? '—'}</td>
                <td>{signal.guidance}</td>
                {showStrategy ? <td>{signal.variationStrategy}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="signal-spec-structural">
        <span>Structural elements</span>
        {spec.structuralElements.map((element) => <code key={element}>{element}</code>)}
      </p>
    </div>
  )
}
