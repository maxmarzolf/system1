import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react'

export type GhostRepActivitySegment = {
  pattern: string
  slug: string
  workType?: 'ghost-reps' | 'multiple-choice'
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


const formatSegmentPatternLabel = (pattern: string) => {
  const normalized = pattern.toLowerCase()
  if (normalized.includes('sliding window')) return 'Window'
  if (normalized.includes('two pointers')) return '2 Ptr'
  if (normalized.includes('binary search')) return 'Binary'
  if (normalized.includes('dfs') || normalized.includes('bfs')) return 'DFS/BFS'
  if (normalized.includes('backtracking')) return 'Backtrack'
  if (normalized.includes('heap') || normalized.includes('priority')) return 'Heap'
  if (normalized.includes('union find')) return 'Union'
  if (normalized.includes('dynamic programming')) return 'DP'
  if (normalized.includes('graph')) return 'Graph'
  if (normalized.includes('interval')) return 'Intervals'
  if (normalized.includes('prefix')) return 'Prefix'
  if (normalized.includes('monotonic')) return 'Stack'
  return pattern
}

const readableTextColor = (hexColor: string) => {
  const normalized = hexColor.replace('#', '')
  const expanded = normalized.length === 3
    ? normalized.split('').map((character) => character + character).join('')
    : normalized
  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.58 ? '#000000' : '#ffffff'
}

// ─── Trend analysis ──────────────────────────────────────────────────────────

const GHOST_GOAL = 5
const MCQ_GOAL = 10
const GAP_WARNING_DAYS = 3
const GAP_CRITICAL_DAYS = 5

const segmentKey = (slug: string, workType?: GhostRepActivitySegment['workType']) =>
  `${slug}::${workType ?? 'ghost-reps'}`

interface GapZone { start: number; end: number }

function findGapZones(counts: number[], minGap: number): GapZone[] {
  const zones: GapZone[] = []
  let gapStart = -1
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] === 0) {
      if (gapStart === -1) gapStart = i
    } else {
      if (gapStart !== -1 && (i - gapStart) >= minGap) {
        zones.push({ start: gapStart, end: i - 1 })
      }
      gapStart = -1
    }
  }
  if (gapStart !== -1 && (counts.length - gapStart) >= minGap) {
    zones.push({ start: gapStart, end: counts.length - 1 })
  }
  return zones
}

interface TrendSeries {
  key: string
  pattern: string
  workType?: GhostRepActivitySegment['workType']
  color: string
  counts: number[]
  goal: number
}

const SVG_W = 560
const SVG_H = 130
const PAD_L = 30
const PAD_R = 30
const PAD_T = 14
const PAD_B = 24
const CHART_W = SVG_W - PAD_L - PAD_R
const CHART_H = SVG_H - PAD_T - PAD_B

