import { type CSSProperties, useMemo } from 'react'

export type DailyWorkSegment = {
  slug: string
  count: number
}

export type DailyWorkDay = {
  date: string
  segments: DailyWorkSegment[]
}

export type DailyWorkActivity = {
  windowEnd: string
  days: DailyWorkDay[]
}

export type DailyWorkAlgorithm = {
  algorithm: string
  slug: string
}

type SwimLaneCell = {
  date: string
  hasWork: boolean
}

type SwimLaneRow = {
  label: string
  slug: string
  cells: SwimLaneCell[]
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

const parseCalendarDate = (value: string) => new Date(`${value}T12:00:00`)
const formatCalendarDate = (value: string) => shortDateFormatter.format(parseCalendarDate(value))
const formatCalendarWeekday = (value: string) => weekdayFormatter.format(parseCalendarDate(value))
const toCalendarDate = (value: Date) => {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
const addCalendarDays = (value: string, days: number) => {
  const next = parseCalendarDate(value)
  next.setDate(next.getDate() + days)
  return toCalendarDate(next)
}

const compactAlgorithmLabel = (algorithm: string) => {
  if (algorithm.length <= 18) return algorithm
  return algorithm.replace('Dynamic Programming', 'DP').replace('Priority Queue', 'PQ')
}

export default function DailyWorkHistory({
  activity,
  algorithmOrder,
  onSelectionChange,
}: {
  activity?: DailyWorkActivity
  algorithmOrder: DailyWorkAlgorithm[]
  onSelectionChange?: (slugs: string[]) => void
}) {
  const today = activity?.windowEnd
  const activityByDate = useMemo(
    () => new Map((activity?.days ?? []).map(day => [day.date, day])),
    [activity?.days],
  )
  const chartDates = useMemo(() => {
    if (!activity) return []
    const visibleHistoryStart = addCalendarDays(activity.windowEnd, -13)
    return activity.days
      .map(day => day.date)
      .filter(date => date >= visibleHistoryStart)
      .sort()
  }, [activity])

  const rows = useMemo<SwimLaneRow[]>(() => {
    if (!activity) return []
    return algorithmOrder.map(algorithm => ({
      label: algorithm.algorithm,
      slug: algorithm.slug,
      cells: chartDates.map(date => ({
        date,
        hasWork: (activityByDate.get(date)?.segments ?? []).some(segment =>
          segment.slug === algorithm.slug && segment.count > 0,
        ),
      })),
    }))
  }, [activity, activityByDate, algorithmOrder, chartDates])

  if (!activity) {
    return (
      <section className="daily-work-history" aria-label="Daily work history">
        <div className="daily-work-history-header">
          <p className="dashboard-activity-eyebrow">Daily Work History</p>
        </div>
        <p className="dashboard-mode-meta">Loading daily work history...</p>
      </section>
    )
  }

  return (
    <section className="daily-work-history" aria-label="Daily work history">
      <div className="daily-work-history-header">
        <p className="dashboard-activity-eyebrow">Daily Work History</p>
      </div>

      <div
        className="daily-work-history-swimlane"
        style={{ '--daily-work-history-days': chartDates.length } as CSSProperties}
      >
        <div aria-hidden="true" />
        <div className="daily-work-history-x-axis" aria-label="Days">
          {chartDates.map(date => (
            <div key={date} className={`daily-work-history-x-day${date === today ? ' daily-work-history-x-day-today' : ''}`}>
              <strong>{formatCalendarWeekday(date)}</strong>
              <span>{formatCalendarDate(date)}</span>
            </div>
          ))}
        </div>

        {rows.map(row => (
          <div key={row.slug} className="daily-work-history-lane">
            <div className="daily-work-history-lane-label">
              <strong title={row.label}>{compactAlgorithmLabel(row.label)}</strong>
            </div>
            <div className="daily-work-history-lane-cells">
              {row.cells.map(cell => {
                const title = `${row.label} on ${formatCalendarDate(cell.date)}: ${cell.hasWork ? 'work completed' : 'no work'}`
                return (
                  <button
                    key={`${row.slug}-${cell.date}`}
                    type="button"
                    className={`daily-work-history-cell${cell.hasWork ? ' daily-work-history-cell-active' : ''}`}
                    title={title}
                    aria-label={title}
                    disabled={!cell.hasWork}
                    onClick={cell.hasWork ? () => onSelectionChange?.([row.slug]) : undefined}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
