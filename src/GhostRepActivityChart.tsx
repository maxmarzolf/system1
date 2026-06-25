import { type CSSProperties, useMemo, useState } from 'react'

export type GhostRepActivitySegment = {
  pattern: string
  slug: string
  workType?: 'ghost-reps' | 'multiple-choice'
  count: number
  methods?: GhostRepActivityMethodSegment[]
}

export type GhostRepActivityMethodSegment = {
  method: string
  slug: string
  count: number
}

export type GhostRepActivityDay = {
  date: string
  total: number
  ghostRepCount?: number
  multipleChoiceCount?: number
  segments: GhostRepActivitySegment[]
}

export type GhostRepActivityPattern = {
  pattern: string
  slug: string
  totalGhostReps: number
  totalMultipleChoice?: number
  totalWork?: number
  daysSinceLastGhostRep: number | null
  daysSinceLastPractice?: number | null
}

export type GhostRepActivity = {
  windowStart: string
  windowEnd: string
  totalGhostReps: number
  totalMultipleChoice?: number
  workCount?: number
  activeDays: number
  peakDailyCount: number
  days: GhostRepActivityDay[]
  patterns: GhostRepActivityPattern[]
}

export type GhostRepPatternOrder = {
  pattern: string
  slug: string
  methods?: string[]
}

type SwimLaneCell = {
  date: string
  count: number
  methods: GhostRepActivityMethodSegment[]
}