function TrendAnalysisChart({
  series,
  dates,
  onClearAll,
}: {
  series: TrendSeries[]
  dates: string[]
  onClearAll: () => void
}) {
  const n = dates.length
  if (n === 0 || series.length === 0) return null

  const xOf = (i: number) => PAD_L + (n <= 1 ? CHART_W / 2 : (i / (n - 1)) * CHART_W)
  const xLeft = (s: number) => s === 0 ? PAD_L : (xOf(s) + xOf(s - 1)) / 2
  const xRight = (e: number) => e === n - 1 ? SVG_W - PAD_R : (xOf(e) + xOf(e + 1)) / 2

  const maxGoal = Math.max(...series.map(s => s.goal))
  const maxData = Math.max(...series.flatMap(s => s.counts), 0)
  const maxCount = Math.max(maxGoal, maxData, 1)
  const yOf = (count: number) => PAD_T + (1 - count / maxCount) * CHART_H

  const uniqueGoals = [...new Set(series.map(s => s.goal))]
  const labelEvery = n > 20 ? 7 : n > 14 ? 4 : n > 7 ? 2 : 1

  const yTicks = [0, Math.ceil(maxCount / 2), maxCount]

  return (
    <div className="trend-analysis-section">
      <div className="trend-analysis-header">
        <span className="trend-analysis-title">Trend Analysis</span>
        <div className="trend-analysis-legend">
          {series.map(s => (
            <span key={s.key} className="trend-analysis-legend-item">
              <span className="trend-analysis-legend-dot" style={{ background: s.color }} />
              {formatSegmentPatternLabel(s.pattern)}
              <span className="trend-analysis-legend-type">
                {s.workType === 'multiple-choice' ? 'MCQ' : 'Ghost'}
              </span>
            </span>
          ))}
        </div>
        <button type="button" className="trend-analysis-clear" onClick={onClearAll}>
          Clear
        </button>
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="trend-analysis-svg"
        aria-label="Trend analysis chart"
        role="img"
      >
        {/* Y-axis grid + labels */}
        {yTicks.map(val => (
          <g key={val}>
            <line
              x1={PAD_L} y1={yOf(val)} x2={SVG_W - PAD_R} y2={yOf(val)}
              className="trend-grid-line"
            />
            <text x={PAD_L - 5} y={yOf(val) + 3.5} textAnchor="end" className="trend-axis-label">
              {val}
            </text>
          </g>
        ))}

        {/* Gap zones – warning (3+ days) */}
        {series.flatMap(s =>
          findGapZones(s.counts, GAP_WARNING_DAYS).map((zone, zi) => (
            <rect
              key={`w-${s.key}-${zi}`}
              x={xLeft(zone.start)} y={PAD_T}
              width={xRight(zone.end) - xLeft(zone.start)}
              height={CHART_H}
              className="trend-gap-warning"
            />
          ))
        )}

        {/* Gap zones – critical (5+ days) */}
        {series.flatMap(s =>
          findGapZones(s.counts, GAP_CRITICAL_DAYS).map((zone, zi) => (
            <rect
              key={`c-${s.key}-${zi}`}
              x={xLeft(zone.start)} y={PAD_T}
              width={xRight(zone.end) - xLeft(zone.start)}
              height={CHART_H}
              className="trend-gap-critical"
            />
          ))
        )}

        {/* Goal reference lines */}
        {uniqueGoals.map(goal => (
          <g key={`goal-${goal}`}>
            <line
              x1={PAD_L} y1={yOf(goal)} x2={SVG_W - PAD_R} y2={yOf(goal)}
              className="trend-goal-line"
            />
            <text x={SVG_W - PAD_R + 4} y={yOf(goal) + 3.5} className="trend-goal-label">
              {goal}
            </text>
          </g>
        ))}

        {/* Lines per series */}
        {series.map(s => (
          <polyline
            key={`line-${s.key}`}
            points={s.counts.map((c, i) => `${xOf(i)},${yOf(c)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Dots per series */}
        {series.map(s =>
          s.counts.map((count, i) => (
            <circle
              key={`dot-${s.key}-${i}`}
              cx={xOf(i)} cy={yOf(count)}
              r={count > 0 ? 2.5 : 1.5}
              fill={count > 0 ? s.color : 'var(--hc-border)'}
              opacity={count > 0 ? 1 : 0.3}
            />
          ))
        )}

        {/* X-axis date labels */}
        {dates.map((date, i) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null
          const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
          return (
            <text key={date} x={xOf(i)} y={SVG_H - 3} textAnchor={anchor} className="trend-axis-label">
              {formatCalendarDate(date)}
            </text>
          )
        })}
      </svg>

      <div className="trend-gap-legend">
        <span className="trend-gap-legend-item">
          <span className="trend-gap-swatch trend-gap-swatch-warning" />
          3+ day gap
        </span>
        <span className="trend-gap-legend-item">
          <span className="trend-gap-swatch trend-gap-swatch-critical" />
          5+ day gap
        </span>
        <span className="trend-gap-legend-item">
          <span className="trend-gap-swatch trend-gap-swatch-goal" />
          daily goal
        </span>
      </div>
    </div>
  )
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
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  const colorBySlug = useMemo(() => {
    const entries = patternOrder.map((pattern, index) => [
      pattern.slug,
      GHOST_REP_PATTERN_COLORS[index % GHOST_REP_PATTERN_COLORS.length],
    ] as const)
    return new Map(entries)
  }, [patternOrder])

  const handleSegmentClick = useCallback((slug: string, workType?: GhostRepActivitySegment['workType']) => {
    const key = segmentKey(slug, workType)
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleSegmentKeyDown = useCallback((
    e: KeyboardEvent,
    slug: string,
    workType?: GhostRepActivitySegment['workType'],
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSegmentClick(slug, workType)
    }
  }, [handleSegmentClick])

  const handleClearAll = useCallback(() => setSelectedKeys(new Set()), [])

  useEffect(() => {
    const slugs = [...new Set([...selectedKeys].map(key => key.split('::')[0]))]
    onSelectionChange?.(slugs)
  }, [selectedKeys, onSelectionChange])

  const selectedSeriesData = useMemo((): TrendSeries[] => {
    if (selectedKeys.size === 0 || !activity) return []
    const meta = new Map<string, { pattern: string; workType?: GhostRepActivitySegment['workType']; color: string }>()
    for (const day of activity.days) {
      for (const seg of day.segments) {
        const key = segmentKey(seg.slug, seg.workType)
        if (selectedKeys.has(key) && !meta.has(key)) {
          meta.set(key, {
            pattern: seg.pattern,
            workType: seg.workType,
            color: colorBySlug.get(seg.slug) ?? GHOST_REP_PATTERN_COLORS[0],
          })
        }
      }
    }
    return [...selectedKeys]
      .filter(key => meta.has(key))
      .map(key => {
        const { pattern, workType, color } = meta.get(key)!
        const counts = activity.days.map(day =>
          day.segments.find(s => segmentKey(s.slug, s.workType) === key)?.count ?? 0
        )
        return { key, pattern, workType, color, counts, goal: workType === 'multiple-choice' ? MCQ_GOAL : GHOST_GOAL }
      })
  }, [selectedKeys, activity, colorBySlug])

  if (!activity) {
    return (
      <section className="daily-work-history" aria-label="Daily work history">
        <div className="daily-work-history-header">
          <div>
            <p className="dashboard-activity-eyebrow">Daily Work History</p>
     
          </div>
        </div>
        <p className="dashboard-mode-meta">Loading practice activity...</p>
      </section>
    )
  }

  const peakGhost = Math.max(...activity.days.map(d => d.ghostRepCount ?? 0), 1)
  const peakMcq = Math.max(...activity.days.map(d => d.multipleChoiceCount ?? 0), 1)

  return (
    <section className="daily-work-history" aria-label="Daily work history">
      <div className="daily-work-history-header">
        <div>
          <p className="dashboard-activity-eyebrow">Daily Work History</p>
        </div>
        <div className="daily-work-history-stats">
          <span className="coach-metric-chip">{activity.totalGhostReps} Ghost</span>
          <span className="coach-metric-chip">{activity.totalMultipleChoice ?? 0} MCQ</span>
          <span className="coach-metric-chip">{activity.activeDays} active days</span>
        </div>
      </div>

      <div className="daily-work-history-type-legend" aria-label="Work type legend">
        <span className="daily-work-history-type-item">
          <span className="daily-work-history-type-swatch daily-work-history-type-swatch-ghost" />
          Ghost Reps
        </span>
        <span className="daily-work-history-type-item">
          <span className="daily-work-history-type-swatch daily-work-history-type-swatch-mcq" />
          Multiple Choice
        </span>
      </div>

      <div className="daily-work-history-chart">
        {activity.days.map((day) => {
          const ghostCount = day.ghostRepCount ?? 0
          const mcqCount = day.multipleChoiceCount ?? 0
          const ghostSegments = day.segments.filter(s => s.workType !== 'multiple-choice')
          const mcqSegments = day.segments.filter(s => s.workType === 'multiple-choice')
          const ghostFillPercent = ghostCount > 0 ? Math.max(8, Math.round((ghostCount / peakGhost) * 100)) : 0
          const mcqFillPercent = mcqCount > 0 ? Math.max(8, Math.round((mcqCount / peakMcq) * 100)) : 0
          return (
            <div key={day.date} className="daily-work-history-day">
              <div className="daily-work-history-day-label">
                <strong>{formatCalendarWeekday(day.date)}</strong>
                <span>{formatCalendarDate(day.date)}</span>
              </div>
              <div className="daily-work-history-bars">
                <div
                  className={ghostCount > 0 ? 'daily-work-history-bar' : 'daily-work-history-bar daily-work-history-bar-empty'}
                  title={ghostCount > 0 ? `${formatCalendarLongDate(day.date)}: ${ghostCount} Ghost` : `${formatCalendarLongDate(day.date)}: no ghost reps`}
                >
                  {ghostCount > 0 ? (
                    <div className="daily-work-history-fill" style={{ width: `${ghostFillPercent}%` }}>
                      {ghostSegments.map((segment) => {
                        const segmentColor = colorBySlug.get(segment.slug) ?? GHOST_REP_PATTERN_COLORS[0]
                        const key = segmentKey(segment.slug, segment.workType)
                        const isSelected = selectedKeys.has(key)
                        return (
                          <span
                            key={`${day.date}-ghost-${segment.slug}`}
                            className={isSelected ? 'daily-work-history-segment daily-work-history-segment-ghost daily-work-history-segment-selected' : 'daily-work-history-segment daily-work-history-segment-ghost'}
                            style={{
                              flexGrow: segment.count,
                              '--work-history-color': segmentColor,
                              '--work-history-label-color': readableTextColor(segmentColor),
                            } as CSSProperties}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isSelected}
                            title={`${segment.pattern}: ${segment.count} Ghost${segment.count === 1 ? '' : 's'} — click to view trend`}
                            aria-label={`${segment.pattern}: ${segment.count} Ghost${segment.count === 1 ? '' : 's'}`}
                            onClick={() => handleSegmentClick(segment.slug, segment.workType)}
                            onKeyDown={(e) => handleSegmentKeyDown(e, segment.slug, segment.workType)}
                          >
                            <span className="daily-work-history-segment-label">
                              {formatSegmentPatternLabel(segment.pattern)}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="daily-work-history-empty-label">—</span>
                  )}
                </div>
                <div
                  className={mcqCount > 0 ? 'daily-work-history-bar' : 'daily-work-history-bar daily-work-history-bar-empty'}
                  title={mcqCount > 0 ? `${formatCalendarLongDate(day.date)}: ${mcqCount} MCQ` : `${formatCalendarLongDate(day.date)}: no MCQ`}
                >
                  {mcqCount > 0 ? (
                    <div className="daily-work-history-fill" style={{ width: `${mcqFillPercent}%` }}>
                      {mcqSegments.map((segment) => {
                        const segmentColor = colorBySlug.get(segment.slug) ?? GHOST_REP_PATTERN_COLORS[0]
                        const key = segmentKey(segment.slug, segment.workType)
                        const isSelected = selectedKeys.has(key)
                        return (
                          <span
                            key={`${day.date}-mcq-${segment.slug}`}
                            className={isSelected ? 'daily-work-history-segment daily-work-history-segment-mcq daily-work-history-segment-selected' : 'daily-work-history-segment daily-work-history-segment-mcq'}
                            style={{
                              flexGrow: segment.count,
                              '--work-history-color': segmentColor,
                              '--work-history-label-color': readableTextColor(segmentColor),
                            } as CSSProperties}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isSelected}
                            title={`${segment.pattern}: ${segment.count} MCQ${segment.count === 1 ? '' : 's'} — click to view trend`}
                            aria-label={`${segment.pattern}: ${segment.count} MCQ${segment.count === 1 ? '' : 's'}`}
                            onClick={() => handleSegmentClick(segment.slug, segment.workType)}
                            onKeyDown={(e) => handleSegmentKeyDown(e, segment.slug, segment.workType)}
                          >
                            <span className="daily-work-history-segment-label">
                              {formatSegmentPatternLabel(segment.pattern)}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="daily-work-history-empty-label">—</span>
                  )}
                </div>
              </div>
              <span className="daily-work-history-day-total">
                {day.total > 0 && (
                  <small>{ghostCount}G / {mcqCount}M</small>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {selectedSeriesData.length > 0 && (
        <TrendAnalysisChart
          series={selectedSeriesData}
          dates={activity.days.map(d => d.date)}
          onClearAll={handleClearAll}
        />
      )}

    </section>
  )
}
