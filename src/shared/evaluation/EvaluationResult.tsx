import {
  CORRECTNESS_SOURCE_LABELS,
  FLAG_LABELS,
  VERDICT_LABELS,
  correctnessSource,
  feedbackText,
  flagsOf,
  overallScore,
  overrideReasons,
  signalOutcomes,
  verdictOf,
  type Evaluation,
} from './evaluation'

/**
 * One result view for every modality: the verdict, the score, who decided, any flags, the scored
 * signals and, when it ran, the written feedback. The same evaluation shape comes back from every
 * modality, so the same view shows it.
 */
export default function EvaluationResult({ evaluation, compact = false }: { evaluation: Evaluation | null | undefined; compact?: boolean }) {
  const verdict = verdictOf(evaluation)
  if (!evaluation || !verdict) return null
  const score = overallScore(evaluation)
  const source = correctnessSource(evaluation)
  const flags = flagsOf(evaluation).filter((flag) => flag !== 'deterministic_override')
  const overrides = overrideReasons(evaluation)
  const signals = signalOutcomes(evaluation).filter((signal) => signal.status === 'scored' && signal.role !== 'diagnostic')
  const diagnoses = signalOutcomes(evaluation).filter((signal) => signal.status === 'scored' && signal.role === 'diagnostic' && signal.raw)
  const full = feedbackText(evaluation, 'fullFeedback')
  const focus = feedbackText(evaluation, 'primaryFocus')
  const next = feedbackText(evaluation, 'nextMove')

  return (
    <section className={`evaluation-result evaluation-result-${verdict}`} aria-label="Result">
      <div className="evaluation-result-head">
        <span className={`evaluation-verdict evaluation-verdict-${verdict}`}>{VERDICT_LABELS[verdict]}</span>
        {score !== null ? <span className="evaluation-score">{score.toFixed(0)}</span> : null}
        {source ? <span className="evaluation-source">{CORRECTNESS_SOURCE_LABELS[source]}</span> : null}
        {flags.map((flag) => <span key={flag} className="evaluation-flag">{FLAG_LABELS[flag] ?? flag}</span>)}
      </div>
      {overrides.length ? <p className="evaluation-overrides" role="note">{overrides.join(' ')}</p> : null}
      {full ? <p className="evaluation-feedback">{full}</p> : null}
      {!compact && (focus || next) ? (
        <dl className="evaluation-coaching">
          {focus ? <div><dt>Focus</dt><dd>{focus}</dd></div> : null}
          {next ? <div><dt>Next rep</dt><dd>{next}</dd></div> : null}
        </dl>
      ) : null}
      {!compact && (signals.length || diagnoses.length) ? (
        <ul className="evaluation-signals" aria-label="Signals">
          {signals.map((signal) => (
            <li key={signal.key}>
              <span>{signal.label}</span>
              <meter min={0} max={100} value={signal.score ?? 0} aria-label={`${signal.label} score`} />
              <span className="evaluation-signal-score">{signal.score?.toFixed(0)}</span>
            </li>
          ))}
          {diagnoses.map((signal) => (
            <li key={signal.key} className="evaluation-diagnosis"><span>{signal.label}</span><code>{String(signal.raw)}</code></li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
