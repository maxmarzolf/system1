import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopNav from './TopNav'

type SkillMapActivityDay = {
  date: string
  count: number
  inFuture: boolean
}

type SkillMapModeActivity = {
  windowStart: string
  windowEnd: string
  recentSubmitCount: number
  lastSevenDaySubmitCount: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  peakDailyCount: number
  days: SkillMapActivityDay[]
}

type DimensionItem = {
  key: string
  label: string
  avgScore?: number
  weakCount?: number
  failCount?: number
  partialCount?: number
  attemptCount?: number
}

type PrimaryFailureItem = {
  key: string
  label: string
  count: number
}

type DimensionSummary = {
  rubricAttemptCount?: number
  avgRubricScore?: number
  topWeakDimension?: DimensionItem
  weakDimensions?: DimensionItem[]
  topPrimaryFailure?: PrimaryFailureItem
  primaryFailures?: PrimaryFailureItem[]
  verdictCounts?: Record<string, number>
}

type SkillMapModeReadiness = {
  readiness: number
  attemptCount: number
  ghostRepCount: number
  unsupportedAttemptCount: number
  workCount: number
  successfulAttempts: number
  avgAccuracy: number
  totalCards: number
  practicedCards: number
  untouchedCards: number
  staleCards: number
  lastSubmittedAt: string
  daysSinceLastSubmit: number | null
  stale: boolean
  dimensionSummary: DimensionSummary
  activity: SkillMapModeActivity
}

type SkillMapPatternReadiness = {
  pattern: string
  slug: string
  methods: string[]
  overallReadiness: number
  overallAttemptCount: number
  ghostRepCount: number
  unsupportedAttemptCount: number
  workCount: number
  totalCards: number
  practicedCards: number
  untouchedCards: number
  staleCards: number
  dimensionSummary: DimensionSummary
  modes: Record<'pseudo' | 'skeleton' | 'full', SkillMapModeReadiness>
}

type SkillMapOverviewResponse = {
  summary: {
    totalGeneratedCards: number
    attemptedCards: number
    untouchedCards: number
    staleCards: number
    ghostRepCount: number
    unsupportedAttemptCount: number
    workCount: number
    patternsStarted: number
    patternsUntouched: number
    avgPatternReadiness: number
    successThreshold: number
    staleAfterDays: number
  }
  patterns: SkillMapPatternReadiness[]
}

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiUrl = (path: string) => `${API_BASE_URL}${path}`
const ACTIVITY_WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const longDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const formatTemplateModeLabel = (templateMode: 'pseudo' | 'skeleton' | 'full') =>
  ({
    pseudo: 'Pseudo',
    skeleton: 'Skeleton',
    full: 'Full',
  })[templateMode] ?? templateMode

const readinessTone = (readiness: number) => {
  if (readiness >= 80) return 'success'
  if (readiness >= 50) return 'warning'
  return 'error'
}

const parseCalendarDate = (value: string) => new Date(`${value}T12:00:00`)
const formatCalendarDate = (value: string) => shortDateFormatter.format(parseCalendarDate(value))
const formatCalendarLongDate = (value: string) => longDateFormatter.format(parseCalendarDate(value))
const formatSubmittedAt = (value: string) => longDateFormatter.format(new Date(value))

const dimensionLabel = (item?: DimensionItem | PrimaryFailureItem) =>
  item?.label?.trim() || item?.key?.replace(/_/g, ' ') || ''

const formatWeakDimension = (summary?: DimensionSummary) => {
  const weak = summary?.topWeakDimension
  if (!weak?.key) return 'No repeated weak dimension yet.'
  const count = weak.weakCount ?? weak.failCount ?? 0
  const countText = count > 0 ? ` · ${count} weak` : ''
  return `${dimensionLabel(weak)}${weak.avgScore !== undefined ? ` · ${weak.avgScore}% avg` : ''}${countText}`
}

const formatPrimaryFailure = (summary?: DimensionSummary) => {
  const primary = summary?.topPrimaryFailure
  if (!primary?.key) return ''
  return `${dimensionLabel(primary)}${primary.count ? ` · ${primary.count}x` : ''}`
}

const dimensionTone = (score?: number) => {
  if (score === undefined) return 'empty'
  if (score >= 80) return 'pass'
  if (score >= 55) return 'partial'
  return 'fail'
}

