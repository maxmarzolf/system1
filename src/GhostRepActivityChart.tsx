import { type CSSProperties, useEffect, useMemo, useState } from 'react'

export type GhostRepActivitySkillSegment = {
  skill: string
  slug: string
  count: number
}

export type GhostRepActivitySegment = {
  algorithm: string
  slug: string
  workType?: 'ghost-reps' | 'multiple-choice'
  count: number
  skills?: GhostRepActivitySkillSegment[]
}

export type GhostRepActivityDay = {
  date: string
  total: number
  ghostRepCount?: number
  multipleChoiceCount?: number
  segments: GhostRepActivitySegment[]
}

export type GhostRepActivityAlgorithm = {
  algorithm: string
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
  algorithms: GhostRepActivityAlgorithm[]
}

export type GhostRepAlgorithmOrder = {
  algorithm: string
  slug: string
  skills?: string[]
}

export type GhostRepSpacedRepetitionDay = {
  date: string
  status: 'empty' | 'completed' | 'failed' | 'due' | 'scheduled' | 'overdue'
  label: string
}

export type GhostRepSpacedRepetitionTrack = {
  id: string
  label: string
  slug: string
  level: 'pattern' | 'method'
  parentSlug: string | null
  parentLabel: string | null
  coreAlgorithmCount: number
  requiredGhostReps: number
  status: 'not_started' | 'acquisition' | 'failed' | 'overdue' | 'due' | 'scheduled' | 'maintenance'
  statusLabel: string
  stageLabel: string
  completedSessions: number
  startedAt: string | null
  lastAttemptedAt: string | null
  lastCompletedAt: string | null
  nextDueAt: string | null
  daysUntilDue: number | null
  days: GhostRepSpacedRepetitionDay[]
}

export type GhostRepSpacedRepetition = {
  today: string
  windowStart: string
  windowEnd: string
  intervals: number[]
  requiredGhostReps: number
  tracks: GhostRepSpacedRepetitionTrack[]
  queue: GhostRepSpacedRepetitionTrack[]
}

type SwimLaneCell = {
  date: string
  count: number
  skills: GhostRepActivitySkillSegment[]
  scheduleStatus?: GhostRepSpacedRepetitionDay['status']
  scheduleLabel?: string
}

type SwimLaneRow = {
  label: string
  slug: string
  parentSlug?: string
  scheduleTrackId: string
  cells: SwimLaneCell[]
}

type CadencePreset = 'compact' | 'balanced' | 'wide'

const CADENCE_PRESETS: Record<CadencePreset, { label: string; intervals: number[] }> = {
  compact: { label: 'Compact', intervals: [0, 1, 3, 7, 14, 30] },
  balanced: { label: 'Balanced', intervals: [0, 1, 3, 7, 14, 30, 60, 90] },
  wide: { label: 'Wide', intervals: [0, 2, 7, 21, 45, 90] },
}

const TRACKED_ALGORITHMS_STORAGE_KEY = 'system1.history.tracked-spaced-repetition-algorithms'

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

const parseCalendarDate = (value: string) => new Date(`${value}T12:00:00`)
const formatCalendarDate = (value: string) => shortDateFormatter.format(parseCalendarDate(value))
const formatCalendarWeekday = (value: string) => weekdayFormatter.format(parseCalendarDate(value))
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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
const startOfCalendarWeek = (value: string) => {
  const date = parseCalendarDate(value)
  date.setDate(date.getDate() - date.getDay())
  return toCalendarDate(date)
}

const compactAlgorithmLabel = (algorithm: string) => {
  if (algorithm.length <= 18) return algorithm
  return algorithm.replace('Dynamic Programming', 'DP').replace('Priority Queue', 'PQ')
}

const skillSummary = (skills: GhostRepActivitySkillSegment[]) => {
  if (skills.length === 0) return ''
  return skills.map(skill => `${skill.skill}: ${skill.count}`).join(', ')
}

