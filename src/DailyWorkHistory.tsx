import { type CSSProperties, useEffect, useMemo, useRef } from 'react'
import { DAILY_WORK_RANGES, type DailyWorkRange, formatCalendarDate, formatCalendarWeekday } from './dailyWork'

export type DailyWorkSegment = {
  slug: string
  count: number
}

export type DailyWorkDay = {
  date: string
  segments: DailyWorkSegment[]
}

export type DailyWorkActivity = {
  windowStart?: string
  windowEnd: string
  days: DailyWorkDay[]
}

export type DailyWorkAlgorithm = {
  algorithm: string
  slug: string
}

type SwimLaneCell = {
  date: string
  count: number
}

type SwimLaneRow = {
  label: string
  slug: string
  cells: SwimLaneCell[]
}

const compactAlgorithmLabel = (algorithm: string) => {
  if (algorithm.length <= 18) return algorithm
  return algorithm.replace('Dynamic Programming', 'DP').replace('Priority Queue', 'PQ')
}

export default function DailyWorkHistory({
  activity,
  algorithmOrder,
  range,
  onRangeChange,
  selectedDate,
  onSelectDate,
  loading = false,
}: {
  activity?: DailyWorkActivity
  algorithmOrder: DailyWorkAlgorithm[]
  range: DailyWorkRange
  onRangeChange: (range: DailyWorkRange) => void
  selectedDate: string | null
  onSelectDate: (date: string) => void
  loading?: boolean
}) {
  const today = activity?.windowEnd
  const swimlaneRef = useRef<HTMLDivElement>(null)
  const chartDates = useMemo(() => (activity?.days ?? []).map(day => day.date), [activity])
  const dayTotals = useMemo(
    () => new Map((activity?.days ?? []).map(day => [day.date, day.segments.reduce((total, segment) => total + segment.count, 0)])),
    [activity],
  )
  const rows = useMemo<SwimLaneRow[]>(() => {
    if (!activity) return []
    const activityByDate = new Map(activity.days.map(day => [day.date, day]))
    return algorithmOrder.map(algorithm => ({
      label: algorithm.algorithm,
      slug: algorithm.slug,
      cells: chartDates.map(date => ({
        date,
        count: (activityByDate.get(date)?.segments ?? [])
          .filter(segment => segment.slug === algorithm.slug)
          .reduce((total, segment) => total + segment.count, 0),
      })),
    }))
  }, [activity, algorithmOrder, chartDates])

  // Long ranges scroll horizontally; start at the most recent days.
  useEffect(() => {
    const swimlane = swimlaneRef.current
    if (swimlane) swimlane.scrollLeft = swimlane.scrollWidth
  }, [chartDates])

  return (
    <section className="daily-work-history" aria-label="Daily work history" aria-busy={loading}>
      <div className="daily-work-history-header">
        <p className="dashboard-activity-eyebrow">Daily Work History</p>
        <div className="daily-work-history-ranges" role="group" aria-label="History range">
          {DAILY_WORK_RANGES.map(option => (
            <button
              key={option.value}
              type="button"
              className={`daily-work-history-range${option.value === range ? ' daily-work-history-range-active' : ''}`}
              aria-pressed={option.value === range}
              onClick={() => onRangeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {!activity ? (
        <p className="dashboard-mode-meta">Loading daily work history...</p>
      ) : (
        <div
          ref={swimlaneRef}
          className="daily-work-history-swimlane"
          style={{ '--daily-work-history-days': chartDates.length } as CSSProperties}
        >
          {rows.map(row => (
            <div key={row.slug} className="daily-work-history-lane">
              <div className="daily-work-history-lane-label">
                <strong title={row.label}>{compactAlgorithmLabel(row.label)}</strong>
              </div>
              <div className="daily-work-history-lane-cells">
                {row.cells.map(cell => {
                  const day = formatCalendarDate(cell.date)
                  const selected = cell.date === selectedDate
                  const className = [
                    'daily-work-history-cell',
                    cell.count ? 'daily-work-history-cell-active' : '',
                    selected ? 'daily-work-history-cell-selected' : '',
                  ].filter(Boolean).join(' ')
                  if (!cell.count) {
                    const title = `${row.label} on ${day}: no work`
                    return <span key={cell.date} className={className} title={title} role="img" aria-label={title} />
                  }
                  const title = `${row.label} on ${day}: ${cell.count} submission${cell.count === 1 ? '' : 's'}. Show the day's work.`
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      className={className}
                      title={title}
                      aria-label={title}
                      aria-pressed={selected}
                      onClick={() => onSelectDate(cell.date)}
                    />
                  )
                })}
              </div>
            </div>
          ))}

          <div className="daily-work-history-corner" aria-hidden="true" />
          <div className="daily-work-history-x-axis" role="group" aria-label="Days: select one to see its work">
            {chartDates.map(date => {
              const total = dayTotals.get(date) ?? 0
              const selected = date === selectedDate
              const label = `${formatCalendarWeekday(date)} ${formatCalendarDate(date)}: ${
                total ? `${total} submission${total === 1 ? '' : 's'}` : 'no work'
              }`
              return (
                <button
                  key={date}
                  type="button"
                  className={[
                    'daily-work-history-x-day',
                    total ? 'daily-work-history-x-day-active' : '',
                    date === today ? 'daily-work-history-x-day-today' : '',
                    selected ? 'daily-work-history-x-day-selected' : '',
                  ].filter(Boolean).join(' ')}
                  title={label}
                  aria-label={label}
                  aria-pressed={selected}
                  onClick={() => onSelectDate(date)}
                >
                  <strong>{formatCalendarWeekday(date)}</strong>
                  <span>{formatCalendarDate(date)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