const activityIntensity = (count: number, peakDailyCount: number) => {
  if (count <= 0) return 'none'
  if (count >= 4) return 'max'
  if (count === 3) return 'high'
  if (count === 2) return 'mid'
  if (peakDailyCount >= 6 && count >= Math.ceil(peakDailyCount * 0.75)) return 'high'
  if (peakDailyCount >= 6 && count >= Math.ceil(peakDailyCount * 0.45)) return 'mid'
  return 'low'
}

const formatLastSubmitSummary = (modeSummary: SkillMapModeReadiness) => {
  if (modeSummary.daysSinceLastSubmit === null) return 'No submission history yet for this mode.'
  if (modeSummary.daysSinceLastSubmit === 0) return 'Last submit was today.'
  if (modeSummary.daysSinceLastSubmit === 1) return 'Last submit was 1 day ago.'
  return `Last submit was ${modeSummary.daysSinceLastSubmit} days ago.`
}

function DashboardModeActivityTracker({
  modeLabel,
  modeSummary,
  onOpenCalendar,
}: {
  modeLabel: string
  modeSummary: SkillMapModeReadiness
  onOpenCalendar: (modeLabel: string, modeSummary: SkillMapModeReadiness) => void
}) {
  const activity = modeSummary.activity
  const recentDays = activity.days.filter((day) => !day.inFuture).slice(-14)
  const stripDays = recentDays.length > 0 ? recentDays : activity.days.slice(-14)

  return (
    <div
      className="dashboard-mode-frequency"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation()
        }
      }}
    >
      <div className="dashboard-mode-frequency-header">
        <span className="dashboard-mode-frequency-label">Frequency</span>
      </div>

      <div className="dashboard-activity-strip" aria-hidden="true">
        {stripDays.map((day) => (
          <span
            key={day.date}
            className={[
              'dashboard-activity-cell',
              `dashboard-activity-cell-${activityIntensity(day.count, activity.peakDailyCount)}`,
              day.inFuture ? 'dashboard-activity-cell-future' : '',
            ].filter(Boolean).join(' ')}
          />
        ))}
      </div>

      <button
        type="button"
        className="dashboard-mode-frequency-trigger"
        onClick={(event) => {
          event.stopPropagation()
          onOpenCalendar(modeLabel, modeSummary)
        }}
      >
        View submission calendar
      </button>
    </div>
  )
}

