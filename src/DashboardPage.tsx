import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from './api'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'

type DimensionSummary = {
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
  modes: Record<TemplateMode, SkillMapModeReadiness>
}

type SkillMapOverviewResponse = {
  patterns: SkillMapPatternReadiness[]
  spacedRepetition?: SkillMapSpacedRepetition
}

type TemplateMode = 'algorithm'

type SpacedRepetitionDay = {
  date: string
  status: 'empty' | 'completed' | 'failed' | 'due' | 'scheduled' | 'overdue'
  label: string
}

type SpacedRepetitionFamily = {
  pattern: string
  slug: string
  coreAlgorithmCount: number
}

type SpacedRepetitionPacket = {
  id: string
  label: string
  group: string
  families: SpacedRepetitionFamily[]
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
  days: SpacedRepetitionDay[]
}

type SkillMapSpacedRepetition = {
  today: string
  windowStart: string
  windowEnd: string
  intervals: number[]
  requiredGhostReps: number
  packets: SpacedRepetitionPacket[]
  queue: SpacedRepetitionPacket[]
}

const readinessTone = (readiness: number) => {
  if (readiness >= 80) return 'success'
  if (readiness >= 50) return 'warning'
  return 'error'
}

const spacedStatusTone = (status: SpacedRepetitionPacket['status']) => {
  if (status === 'overdue' || status === 'failed' || status === 'acquisition') return 'error'
  if (status === 'due') return 'warning'
  return 'success'
}

