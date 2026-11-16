import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCalendarDate, formatCalendarWeekday } from '@/shared/lib/dailyWork'
import SubmissionDetail from './SubmissionDetail'
import { activityWeeks, dayWork, monthLabels } from './activityGrid'

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

/**
 * The year of practice as a contribution graph (a square per day: practised or not), an
 * algorithm multi-select under it, and the submissions behind the selection.
 *
 * - A day shows its submissions, and the filter lists the algorithms practised that day;
 *   choosing some narrows the day to them.
 * - With no day, choosing algorithms highlights the days they were practised and lists all of
 *   their submissions from the year.
 */
export default function DailyWorkHistory({
  activity,
  algorithmOrder,
  selectedDate,
  onSelectDate,
  selectedAlgorithms,
  onToggleAlgorithm,
  onClearAlgorithms,
  loading = false,
}: {
  activity?: DailyWorkActivity
  algorithmOrder: DailyWorkAlgorithm[]
  selectedDate: string | null
  /** A day was clicked (the selected one again clears it). */
  onSelectDate: (date: string) => void
  selectedAlgorithms: string[]
  onToggleAlgorithm: (slug: string) => void
  onClearAlgorithms: () => void
  loading?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // The hovered (or focused) day reads out in the header; a tooltip would widen the scrolling grid.
  const [hovered, setHovered] = useState<string | null>(null)
  const weeks = useMemo(() => activityWeeks(activity?.days ?? []), [activity])
  const months = useMemo(() => monthLabels(weeks), [weeks])
  const work = useMemo(() => new Map((activity?.days ?? []).map((day) => [day.date, dayWork(day)])), [activity])
  const names = useMemo(() => new Map(algorithmOrder.map((algorithm) => [algorithm.slug, algorithm.algorithm])), [algorithmOrder])

  // The filter offers the selected day's algorithms, or every algorithm practised this year;
  // the selected ones come first.
  const offered = useMemo(() => {
    const practised = new Set(
      selectedDate ? work.get(selectedDate)?.slugs ?? [] : [...work.values()].flatMap((day) => day.slugs),
    )
    selectedAlgorithms.forEach((slug) => practised.add(slug))
    const available = algorithmOrder.filter((algorithm) => practised.has(algorithm.slug))
    const selected = (algorithm: DailyWorkAlgorithm) => selectedAlgorithms.includes(algorithm.slug)
    return [...available.filter(selected), ...available.filter((algorithm) => !selected(algorithm))]
  }, [algorithmOrder, selectedAlgorithms, selectedDate, work])

  // Highlight the selected algorithms' days only while no day is chosen.
  const highlighting = !selectedDate && selectedAlgorithms.length > 0
  const today = activity?.windowEnd

  // On narrow screens the year scrolls sideways; start at the most recent weeks.
  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  }, [weeks])

  const describe = (date: string) => {
    const day = work.get(date)
    const when = `${formatCalendarWeekday(date)} ${formatCalendarDate(date)}`
    if (!day?.total) return `${when}: no work`
    const algorithms = day.slugs.map((slug) => names.get(slug) ?? slug).join(', ')
    return `${when}: ${day.total} submission${day.total === 1 ? '' : 's'} (${algorithms})`
  }

  return (
    <section className="daily-work-history work-history" aria-label="Daily work history" aria-busy={loading}>
      <div className="daily-work-history-header">
        <p className="section-eyebrow">Daily Work History</p>
        {activity ? (
          <p className="work-history-note" aria-live="polite">
            {hovered ? describe(hovered) : `${[...work.values()].filter((day) => day.total).length} days practised in the last year`}
          </p>
        ) : null}
      </div>

      {!activity ? <p className="section-meta">Loading daily work history...</p> : (
        <>
          <div ref={scrollRef} className="activity-grid-scroll">
            <div className="activity-grid" style={{ ['--activity-weeks' as string]: weeks.length }}>
              <div className="activity-grid-months" aria-hidden="true">
                {months.map((month) => (
                  <span key={month.week} style={{ gridColumn: month.week + 1 }}>{month.label}</span>
                ))}
              </div>
              <div className="activity-grid-weeks" role="group" aria-label="Days of the last year: select a practised day to see its submissions">
                {weeks.map((week, column) => (
                  <div key={column} className="activity-grid-week">
                    {week.map((day, row) => {
                      if (!day) return <span key={row} className="activity-cell activity-cell-empty" aria-hidden="true" />
                      const total = work.get(day.date)?.total ?? 0
                      const selected = day.date === selectedDate
                      const highlighted = highlighting && total > 0
                        && (work.get(day.date)?.slugs ?? []).some((slug) => selectedAlgorithms.includes(slug))
                      const className = [
                        'activity-cell',
                        total ? 'activity-cell-active' : '',
                        highlighting && total ? (highlighted ? 'activity-cell-highlighted' : 'activity-cell-dimmed') : '',
                        selected ? 'activity-cell-selected' : '',
                        day.date === today ? 'activity-cell-today' : '',
                      ].filter(Boolean).join(' ')
                      const label = describe(day.date)
                      const hover = {
                        onMouseEnter: () => setHovered(day.date),
                        onMouseLeave: () => setHovered((current) => (current === day.date ? null : current)),
                      }
                      if (!total) return <span key={day.date} className={className} role="img" aria-label={label} {...hover} />
                      return (
                        <button key={day.date} type="button" className={className} aria-label={label} aria-pressed={selected}
                          onClick={() => onSelectDate(day.date)} {...hover}
                          onFocus={() => setHovered(day.date)} onBlur={hover.onMouseLeave} />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="algorithm-filter" role="group"
            aria-label={selectedDate ? `Algorithms practised on ${formatCalendarDate(selectedDate)}` : 'Algorithms: select to highlight their days'}>
            {selectedAlgorithms.length ? (
              <button type="button" className="algorithm-filter-clear" onClick={onClearAlgorithms}>Clear</button>
            ) : null}
            {offered.map((algorithm) => {
              const selected = selectedAlgorithms.includes(algorithm.slug)
              return (
                <button key={algorithm.slug} type="button" aria-pressed={selected}
                  className={`algorithm-filter-chip${selected ? ' algorithm-filter-chip-selected' : ''}`}
                  onClick={() => onToggleAlgorithm(algorithm.slug)}>
                  {algorithm.algorithm}
                </button>
              )
            })}
            {!offered.length ? <span className="section-meta">No algorithms practised yet.</span> : null}
          </div>

          <SubmissionDetail date={selectedDate} algorithms={selectedAlgorithms}
            algorithmNames={Object.fromEntries(names)} />
        </>
      )}
    </section>
  )
}