type SwimLaneRow = {
  label: string
  slug: string
  parentSlug?: string
  cells: SwimLaneCell[]
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

const parseCalendarDate = (value: string) => new Date(`${value}T12:00:00`)
const formatCalendarDate = (value: string) => shortDateFormatter.format(parseCalendarDate(value))
const formatCalendarWeekday = (value: string) => weekdayFormatter.format(parseCalendarDate(value))
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const compactPatternLabel = (pattern: string) => {
  if (pattern.length <= 18) return pattern
  return pattern
    .replace('Dynamic Programming', 'DP')
    .replace('Priority Queue', 'PQ')
    .replace('Graph Traversal', 'Graphs')
}

const methodSummary = (methods: GhostRepActivityMethodSegment[]) => {
  if (methods.length === 0) return ''
  return methods
    .map(method => `${method.method}: ${method.count}`)
    .join(', ')
}

export default function GhostRepActivityChart({
  activity,
  patternOrder,
  onSelectionChange,
}: {
  activity?: GhostRepActivity
  patternOrder: GhostRepPatternOrder[]
  onSelectionChange?: (slugs: string[]) => void
}) {
  const [drilldownSlug, setDrilldownSlug] = useState<string | null>(null)
  const drilldownPattern = patternOrder.find(pattern => pattern.slug === drilldownSlug)

  const rows = useMemo<SwimLaneRow[]>(() => {
    if (!activity) return []

    if (drilldownPattern) {
      const methodRows = (drilldownPattern.methods ?? []).map(method => ({
        method,
        slug: slugify(method),
      }))
      const observedMethodSlugs = new Map<string, string>()
      for (const day of activity.days) {
        for (const segment of day.segments) {
          if (segment.slug !== drilldownPattern.slug || segment.workType === 'multiple-choice') continue
          for (const method of segment.methods ?? []) {
            observedMethodSlugs.set(method.slug, method.method)
          }
        }
      }
      for (const [slug, method] of observedMethodSlugs) {
        if (!methodRows.some(row => row.slug === slug)) {
          methodRows.push({ slug, method })
        }
      }

      return methodRows.map(method => {
        const cells = activity.days.map(day => {
          const ghostSegments = day.segments.filter(segment =>
            segment.slug === drilldownPattern.slug && segment.workType !== 'multiple-choice'
          )
          const count = ghostSegments.reduce((sum, segment) => {
            const methodCount = (segment.methods ?? [])
              .filter(item => item.slug === method.slug)
              .reduce((methodSum, item) => methodSum + item.count, 0)
            return sum + methodCount
          }, 0)
          return {
            date: day.date,
            count,
            methods: count > 0 ? [{ method: method.method, slug: method.slug, count }] : [],
          }
        })
        return {
          label: method.method,
          slug: method.slug,
          parentSlug: drilldownPattern.slug,
          cells,
        }
      })
    }

    return patternOrder.map(pattern => {
      const cells = activity.days.map(day => {
        const ghostSegments = day.segments.filter(segment =>
          segment.slug === pattern.slug && segment.workType !== 'multiple-choice'
        )
        const count = ghostSegments.reduce((sum, segment) => sum + segment.count, 0)
        const methodsBySlug = new Map<string, GhostRepActivityMethodSegment>()
        for (const segment of ghostSegments) {
          for (const method of segment.methods ?? []) {
            const current = methodsBySlug.get(method.slug)
            methodsBySlug.set(method.slug, {
              method: method.method,
              slug: method.slug,
              count: (current?.count ?? 0) + method.count,
            })
          }
        }
        return {
          date: day.date,
          count,
          methods: [...methodsBySlug.values()],
        }
      })
      return {
        label: pattern.pattern,
        slug: pattern.slug,
        cells,
      }
    })
  }, [activity, drilldownPattern, patternOrder])

  const peakCellCount = Math.max(...rows.flatMap(row => row.cells.map(cell => cell.count)), 1)

  if (!activity) {
    return (
      <section className="daily-work-history" aria-label="Daily work history">
        <div className="daily-work-history-header">
          <div>
            <p className="dashboard-activity-eyebrow">Daily Work History</p>
          </div>
        </div>
        <p className="dashboard-mode-meta">Loading ghost rep activity...</p>
      </section>
    )
  }

  return (
    <section className="daily-work-history" aria-label="Daily work history">
      <div className="daily-work-history-header">
        <div>
          <p className="dashboard-activity-eyebrow">Daily Work History</p>
          {drilldownPattern && <h2>{drilldownPattern.pattern}</h2>}
        </div>
        <div className="daily-work-history-stats">
          <span className="coach-metric-chip">{activity.totalGhostReps} Ghost Reps</span>
          <span className="coach-metric-chip">{activity.activeDays} active days</span>
        </div>
      </div>

      <div
        className="daily-work-history-swimlane"
        style={{ '--daily-work-history-days': activity.days.length } as CSSProperties}
      >
        <div className="daily-work-history-axis-corner">
          {drilldownPattern && (
            <button
              type="button"
              className="daily-work-history-axis-button"
              onClick={() => setDrilldownSlug(null)}
            >
              All algorithms
            </button>
          )}
        </div>
        <div className="daily-work-history-x-axis" aria-label="Days">
          {activity.days.map(day => (
            <div key={day.date} className="daily-work-history-x-day">
              <strong>{formatCalendarWeekday(day.date)}</strong>
              <span>{formatCalendarDate(day.date)}</span>
            </div>
          ))}
        </div>

        {rows.map(row => (
          <div key={row.slug} className="daily-work-history-lane">
            <div className="daily-work-history-lane-label">
              {drilldownPattern ? (
                <strong title={row.label}>{row.label}</strong>
              ) : (
                <button
                  type="button"
                  className="daily-work-history-lane-button"
                  title={row.label}
                  onClick={() => setDrilldownSlug(row.slug)}
                >
                  {compactPatternLabel(row.label)}
                </button>
              )}
            </div>
            <div className="daily-work-history-lane-cells">
              {row.cells.map(cell => {
                const intensity = cell.count > 0 ? `${Math.round(Math.max(0.28, cell.count / peakCellCount) * 72)}%` : '0%'
                const methods = methodSummary(cell.methods)
                const title = cell.count > 0
                  ? `${row.label} on ${formatCalendarDate(cell.date)}: ${cell.count} ghost rep${cell.count === 1 ? '' : 's'}${methods ? ` (${methods})` : ''}`
                  : `${row.label} on ${formatCalendarDate(cell.date)}: no ghost reps`
                return (
                  <button
                    key={`${row.slug}-${cell.date}`}
                    type="button"
                    className={cell.count > 0 ? 'daily-work-history-cell daily-work-history-cell-active' : 'daily-work-history-cell'}
                    style={{ '--daily-work-history-cell-alpha': intensity } as CSSProperties}
                    title={title}
                    aria-label={title}
                    disabled={cell.count === 0}
                    onClick={cell.count > 0 ? () => onSelectionChange?.([row.parentSlug ?? row.slug]) : undefined}
                  >
                    {cell.count > 0 && <span>{cell.count}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
