import { type CSSProperties, useMemo } from 'react'

export type GhostRepActivitySegment = {
  pattern: string
  slug: string
  count: number
}

export type GhostRepActivityDay = {
  date: string
  total: number
  segments: GhostRepActivitySegment[]
}

export type GhostRepActivityPattern = {
  pattern: string
  slug: string
  totalGhostReps: number
  daysSinceLastGhostRep: number | null
}

export type GhostRepActivity = {
  windowStart: string
  windowEnd: string
  totalGhostReps: number
  activeDays: number
  peakDailyCount: number
  days: GhostRepActivityDay[]
  patterns: GhostRepActivityPattern[]
}

export type GhostRepPatternOrder = {
  pattern: string
  slug: string
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const longDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

const GHOST_REP_PATTERN_COLORS = [
  '#2f80ed',
  '#27ae60',
  '#f2994a',
  '#bb6bd9',
  '#eb5757',
  '#00a6a6',
  '#f2c94c',
  '#56ccf2',
  '#6fcf97',
  '#ff7a90',
  '#9b8cff',
  '#b08d57',
]

const parseCalendarDate = (value: string) => new Date(`${value}T12:00:00`)
const formatCalendarDate = (value: string) => shortDateFormatter.format(parseCalendarDate(value))
const formatCalendarLongDate = (value: string) => longDateFormatter.format(parseCalendarDate(value))
const formatCalendarWeekday = (value: string) => weekdayFormatter.format(parseCalendarDate(value))

const formatGhostFreshness = (days: number | null) => {
  if (days === null) return 'No ghost reps yet'
  if (days === 0) return 'Today'
  if (days === 1) return '1d quiet'
  return `${days}d quiet`
}

export default function GhostRepActivityChart({
  activity,
  patternOrder,
}: {
  activity?: GhostRepActivity
  patternOrder: GhostRepPatternOrder[]
}) {
  const colorBySlug = useMemo(() => {
    const entries = patternOrder.map((pattern, index) => [
      pattern.slug,
      GHOST_REP_PATTERN_COLORS[index % GHOST_REP_PATTERN_COLORS.length],
    ] as const)
    return new Map(entries)
  }, [patternOrder])

  const patternsByRecentGap = useMemo(
    () =>
      [...(activity?.patterns ?? [])]
        .sort((a, b) => {
          const aDays = a.daysSinceLastGhostRep ?? Number.POSITIVE_INFINITY
          const bDays = b.daysSinceLastGhostRep ?? Number.POSITIVE_INFINITY
          if (bDays !== aDays) return bDays - aDays
          return a.pattern.localeCompare(b.pattern)
        })
        .slice(0, 5),
    [activity?.patterns]
  )

  const topPatterns = useMemo(
    () =>
      [...(activity?.patterns ?? [])]
        .filter((pattern) => pattern.totalGhostReps > 0)
        .sort((a, b) => b.totalGhostReps - a.totalGhostReps)
        .slice(0, 6),
    [activity?.patterns]
  )

  if (!activity) {
    return (
      <section className="dashboard-ghost-panel" aria-label="Ghost Rep activity">
        <div className="dashboard-ghost-header">
          <div>
            <p className="dashboard-activity-eyebrow">Ghost Reps</p>
            <h2>Daily pattern mix</h2>
          </div>
        </div>
        <p className="dashboard-mode-meta">Loading Ghost Rep activity...</p>
      </section>
    )
  }

  return (
    <section className="dashboard-ghost-panel" aria-label="Ghost Rep activity">
      <div className="dashboard-ghost-header">
        <div>
          <p className="dashboard-activity-eyebrow">Ghost Reps</p>
          <h2>Daily pattern mix</h2>
        </div>
        <div className="dashboard-ghost-stats">
          <span className="coach-metric-chip">{activity.totalGhostReps} reps</span>
          <span className="coach-metric-chip">{activity.activeDays} active days</span>
        </div>
      </div>

      <div className="dashboard-ghost-chart">
        {activity.days.map((day) => {
          const peak = Math.max(activity.peakDailyCount, 1)
          const fillPercent = day.total > 0 ? Math.max(8, Math.round((day.total / peak) * 100)) : 0
          return (
            <div key={day.date} className="dashboard-ghost-day">
              <div className="dashboard-ghost-day-label">
                <strong>{formatCalendarWeekday(day.date)}</strong>
                <span>{formatCalendarDate(day.date)}</span>
              </div>
              <div
                className={day.total > 0 ? 'dashboard-ghost-bar' : 'dashboard-ghost-bar dashboard-ghost-bar-empty'}
                title={day.total > 0 ? `${formatCalendarLongDate(day.date)}: ${day.total} Ghost Reps` : `${formatCalendarLongDate(day.date)}: no Ghost Reps`}
              >
                {day.total > 0 ? (
                  <div className="dashboard-ghost-fill" style={{ width: `${fillPercent}%` }}>
                    {day.segments.map((segment) => (
                      <span
                        key={`${day.date}-${segment.slug}`}
                        className="dashboard-ghost-segment"
                        style={{
                          flexGrow: segment.count,
                          backgroundColor: colorBySlug.get(segment.slug) ?? GHOST_REP_PATTERN_COLORS[0],
                        }}
                        title={`${segment.pattern}: ${segment.count} Ghost Rep${segment.count === 1 ? '' : 's'}`}
                        aria-label={`${segment.pattern}: ${segment.count} Ghost Rep${segment.count === 1 ? '' : 's'}`}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="dashboard-ghost-empty-label">No reps</span>
                )}
              </div>
              <span className="dashboard-ghost-day-total">{day.total}</span>
            </div>
          )
        })}
      </div>

      <div className="dashboard-ghost-footer">
        <div className="dashboard-ghost-legend" aria-label="Most practiced Ghost Rep patterns">
          {topPatterns.length > 0 ? (
            topPatterns.map((pattern) => (
              <span key={pattern.slug} className="dashboard-ghost-legend-item">
                <span
                  className="dashboard-ghost-swatch"
                  style={{ '--ghost-color': colorBySlug.get(pattern.slug) ?? GHOST_REP_PATTERN_COLORS[0] } as CSSProperties}
                />
                {pattern.pattern}
                <strong>{pattern.totalGhostReps}</strong>
              </span>
            ))
          ) : (
            <span className="dashboard-mode-meta">Ghost Reps will appear here after your next supported submit.</span>
          )}
        </div>
        <div className="dashboard-ghost-staleness" aria-label="Ghost Rep recency by pattern">
          {patternsByRecentGap.map((pattern) => (
            <span key={pattern.slug} className={pattern.daysSinceLastGhostRep === null || pattern.daysSinceLastGhostRep >= 5 ? 'dashboard-ghost-gap dashboard-ghost-gap-hot' : 'dashboard-ghost-gap'}>
              {pattern.pattern}
              <strong>{formatGhostFreshness(pattern.daysSinceLastGhostRep)}</strong>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
