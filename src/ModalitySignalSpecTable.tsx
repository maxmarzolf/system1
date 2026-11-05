import type { ModalitySignalSpec, PluginSignal } from './signalSpecs'

type ModalitySignalSpecTableProps = {
  spec: ModalitySignalSpec
}

const formatWeight = (weight: number) => `${Math.round(weight * 100)}%`

const APPLIES_LABELS: Record<PluginSignal['appliesWhen'], string> = {
  always: 'always',
  correct: 'correct only',
  incorrect: 'incorrect only',
}

const describeResponse = (signal: PluginSignal) => {
  if (signal.source === 'deterministic') return 'computed locally'
  if (signal.primitive === 'noul') return 'Noul (yes probability)'
  if (signal.primitive === 'score') return `Score (0–${Math.max((signal.criteria as unknown[] | undefined)?.length ?? 1, 1) - 1})`
  const labels = Object.keys((signal.criteria as Record<string, unknown> | undefined) ?? {})
  return `Choice: ${labels.join(', ')}`
}

const describeQuestion = (signal: PluginSignal) => {
  if (signal.source === 'deterministic') return signal.description ?? ''
  return typeof signal.instructions === 'string' ? signal.instructions : JSON.stringify(signal.instructions)
}

export default function ModalitySignalSpecTable({ spec }: ModalitySignalSpecTableProps) {
  return (
    <div className="signal-spec">
      <div className="signal-spec-table-wrap">
        <table className="signal-spec-table">
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Role</th>
              <th scope="col">Jev response</th>
              <th scope="col">Weight</th>
              <th scope="col">Applies</th>
              <th scope="col">Question</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <strong>Correct choice</strong>
                <code>correctness</code>
              </th>
              <td>dimension</td>
              <td>Choice: 1, 0</td>
              <td>{formatWeight(spec.correctnessWeight)}</td>
              <td>always</td>
              <td>{spec.correctness?.instructions ?? 'Did the person choose the correct answer? (1 = answered correctly)'}</td>
            </tr>
            {spec.signals.map((signal) => (
              <tr key={signal.key}>
                <th scope="row">
                  <strong>{signal.label}</strong>
                  <code>{signal.key}</code>
                </th>
                <td>{signal.role}</td>
                <td>{describeResponse(signal)}</td>
                <td>{signal.role === 'diagnostic' ? '—' : formatWeight(signal.weight)}</td>
                <td>
                  {APPLIES_LABELS[signal.appliesWhen]}{signal.needsCorrectness ? ' · second call' : ''}
                  {signal.scope && signal.scope !== 'general' ? ` · ${signal.scope} only` : ''}
                </td>
                <td>{describeQuestion(signal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