export default function GhostRepActivityChart({
  activity,
  algorithmOrder,
  spacedRepetition,
  onSelectionChange,
}: {
  activity?: GhostRepActivity
  algorithmOrder: GhostRepAlgorithmOrder[]
  spacedRepetition?: GhostRepSpacedRepetition
  onSelectionChange?: (slugs: string[]) => void
}) {
  const [drilldownSlug, setDrilldownSlug] = useState<string | null>(null)
  const [cadencePreset, setCadencePreset] = useState<CadencePreset>('balanced')
  const [sessionTarget, setSessionTarget] = useState(spacedRepetition?.requiredGhostReps ?? 1)
  const [trackedAlgorithms, setTrackedAlgorithms] = useState<Set<string>>(() => {
    try {
      const stored = window.localStorage.getItem(TRACKED_ALGORITHMS_STORAGE_KEY)
      const values = stored ? JSON.parse(stored) : []
      return new Set(Array.isArray(values) ? values.filter(value => typeof value === 'string') : [])
    } catch {
      return new Set()
    }
  })

  const drilldownAlgorithm = algorithmOrder.find(algorithm => algorithm.slug === drilldownSlug) ?? null
  const today = spacedRepetition?.today ?? activity?.windowEnd
  const activityByDate = useMemo(
    () => new Map((activity?.days ?? []).map(day => [day.date, day])),
    [activity?.days],
  )
  const chartDates = useMemo(() => {
    if (!activity) return []
    const visibleHistoryStart = today ? addCalendarDays(today, -13) : activity.windowStart
    const dates = new Set(
      activity.days
        .map(day => day.date)
        .filter(date => date >= visibleHistoryStart),
    )
    for (const track of spacedRepetition?.tracks ?? []) {
      for (const day of track.days) dates.add(day.date)
    }
    return [...dates].sort()
  }, [activity, spacedRepetition?.tracks, today])
  const scheduleByTrackId = useMemo(() => {
    const next = new Map<string, Map<string, GhostRepSpacedRepetitionDay>>()
    for (const track of spacedRepetition?.tracks ?? []) {
      next.set(track.id, new Map(track.days.map(day => [day.date, day])))
    }
    return next
  }, [spacedRepetition?.tracks])

  useEffect(() => {
    window.localStorage.setItem(TRACKED_ALGORITHMS_STORAGE_KEY, JSON.stringify([...trackedAlgorithms]))
  }, [trackedAlgorithms])

  const toggleTrackedAlgorithm = (slug: string) => {
    setTrackedAlgorithms(current => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  const rows = useMemo<SwimLaneRow[]>(() => {
    if (!activity) return []

    if (drilldownAlgorithm) {
      const skillRows = (drilldownAlgorithm.skills ?? []).map(skill => ({ skill, slug: slugify(skill) }))
      const observedSkillSlugs = new Map<string, string>()
      for (const day of activity.days) {
        for (const segment of day.segments) {
          if (segment.slug !== drilldownAlgorithm.slug || segment.workType === 'multiple-choice') continue
          for (const skill of segment.skills ?? []) {
            observedSkillSlugs.set(skill.slug, skill.skill)
          }
        }
      }
      for (const [slug, skill] of observedSkillSlugs) {
        if (!skillRows.some(row => row.slug === slug)) {
          skillRows.push({ slug, skill })
        }
      }

      return skillRows.map(skill => {
        const cells = activity.days.map(day => {
          const ghostSegments = day.segments.filter(segment =>
            segment.slug === drilldownAlgorithm.slug && segment.workType !== 'multiple-choice',
          )
          const count = ghostSegments.reduce((sum, segment) => {
            const skillCount = (segment.skills ?? [])
              .filter(item => item.slug === skill.slug)
              .reduce((skillSum, item) => skillSum + item.count, 0)
            return sum + skillCount
          }, 0)
          return {
            date: day.date,
            count,
            skills: count > 0 ? [{ skill: skill.skill, slug: skill.slug, count }] : [],
          }
        })
        return {
          label: skill.skill,
          slug: skill.slug,
          parentSlug: drilldownAlgorithm.slug,
          scheduleTrackId: drilldownAlgorithm.slug,
          cells,
        }
      })
    }

    return algorithmOrder.map(algorithm => {
      const scheduleDays = scheduleByTrackId.get(algorithm.slug)
      const cells = chartDates.map(date => {
        const day = activityByDate.get(date)
        const ghostSegments = (day?.segments ?? []).filter(segment =>
          segment.slug === algorithm.slug && segment.workType !== 'multiple-choice',
        )
        const count = ghostSegments.reduce((sum, segment) => sum + segment.count, 0)
        const skillsBySlug = new Map<string, GhostRepActivitySkillSegment>()
        for (const segment of ghostSegments) {
          for (const skill of segment.skills ?? []) {
            const current = skillsBySlug.get(skill.slug)
            skillsBySlug.set(skill.slug, {
              skill: skill.skill,
              slug: skill.slug,
              count: (current?.count ?? 0) + skill.count,
            })
          }
        }
        return {
          date,
          count,
          skills: [...skillsBySlug.values()],
          scheduleStatus: scheduleDays?.get(date)?.status,
          scheduleLabel: scheduleDays?.get(date)?.label,
        }
      })
      return {
        label: algorithm.algorithm,
        slug: algorithm.slug,
        scheduleTrackId: algorithm.slug,
        cells,
      }
    })
  }, [activity, activityByDate, algorithmOrder, chartDates, drilldownAlgorithm, scheduleByTrackId])

  const selectedTrack = spacedRepetition?.tracks.find(track => track.id === drilldownAlgorithm?.slug)
  const selectedTrend = useMemo(() => {
    if (!activity || !drilldownAlgorithm || !today) return null
    const relevantDays = activity.days.map(day => ({
      date: day.date,
      count: day.segments
        .filter(segment => segment.slug === drilldownAlgorithm.slug && segment.workType !== 'multiple-choice')
        .reduce((sum, segment) => sum + segment.count, 0),
    }))
    const currentWeekStart = startOfCalendarWeek(today)
    const weekStarts = Array.from({ length: 6 }, (_, index) => addCalendarDays(currentWeekStart, (index - 5) * 7))
    const weeks = weekStarts.map(weekStart => ({
      weekStart,
      count: relevantDays
        .filter(day => day.date >= weekStart && day.date < addCalendarDays(weekStart, 7))
        .reduce((sum, day) => sum + day.count, 0),
    }))
    const currentWeek = weeks.at(-1)?.count ?? 0
    const previousWeek = weeks.at(-2)?.count ?? 0
    const activeDays = relevantDays.filter(day => day.count > 0).length
    const allTime = activity.algorithms.find(algorithm => algorithm.slug === drilldownAlgorithm.slug)?.totalGhostReps ?? 0
    return { weeks, currentWeek, previousWeek, activeDays, allTime }
  }, [activity, drilldownAlgorithm, today])

  const forecast = useMemo(() => {
    if (!selectedTrack || !today) return []
    const intervals = CADENCE_PRESETS[cadencePreset].intervals
    const completedIndex = Math.min(selectedTrack.completedSessions, intervals.length - 1)
    const previousOffset = intervals[Math.max(0, completedIndex - 1)] ?? 0
    const anchor = selectedTrack.lastCompletedAt ?? today
    return intervals
      .slice(completedIndex, completedIndex + 4)
      .map((offset, index) => ({
        date: addCalendarDays(anchor, Math.max(0, offset - previousOffset)),
        stage: index === 0 ? selectedTrack.stageLabel : `Day ${offset}`,
      }))
  }, [cadencePreset, selectedTrack, today])

  const peakCellCount = Math.max(...rows.flatMap(row => row.cells.map(cell => cell.count)), 1)
  const dueTrackCount = (spacedRepetition?.queue ?? []).filter(
    track => track.level === 'pattern' && trackedAlgorithms.has(track.slug),
  ).length

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
          {drilldownAlgorithm && <h2>{drilldownAlgorithm.algorithm}</h2>}
        </div>
        <div className="daily-work-history-stats">
          <span className="coach-metric-chip">{activity.totalGhostReps} Ghost Reps</span>
          <span className="coach-metric-chip">{activity.activeDays} active days</span>
          {spacedRepetition && (
            <span className="coach-metric-chip">
              {trackedAlgorithms.size} tracked · {dueTrackCount} due
            </span>
          )}
        </div>
      </div>

      {drilldownAlgorithm && selectedTrend && (
        <div className="repetition-outlook">
          <div className="repetition-outlook-header">
            <div>
              <p className="dashboard-activity-eyebrow">Repetition outlook</p>
              <p className="repetition-outlook-copy">A planning lens only — practice whenever you want.</p>
            </div>
            <div className="repetition-outlook-header-actions">
              <button
                type="button"
                className={`repetition-track-toggle repetition-track-toggle-primary${trackedAlgorithms.has(drilldownAlgorithm.slug) ? ' selected' : ''}`}
                aria-pressed={trackedAlgorithms.has(drilldownAlgorithm.slug)}
                aria-label={`${trackedAlgorithms.has(drilldownAlgorithm.slug) ? 'Stop tracking' : 'Track'} ${drilldownAlgorithm.algorithm} spaced repetitions`}
                onClick={() => toggleTrackedAlgorithm(drilldownAlgorithm.slug)}
              >
                <span>Spaced reps</span>
                <span className="repetition-track-switch" aria-hidden="true"><i /></span>
              </button>
              <div className="repetition-outlook-metrics">
                <span><strong>{selectedTrend.currentWeek}</strong> this week</span>
                <span><strong>{selectedTrend.previousWeek}</strong> prior week</span>
                <span><strong>{selectedTrend.allTime}</strong> all time</span>
                <span><strong>{selectedTrend.activeDays}</strong> active days / 6 wk</span>
              </div>
            </div>
          </div>

          <div className="repetition-outlook-body">
            <div className="repetition-weekly-trend" aria-label={`${drilldownAlgorithm.algorithm} weekly ghost rep trend`}>
              {selectedTrend.weeks.map(week => {
                const peak = Math.max(...selectedTrend.weeks.map(item => item.count), 1)
                return (
                  <div key={week.weekStart} className="repetition-week">
                    <div className="repetition-week-bar" title={`${week.count} ghost reps, week of ${formatCalendarDate(week.weekStart)}`}>
                      <span style={{ height: `${Math.max(week.count > 0 ? 12 : 0, (week.count / peak) * 100)}%` }} />
                    </div>
                    <strong>{week.count}</strong>
                    <small>{formatCalendarDate(week.weekStart)}</small>
                  </div>
                )
              })}
            </div>

            <div className="repetition-tuner">
              <div className="repetition-tuner-control">
                <span>Cadence</span>
                <div className="repetition-segmented-control">
                  {(Object.keys(CADENCE_PRESETS) as CadencePreset[]).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      className={cadencePreset === preset ? 'selected' : ''}
                      onClick={() => setCadencePreset(preset)}
                    >
                      {CADENCE_PRESETS[preset].label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="repetition-target-control">
                <span>Ghost reps per session</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={sessionTarget}
                  onChange={event => setSessionTarget(Number(event.target.value))}
                />
                <strong>{sessionTarget}</strong>
              </label>
            </div>
          </div>

          <div className="repetition-forecast" aria-label="Projected repetition dates">
            <span className="repetition-forecast-label">If you follow this shape</span>
            {forecast.map((item, index) => (
              <div key={`${item.date}-${index}`} className="repetition-forecast-stop">
                <i />
                <strong>{item.date <= today! ? 'Now' : formatCalendarDate(item.date)}</strong>
                <small>{index === 0 ? `${sessionTarget} reps · ${item.stage}` : `${sessionTarget} reps`}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="daily-work-history-swimlane"
        style={{ '--daily-work-history-days': chartDates.length } as CSSProperties}
      >
        <div className={`daily-work-history-axis-corner${drilldownAlgorithm ? ' daily-work-history-axis-corner-drilldown' : ''}`}>
          {drilldownAlgorithm ? (
            <button
              type="button"
              className="daily-work-history-axis-button"
              onClick={() => setDrilldownSlug(null)}
            >
              All algorithms
            </button>
          ) : (
            <span className="repetition-track-column-label">Track</span>
          )}
        </div>
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
            <div className={`daily-work-history-lane-label${trackedAlgorithms.has(row.parentSlug ?? row.slug) ? ' daily-work-history-lane-label-tracked' : ''}`}>
              {drilldownAlgorithm ? (
                <strong title={row.label}>{row.label}</strong>
              ) : (
                <>
                  <button
                    type="button"
                    className="daily-work-history-lane-button"
                    title={row.label}
                    onClick={() => setDrilldownSlug(row.slug)}
                  >
                    {compactAlgorithmLabel(row.label)}
                  </button>
                  <button
                    type="button"
                    className={`repetition-track-toggle${trackedAlgorithms.has(row.slug) ? ' selected' : ''}`}
                    aria-label={`${trackedAlgorithms.has(row.slug) ? 'Stop tracking' : 'Track'} ${row.label} spaced repetitions`}
                    aria-pressed={trackedAlgorithms.has(row.slug)}
                    onClick={() => toggleTrackedAlgorithm(row.slug)}
                  >
                    <span className="repetition-track-switch" aria-hidden="true"><i /></span>
                  </button>
                </>
              )}
            </div>
            <div className="daily-work-history-lane-cells">
              {row.cells.map(cell => {
                const intensity = cell.count > 0 ? `${Math.round(Math.max(0.28, cell.count / peakCellCount) * 72)}%` : '0%'
                const methods = skillSummary(cell.skills)
                const isVisuallyTracked = trackedAlgorithms.has(row.parentSlug ?? row.slug)
                const scheduleStatus = isVisuallyTracked && cell.scheduleStatus && cell.scheduleStatus !== 'empty'
                  ? cell.scheduleStatus
                  : undefined
                const scheduleCopy = scheduleStatus && cell.scheduleLabel
                  ? `; ${cell.scheduleLabel.toLowerCase()} for spaced repetition`
                  : ''
                const title = cell.count > 0
                  ? `${row.label} on ${formatCalendarDate(cell.date)}: ${cell.count} ghost rep${cell.count === 1 ? '' : 's'}${methods ? ` (${methods})` : ''}${scheduleCopy}`
                  : `${row.label} on ${formatCalendarDate(cell.date)}: no ghost reps${scheduleCopy}`
                const className = [
                  'daily-work-history-cell',
                  cell.count > 0 ? 'daily-work-history-cell-active' : '',
                  scheduleStatus ? `daily-work-history-cell-schedule-${scheduleStatus}` : '',
                  scheduleStatus === 'completed' && cell.count > 0 ? 'daily-work-history-cell-on-track' : '',
                ].filter(Boolean).join(' ')
                return (
                  <button
                    key={`${row.slug}-${cell.date}`}
                    type="button"
                    className={className}
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

      <div className="daily-work-history-legend">
        <span><i className="daily-work-history-cell daily-work-history-cell-active" /> Activity</span>
        <span><i className="daily-work-history-cell daily-work-history-cell-on-track" /> On track</span>
        <span><i className="daily-work-history-cell daily-work-history-cell-schedule-due" /> Due</span>
        <span><i className="daily-work-history-cell daily-work-history-cell-schedule-overdue" /> Overdue</span>
      </div>
    </section>
  )
}