function DashboardActivityModal({
  modeLabel,
  modeSummary,
  onClose,
}: {
  modeLabel: string
  modeSummary: SkillMapModeReadiness
  onClose: () => void
}) {
  const activity = modeSummary.activity
  const hasRubricHistory = Boolean(modeSummary.dimensionSummary?.rubricAttemptCount)
  const primaryFailure = formatPrimaryFailure(modeSummary.dimensionSummary)

  return (
    <div className="dashboard-activity-modal" onClick={onClose}>
      <div
        className="dashboard-activity-popover"
        role="dialog"
        aria-modal="true"
        aria-label={`${modeLabel} submission calendar`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dashboard-activity-popover-header">
          <div>
            <p className="dashboard-activity-eyebrow">{modeLabel} mode activity</p>
            <h4>Submission calendar</h4>
          </div>
          <div className="dashboard-activity-popover-actions">
            <span className={`coach-status-value coach-status-value-${readinessTone(modeSummary.readiness)}`}>
              {activity.recentSubmitCount} recent
            </span>
            <button type="button" className="dashboard-activity-close" onClick={onClose} aria-label="Close calendar">
              Close
            </button>
          </div>
        </div>

        <p className="dashboard-activity-description">
          {formatLastSubmitSummary(modeSummary)}
          {modeSummary.lastSubmittedAt ? ` Recorded ${formatSubmittedAt(modeSummary.lastSubmittedAt)}.` : ''}
        </p>

        <div className="dashboard-activity-stats">
          <div className="dashboard-activity-stat">
            <span className="dashboard-activity-stat-label">7d</span>
            <strong>{activity.lastSevenDaySubmitCount}</strong>
          </div>
          <div className="dashboard-activity-stat">
            <span className="dashboard-activity-stat-label">6w</span>
            <strong>{activity.recentSubmitCount}</strong>
          </div>
          <div className="dashboard-activity-stat">
            <span className="dashboard-activity-stat-label">Streak</span>
            <strong>{activity.currentStreak}</strong>
          </div>
          <div className="dashboard-activity-stat">
            <span className="dashboard-activity-stat-label">Best run</span>
            <strong>{activity.longestStreak}</strong>
          </div>
        </div>

        <div className="dashboard-activity-detail-grid">
          <div className="dashboard-activity-detail">
            <span>Cards</span>
            <strong>{modeSummary.practicedCards}/{modeSummary.totalCards}</strong>
          </div>
          <div className="dashboard-activity-detail">
            <span>Work</span>
            <strong>{modeSummary.workCount}</strong>
          </div>
          <div className="dashboard-activity-detail">
            <span>Ghost Reps</span>
            <strong>{modeSummary.ghostRepCount}</strong>
          </div>
          <div className="dashboard-activity-detail">
            <span>Recall</span>
            <strong>{modeSummary.unsupportedAttemptCount}</strong>
          </div>
          <div className="dashboard-activity-detail">
            <span>Avg</span>
            <strong>{modeSummary.avgAccuracy}%</strong>
          </div>
          <div className="dashboard-activity-detail">
            <span>Status</span>
            <strong>{modeSummary.stale ? 'Review due' : 'Fresh enough'}</strong>
          </div>
        </div>

        <div className="dashboard-activity-rubric">
          {hasRubricHistory ? (
            <>
              <p>Weak spot: {formatWeakDimension(modeSummary.dimensionSummary)}</p>
              {primaryFailure && <p>Primary miss: {primaryFailure}</p>}
            </>
          ) : (
            <p>Rubric history starts on the next submit.</p>
          )}
        </div>

        <div className="dashboard-activity-calendar">
          <div className="dashboard-activity-weekdays">
            {ACTIVITY_WEEKDAY_LABELS.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="dashboard-activity-grid">
            {activity.days.map((day) => (
              <span
                key={day.date}
                className={[
                  'dashboard-activity-cell',
                  `dashboard-activity-cell-${activityIntensity(day.count, activity.peakDailyCount)}`,
                  day.inFuture ? 'dashboard-activity-cell-future' : '',
                ].filter(Boolean).join(' ')}
                title={
                  day.inFuture
                    ? `${formatCalendarLongDate(day.date)}: upcoming`
                    : day.count > 0
                      ? `${formatCalendarLongDate(day.date)}: ${day.count} submit${day.count === 1 ? '' : 's'}`
                      : `${formatCalendarLongDate(day.date)}: no submits`
                }
              />
            ))}
          </div>
        </div>

        <p className="dashboard-activity-range">
          {formatCalendarDate(activity.windowStart)} - {formatCalendarDate(activity.windowEnd)} · {activity.activeDays} active day{activity.activeDays === 1 ? '' : 's'}
        </p>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<SkillMapOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedMethodsByPattern, setSelectedMethodsByPattern] = useState<Record<string, string[]>>({})
  const [activeCalendar, setActiveCalendar] = useState<{ modeLabel: string; modeSummary: SkillMapModeReadiness } | null>(null)

  useEffect(() => {
    const loadOverview = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(apiUrl('/api/skill-map-overview'))
        if (!response.ok) {
          throw new Error('Failed to load skill map overview')
        }
        const payload = (await response.json()) as SkillMapOverviewResponse
        setOverview(payload)
      } catch {
        setOverview(null)
        setError('Unable to load readiness tracking right now.')
      } finally {
        setLoading(false)
      }
    }

    void loadOverview()
  }, [])

  const summary = overview?.summary
  const patterns = overview?.patterns ?? []
  const toggleCoreMethod = (patternSlug: string, method: string) => {
    setSelectedMethodsByPattern((current) => {
      const currentMethods = current[patternSlug] ?? []
      const methodSelected = currentMethods.includes(method)
      const nextMethods = methodSelected
        ? currentMethods.filter((item) => item !== method)
        : [...currentMethods, method]
      return {
        ...current,
        [patternSlug]: nextMethods,
      }
    })
  }
  const launchFocusedPractice = (patternSlug: string, mode: 'pseudo' | 'skeleton' | 'full', selectedMethods: string[]) => {
    const nextParams = new URLSearchParams({
      focusPattern: patternSlug,
      focusMode: mode,
    })
    selectedMethods.forEach((method) => nextParams.append('focusMethod', method))
    navigate(`/?${nextParams.toString()}`)
  }

  return (
    <div className="app app-dashboard">
      <TopNav />

      <section className="dashboard">
        {error && <p className="skill-map-intro">{error}</p>}
        <div className="skill-map-grid">
          {loading && !error && <p className="skill-map-intro">Loading readiness overview...</p>}
          {patterns.map((node) => {
            const selectedMethods = selectedMethodsByPattern[node.slug] ?? []
            const patternSelected = selectedMethods.length > 0
            return (
              <article key={node.slug} className="skill-map-card">
                <div className="skill-map-header">
                  <h3>{node.pattern}</h3>
                  <span className={`coach-status-value coach-status-value-${readinessTone(node.overallReadiness)}`}>
                    {node.overallReadiness}%
                  </span>
                </div>
                <div className="dashboard-summary" style={{ marginBottom: '0.7rem' }}>
                  <span className="coach-metric-chip">{node.practicedCards}/{node.totalCards} cards worked</span>
                  <span className="coach-metric-chip">{node.untouchedCards} untouched</span>
                  <span className="coach-metric-chip">{node.staleCards} stale</span>
                  <span className="coach-metric-chip">{node.workCount} work logged</span>
                  <span className="coach-metric-chip">{node.ghostRepCount} Ghost Reps</span>
                  <span className="coach-metric-chip">{node.unsupportedAttemptCount} recall attempts</span>
                </div>
                <div
                  className={patternSelected ? 'skill-method-panel skill-method-panel-selected' : 'skill-method-panel'}
                >
                  <p className="skill-map-subtitle">Level 2: Core methods</p>
                  <div className="skill-method-list">
                    {node.methods.map((method) => {
                      const methodSelected = selectedMethods.includes(method)
                      return (
                        <button
                          key={method}
                          type="button"
                          className={methodSelected ? 'skill-method-chip skill-method-chip-selected' : 'skill-method-chip'}
                          onClick={() => toggleCoreMethod(node.slug, method)}
                          aria-pressed={methodSelected}
                        >
                          {method}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <p className="skill-map-target-note">
                  {patternSelected
                    ? `${selectedMethods.length} core method${selectedMethods.length === 1 ? '' : 's'} selected. Click a mode card to generate a focused set.`
                    : 'Select one or more core methods, then pick a mode to practice this pattern on purpose.'}
                </p>
                <div className="dashboard-mode-grid">
                  {(['pseudo', 'skeleton', 'full'] as const).map((mode) => {
                    const modeSummary = node.modes[mode]
                    const modeLabel = formatTemplateModeLabel(mode)
                    return (
                      <div
                        key={mode}
                        className={[
                          'dashboard-mode-card',
                          patternSelected ? 'dashboard-mode-card-actionable' : 'dashboard-mode-card-disabled',
                        ].join(' ')}
                        role="button"
                        tabIndex={patternSelected ? 0 : -1}
                        aria-disabled={!patternSelected}
                        onClick={() => {
                          if (!patternSelected) return
                          launchFocusedPractice(node.slug, mode, selectedMethods)
                        }}
                        onKeyDown={(event) => {
                          if (!patternSelected) return
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            launchFocusedPractice(node.slug, mode, selectedMethods)
                          }
                        }}
                      >
                        <div className="dashboard-mode-header">
                          <span>{modeLabel}</span>
                          <span className={`coach-status-value coach-status-value-${readinessTone(modeSummary.readiness)}`}>
                            {modeSummary.readiness}%
                          </span>
                        </div>
                        {patternSelected && (
                          <>
                            <p className="dashboard-mode-meta">
                              {modeSummary.practicedCards}/{modeSummary.totalCards} cards · {modeSummary.workCount} reps logged
                            </p>
                            <p className="dashboard-mode-meta">
                              {modeSummary.ghostRepCount} Ghost Reps · {modeSummary.unsupportedAttemptCount} recall attempts
                            </p>
                            <p className="dashboard-mode-meta">
                              Avg {modeSummary.avgAccuracy}% · {modeSummary.stale ? 'Review due' : 'Fresh enough'}
                            </p>
                            {modeSummary.dimensionSummary?.rubricAttemptCount ? (
                              <>
                                <p className="dashboard-mode-meta">
                                  Weak spot: {formatWeakDimension(modeSummary.dimensionSummary)}
                                </p>
                                {formatPrimaryFailure(modeSummary.dimensionSummary) && (
                                  <p className="dashboard-mode-meta">
                                    Primary miss: {formatPrimaryFailure(modeSummary.dimensionSummary)}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="dashboard-mode-meta">Rubric history starts on the next submit.</p>
                            )}
                          </>
                        )}
                        <DashboardModeActivityTracker
                          modeLabel={modeLabel}
                          modeSummary={modeSummary}
                          onOpenCalendar={(nextModeLabel, nextModeSummary) =>
                            setActiveCalendar({ modeLabel: nextModeLabel, modeSummary: nextModeSummary })}
                        />
                        {patternSelected && (
                          <p className="dashboard-mode-launch-hint">
                            Generate focused {modeLabel.toLowerCase()} set
                          </p>
                        )}
                        {patternSelected && (modeSummary.untouchedCards > 0 || modeSummary.staleCards > 0) && (
                          <div className="dashboard-summary">
                            {modeSummary.untouchedCards > 0 && (
                              <span className="coach-metric-chip">{modeSummary.untouchedCards} untouched</span>
                            )}
                            {modeSummary.staleCards > 0 && (
                              <span className="coach-metric-chip">{modeSummary.staleCards} stale</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>

        <div className="dashboard-overview">
          <h2>Readiness Overview</h2>
          <p className="skill-map-intro">
            Readiness rises on strong independent recall, supported work is tracked separately, and stale skills decay after a few days without practice.
          </p>
          {summary && (
            <div className="dashboard-summary">
              <span className="coach-metric-chip">{summary.avgPatternReadiness}% avg pattern readiness</span>
              <span className="coach-metric-chip">{summary.workCount} work logged</span>
              <span className="coach-metric-chip">{summary.ghostRepCount} Ghost Reps</span>
              <span className="coach-metric-chip">{summary.unsupportedAttemptCount} recall attempts</span>
              <span className="coach-metric-chip">{summary.attemptedCards}/{summary.totalGeneratedCards} cards worked</span>
              <span className="coach-metric-chip">{summary.untouchedCards} untouched cards</span>
              <span className="coach-metric-chip">{summary.staleCards} stale cards</span>
              <span className="coach-metric-chip">{summary.patternsStarted} patterns started</span>
              <span className="coach-metric-chip">{summary.patternsUntouched} untouched patterns</span>
            </div>
          )}
          {summary && patterns.some((node) => (node.dimensionSummary?.weakDimensions?.length ?? 0) > 0) && (
            <section className="dashboard-dimension-panel">
              <div>
                <p className="dashboard-activity-eyebrow">Dimension History</p>
                <h3>Repeated repair targets</h3>
              </div>
              <div className="dashboard-dimension-grid">
                {patterns
                  .filter((node) => (node.dimensionSummary?.weakDimensions?.length ?? 0) > 0)
                  .slice(0, 6)
                  .map((node) => {
                    const weakDimensions = node.dimensionSummary.weakDimensions ?? []
                    return (
                      <article key={node.slug} className="dashboard-dimension-row">
                        <div>
                          <strong>{node.pattern}</strong>
                          <p className="dashboard-mode-meta">{formatPrimaryFailure(node.dimensionSummary) || 'No primary failure trend yet'}</p>
                        </div>
                        <div className="dashboard-dimension-chips">
                          {weakDimensions.slice(0, 4).map((dimension) => (
                            <span
                              key={`${node.slug}-${dimension.key}`}
                              className={`dashboard-dimension-chip dashboard-dimension-chip-${dimensionTone(dimension.avgScore)}`}
                              title={`${dimensionLabel(dimension)} · ${dimension.avgScore ?? 0}% average`}
                            >
                              {dimensionLabel(dimension)}
                            </span>
                          ))}
                        </div>
                      </article>
                    )
                  })}
              </div>
            </section>
          )}
          {summary && (
            <p className="skill-map-intro">
              Strong submit threshold: {summary.successThreshold}% • Review becomes due after about {summary.staleAfterDays} days.
            </p>
          )}
        </div>
      </section>
      {activeCalendar && (
        <DashboardActivityModal
          modeLabel={activeCalendar.modeLabel}
          modeSummary={activeCalendar.modeSummary}
          onClose={() => setActiveCalendar(null)}
        />
      )}
    </div>
  )
}
