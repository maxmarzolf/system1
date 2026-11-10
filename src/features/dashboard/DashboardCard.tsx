import AlgorithmIllustration from './AlgorithmIllustration'

/** One Dashboard card: a title and status badge, a few stats, the illustration, and one action. */
export default function DashboardCard({ title, badge, badgeTone, stats, slug, actionLabel, onAction }: {
  title: string
  badge: string
  /** `success`, `warning`, … (the coach status colours). */
  badgeTone: string
  stats: string[]
  /** Picks the illustration. */
  slug: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <article className="skill-map-card">
      <div className="skill-map-header">
        <h3>{title}</h3>
        <span className={`coach-status-value coach-status-value-${badgeTone}`}>{badge}</span>
      </div>
      <div className="dashboard-summary skill-map-card-stats">
        {stats.map((stat) => <span key={stat} className="coach-metric-chip">{stat}</span>)}
      </div>
      <AlgorithmIllustration slug={slug} pattern={title} />
      <div className="dashboard-mode-tabs">
        <button type="button" className="dashboard-mode-tab dashboard-mode-tab-actionable" onClick={onAction}>
          <span className="dashboard-mode-tab-label">{actionLabel}</span>
        </button>
      </div>
    </article>
  )
}