const formatShortDate = (value?: string | null) => {
  if (!value) return 'Not scheduled'
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const dueCopy = (packet: SpacedRepetitionPacket) => {
  if (!packet.nextDueAt) return 'Not scheduled'
  if (packet.daysUntilDue === null) return formatShortDate(packet.nextDueAt)
  if (packet.daysUntilDue < 0) return `${Math.abs(packet.daysUntilDue)}d overdue`
  if (packet.daysUntilDue === 0) return 'Today'
  if (packet.daysUntilDue === 1) return 'Tomorrow'
  return formatShortDate(packet.nextDueAt)
}

const nextScheduledPacket = (packets: SpacedRepetitionPacket[]) =>
  packets
    .filter(packet => packet.nextDueAt && packet.daysUntilDue !== null && packet.daysUntilDue > 0)
    .sort((left, right) => (left.daysUntilDue ?? 999) - (right.daysUntilDue ?? 999))[0]

function SpacedRepetitionPanel({
  spacedRepetition,
  onStartFamily,
}: {
  spacedRepetition?: SkillMapSpacedRepetition
  onStartFamily: (patternSlug: string) => void
}) {
  if (!spacedRepetition) {
    return (
      <section className="spaced-repetition-panel" aria-label="Spaced repetition">
        <div className="spaced-repetition-header">
          <div>
            <p className="dashboard-activity-eyebrow">Spaced Repetition</p>
            <h2>Loading schedule...</h2>
          </div>
        </div>
      </section>
    )
  }

  const activeReviews = spacedRepetition.queue
  const reviewPacket = activeReviews[0]
    ?? nextScheduledPacket(spacedRepetition.packets)
    ?? spacedRepetition.packets.find(packet => packet.status === 'not_started')
  const hiddenActiveReviewCount = Math.max(activeReviews.length - 1, 0)
  const activeReviewCopy = activeReviews.length === 0
    ? 'No reviews due'
    : activeReviews.length === 1
      ? '1 needs review'
      : `${activeReviews.length} need review`

  return (
    <section className="spaced-repetition-panel" aria-label="Spaced repetition">
      <div className="spaced-repetition-header">
        <div>
          <p className="dashboard-activity-eyebrow">Spaced Repetition</p>
          <h2>{reviewPacket ? `${reviewPacket.label}: ${reviewPacket.statusLabel}` : 'All packets scheduled'}</h2>
        </div>
        <div className="spaced-repetition-summary">
          <span className="coach-metric-chip">{spacedRepetition.requiredGhostReps} ghost/core</span>
          <span className="coach-metric-chip">{activeReviewCopy}</span>
          <span className="coach-metric-chip">0 · 1 · 3 · 7 · 14 · 30</span>
        </div>
      </div>

      {reviewPacket && (
        <div className="spaced-repetition-focus" aria-label="Review focus">
          <article className={`spaced-repetition-focus-card spaced-repetition-focus-card-${spacedStatusTone(reviewPacket.status)}`}>
            <div>
              <div className="spaced-repetition-focus-topline">
                <strong>{activeReviews.length > 0 ? 'Review now' : 'Next review'}</strong>
                <span>{reviewPacket.statusLabel}</span>
              </div>
              <p>{reviewPacket.families.map(family => family.pattern).join(' / ')}</p>
            </div>
            <div className="spaced-repetition-focus-actions">
              <span className="coach-metric-chip">Due {dueCopy(reviewPacket)}</span>
              <span className="coach-metric-chip">{reviewPacket.coreAlgorithmCount} cores</span>
              <span className="coach-metric-chip">{reviewPacket.stageLabel}</span>
              {reviewPacket.families.map(family => (
                <button key={family.slug} type="button" onClick={() => onStartFamily(family.slug)}>
                  {family.pattern}
                </button>
              ))}
            </div>
          </article>
          {hiddenActiveReviewCount > 0 && (
            <div className="spaced-repetition-focus-more">
              +{hiddenActiveReviewCount} more due after this
            </div>
          )}
        </div>
      )}

      {reviewPacket && (
        <div className="spaced-repetition-table" aria-label="Packet schedule">
          <article key={reviewPacket.id} className="spaced-repetition-row">
            <div className="spaced-repetition-row-meta">
              <div className="spaced-repetition-row-title">
                <strong>{reviewPacket.label}</strong>
                <span className={`spaced-repetition-status spaced-repetition-status-${reviewPacket.status}`}>
                  {reviewPacket.statusLabel}
                </span>
              </div>
              <p>{reviewPacket.families.map(family => family.pattern).join(' / ')}</p>
              <div className="spaced-repetition-row-chips">
                <span>{reviewPacket.coreAlgorithmCount} cores</span>
                <span>{reviewPacket.stageLabel}</span>
                <span>Due {dueCopy(reviewPacket)}</span>
              </div>
            </div>
            <div className="spaced-repetition-days">
              {reviewPacket.days.map(day => {
                const isToday = day.date === spacedRepetition.today
                return (
                  <span
                    key={`${reviewPacket.id}-${day.date}`}
                    className={`spaced-repetition-day spaced-repetition-day-${day.status}${isToday ? ' spaced-repetition-day-today' : ''}`}
                    title={`${formatShortDate(day.date)}${day.label ? `: ${day.label}` : ''}`}
                    aria-label={`${reviewPacket.label} ${formatShortDate(day.date)} ${day.label || 'not due'}`}
                  />
                )
              })}
            </div>
          </article>
        </div>
      )}

      <div className="spaced-repetition-legend" aria-label="Schedule legend">
        <span><i className="spaced-repetition-day spaced-repetition-day-completed" /> Completed</span>
        <span><i className="spaced-repetition-day spaced-repetition-day-failed" /> Incomplete</span>
        <span><i className="spaced-repetition-day spaced-repetition-day-due" /> Due</span>
        <span><i className="spaced-repetition-day spaced-repetition-day-overdue" /> Overdue</span>
        <span><i className="spaced-repetition-day spaced-repetition-day-scheduled" /> Scheduled</span>
      </div>
    </section>
  )
}

const normalizePatternKey = (slug: string, pattern: string) =>
  (slug || pattern)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function SkillAlgorithmIllustration({ slug, pattern }: { slug: string; pattern: string }) {
  const patternKey = normalizePatternKey(slug, pattern)

  if (patternKey === 'sliding-window') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <rect className="skill-svg-highlight" x="48" y="25" width="63" height="34" rx="4" />
          <g className="skill-svg-grid">
            {[16, 48, 80, 112, 144].map((x) => (
              <rect key={x} x={x - 13} y="31" width="26" height="22" rx="2" />
            ))}
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M42 66h75" />
          <path className="skill-svg-line skill-svg-accent" d="m113 61 7 5-7 5" />
          <path className="skill-svg-line" d="M48 20v42M111 20v42" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'two-pointers') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            {[24, 52, 80, 108, 136].map((x) => (
              <rect key={x} x={x - 11} y="32" width="22" height="20" rx="2" />
            ))}
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M24 22v29M136 22v29" />
          <path className="skill-svg-line skill-svg-accent" d="M28 21h37" />
          <path className="skill-svg-line skill-svg-accent" d="m61 16 7 5-7 5" />
          <path className="skill-svg-line skill-svg-accent" d="M132 21H95" />
          <path className="skill-svg-line skill-svg-accent" d="m99 16-7 5 7 5" />
          <path className="skill-svg-line" d="M24 62h112" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'binary-search') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M20 24h120" />
          <path className="skill-svg-line skill-svg-muted" d="M42 43h76" />
          <path className="skill-svg-line skill-svg-muted" d="M61 62h38" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="80" cy="24" r="5" />
          <circle className="skill-svg-node" cx="80" cy="43" r="4" />
          <circle className="skill-svg-node" cx="80" cy="62" r="3.5" />
          <path className="skill-svg-line skill-svg-accent" d="M80 18v50" />
          <path className="skill-svg-line" d="M20 18v12M140 18v12M42 37v12M118 37v12M61 56v12M99 56v12" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'dfs-bfs') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M80 18 45 43M80 18l35 25M45 43 30 66M45 43l30 23M115 43l-20 23M115 43l25 23" />
          <path className="skill-svg-line skill-svg-accent" d="M80 18 45 43 30 66" />
          <g>
            <circle className="skill-svg-node skill-svg-accent-fill" cx="80" cy="18" r="7" />
            <circle className="skill-svg-node skill-svg-accent-fill" cx="45" cy="43" r="6" />
            <circle className="skill-svg-node skill-svg-accent-fill" cx="30" cy="66" r="5" />
            <circle className="skill-svg-node" cx="115" cy="43" r="6" />
            <circle className="skill-svg-node" cx="75" cy="66" r="5" />
            <circle className="skill-svg-node" cx="95" cy="66" r="5" />
            <circle className="skill-svg-node" cx="140" cy="66" r="5" />
          </g>
        </svg>
      </div>
    )
  }

  if (patternKey === 'backtracking') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M80 14 48 35M80 14l32 21M48 35 30 58M48 35l28 23M112 35 92 58M112 35l28 23" />
          <path className="skill-svg-line skill-svg-accent" d="M80 14 48 35 76 58" />
          <path className="skill-svg-line skill-svg-dashed" d="M76 58 48 35 112 35" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="80" cy="14" r="6" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="48" cy="35" r="5.5" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="76" cy="58" r="5" />
          <circle className="skill-svg-node" cx="112" cy="35" r="5.5" />
          <circle className="skill-svg-node" cx="30" cy="58" r="5" />
          <circle className="skill-svg-node" cx="92" cy="58" r="5" />
          <circle className="skill-svg-node" cx="140" cy="58" r="5" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'heap-priority-queue') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M80 15 50 39M80 15l30 24M50 39 34 63M50 39l25 24M110 39 88 63M110 39l28 24" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="80" cy="15" r="8" />
          <circle className="skill-svg-node" cx="50" cy="39" r="7" />
          <circle className="skill-svg-node" cx="110" cy="39" r="7" />
          <circle className="skill-svg-node" cx="34" cy="63" r="5.5" />
          <circle className="skill-svg-node" cx="75" cy="63" r="5.5" />
          <circle className="skill-svg-node" cx="88" cy="63" r="5.5" />
          <circle className="skill-svg-node" cx="138" cy="63" r="5.5" />
          <path className="skill-svg-line skill-svg-accent" d="M80 4v-1M70 8l-7-7M90 8l7-7" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'union-find') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line skill-svg-accent" d="M34 61 55 41M75 61 55 41M55 41V21" />
          <path className="skill-svg-line" d="M105 61 126 41M146 61 126 41" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="55" cy="21" r="7" />
          <circle className="skill-svg-node" cx="55" cy="41" r="6" />
          <circle className="skill-svg-node" cx="34" cy="61" r="6" />
          <circle className="skill-svg-node" cx="75" cy="61" r="6" />
          <circle className="skill-svg-node" cx="126" cy="41" r="7" />
          <circle className="skill-svg-node" cx="105" cy="61" r="6" />
          <circle className="skill-svg-node" cx="146" cy="61" r="6" />
          <path className="skill-svg-line skill-svg-dashed skill-svg-accent" d="M75 61c14-18 30-20 51-20" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'dynamic-programming') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            {[0, 1, 2, 3].map((row) =>
              [0, 1, 2, 3, 4].map((col) => (
                <rect
                  key={`${row}-${col}`}
                  className={row + col <= 4 ? 'skill-svg-cell-filled' : ''}
                  x={38 + col * 18}
                  y={13 + row * 15}
                  width="15"
                  height="12"
                  rx="2"
                />
              )),
            )}
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M45 19h36v15h18v15h18v15" />
          <path className="skill-svg-line skill-svg-accent" d="m113 59 5 5-6 4" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'graph-traversal') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M35 28 70 18l42 14 13 34-45 5-45-18 35-35M70 18l10 53M112 32 80 71M35 53l77-21" />
          <path className="skill-svg-line skill-svg-accent" d="M35 28 70 18 112 32 125 66" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="35" cy="28" r="6" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="70" cy="18" r="6" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="112" cy="32" r="6" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="125" cy="66" r="6" />
          <circle className="skill-svg-node" cx="35" cy="53" r="6" />
          <circle className="skill-svg-node" cx="80" cy="71" r="6" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'intervals') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line skill-svg-muted" d="M20 66h120" />
          <rect className="skill-svg-block" x="24" y="20" width="52" height="10" rx="3" />
          <rect className="skill-svg-block skill-svg-accent-fill" x="56" y="35" width="54" height="10" rx="3" />
          <rect className="skill-svg-block" x="106" y="50" width="32" height="10" rx="3" />
          <path className="skill-svg-line skill-svg-accent" d="M24 72h86" />
          <path className="skill-svg-line skill-svg-accent" d="M24 65v13M110 65v13" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'prefix-sums') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            <rect x="24" y="54" width="16" height="12" rx="2" />
            <rect x="48" y="46" width="16" height="20" rx="2" />
            <rect x="72" y="38" width="16" height="28" rx="2" />
            <rect x="96" y="30" width="16" height="36" rx="2" />
            <rect x="120" y="22" width="16" height="44" rx="2" />
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M24 54h16v-8h24v-8h24v-8h24v-8h24" />
          <path className="skill-svg-line skill-svg-muted" d="M20 66h120" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'monotonic-stack') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            <rect x="45" y="56" width="38" height="10" rx="2" />
            <rect x="45" y="43" width="30" height="10" rx="2" />
            <rect x="45" y="30" width="22" height="10" rx="2" />
            <rect x="45" y="17" width="14" height="10" rx="2" />
          </g>
          <rect className="skill-svg-block skill-svg-accent-fill" x="103" y="31" width="24" height="14" rx="2" />
          <path className="skill-svg-line skill-svg-accent" d="M101 38H75" />
          <path className="skill-svg-line skill-svg-accent" d="m79 33-7 5 7 5" />
          <path className="skill-svg-line skill-svg-dashed" d="M67 30c14-7 14-16-8-12" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'meta') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M38 23h84M38 43h84M38 63h84" />
          <path className="skill-svg-line skill-svg-accent" d="M38 23h36M38 43h58M38 63h44" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="126" cy="23" r="5" />
          <circle className="skill-svg-node" cx="112" cy="43" r="5" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="92" cy="63" r="5" />
          <path className="skill-svg-line skill-svg-dashed" d="M126 23c15 10 15 30-14 20" />
        </svg>
      </div>
    )
  }

  return (
    <div className="skill-map-illustration" aria-hidden="true">
      <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
        <path className="skill-svg-line" d="M36 24h88M36 43h88M36 62h88" />
        <circle className="skill-svg-node skill-svg-accent-fill" cx="55" cy="24" r="5" />
        <circle className="skill-svg-node" cx="89" cy="43" r="5" />
        <circle className="skill-svg-node" cx="70" cy="62" r="5" />
      </svg>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<SkillMapOverviewResponse | null>(null)
  const configuredProviderLabel = useConfiguredProviderLabel()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const patterns = overview?.patterns ?? []
  const launchFocusedPractice = (patternSlug: string) => {
    const nextParams = new URLSearchParams({
      focusPattern: patternSlug,
    })
    navigate(`/?${nextParams.toString()}`)
  }

  return (
    <div className="app app-dashboard">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} />

      <section className="dashboard">
        {error && <p className="skill-map-intro">{error}</p>}

        <SpacedRepetitionPanel
          spacedRepetition={overview?.spacedRepetition}
          onStartFamily={launchFocusedPractice}
        />

        <div className="skill-map-grid">
          {loading && !error && <p className="skill-map-intro">Loading readiness overview...</p>}
          {patterns.map((node) => {
            const isMeta = node.slug === 'meta'
            return (
              <article key={node.slug} className="skill-map-card">
                <div className="skill-map-header">
                  <h3>{node.pattern}</h3>
                  <span className={`coach-status-value coach-status-value-${readinessTone(node.overallReadiness)}`}>
                    {node.overallReadiness}%
                  </span>
                </div>
                <div className="dashboard-summary skill-map-card-stats">
                  <span className="coach-metric-chip">{node.totalCards} {isMeta ? 'meta questions' : 'core algorithms'}</span>
                  <span className="coach-metric-chip">{node.staleCards} stale</span>
                  <span className="coach-metric-chip">{node.ghostRepCount} Ghost Reps</span>
                </div>
                <SkillAlgorithmIllustration slug={node.slug} pattern={node.pattern} />
                <div className="dashboard-mode-tabs">
                  <button
                    type="button"
                    className="dashboard-mode-tab dashboard-mode-tab-actionable"
                    onClick={() => launchFocusedPractice(node.slug)}
                  >
                    <span className="dashboard-mode-tab-label">{isMeta ? 'Start playlist' : 'Start practice'}</span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>

      </section>
    </div>
  )
}
