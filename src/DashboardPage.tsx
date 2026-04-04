import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type SkillMapModeReadiness = {
  readiness: number
  attemptCount: number
  successfulAttempts: number
  avgAccuracy: number
  totalCards: number
  practicedCards: number
  untouchedCards: number
  staleCards: number
  daysSinceLastSubmit: number | null
  stale: boolean
}

type SkillMapPatternReadiness = {
  pattern: string
  slug: string
  methods: string[]
  overallReadiness: number
  overallAttemptCount: number
  totalCards: number
  practicedCards: number
  untouchedCards: number
  staleCards: number
  modes: Record<'pseudo' | 'skeleton' | 'full', SkillMapModeReadiness>
}

type SkillMapCardReadiness = {
  cardId: string
  title: string
  pattern: string
  templateMode: 'pseudo' | 'skeleton' | 'full'
  readiness: number
  attemptCount: number
  daysSinceLastSubmit: number | null
  stale: boolean
}

type SkillMapOverviewResponse = {
  summary: {
    totalGeneratedCards: number
    attemptedCards: number
    untouchedCards: number
    staleCards: number
    patternsStarted: number
    patternsUntouched: number
    avgPatternReadiness: number
    successThreshold: number
    staleAfterDays: number
  }
  patterns: SkillMapPatternReadiness[]
  reviewQueue: SkillMapCardReadiness[]
}

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiUrl = (path: string) => `${API_BASE_URL}${path}`

const formatTemplateModeLabel = (templateMode: SkillMapCardReadiness['templateMode']) =>
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

export default function DashboardPage() {
  const [overview, setOverview] = useState<SkillMapOverviewResponse | null>(null)
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

  const summary = overview?.summary
  const patterns = overview?.patterns ?? []
  const reviewQueue = overview?.reviewQueue ?? []

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">LeetCode Flashcard Game</p>
          <p className="subtitle">Layered Skill Map</p>
        </div>
        <div className="meta">
          <Link to="/" className="nav-link">← Back to Practice</Link>
        </div>
      </header>

      <section className="dashboard">
        <h2>Readiness Overview</h2>
        <p className="skill-map-intro">
          Final submits only. Readiness rises on strong independent reps, gets capped when hints or live coaching were needed, and decays after a few days without practice.
        </p>
        {summary && (
          <div className="dashboard-summary">
            <span className="coach-metric-chip">{summary.avgPatternReadiness}% avg pattern readiness</span>
            <span className="coach-metric-chip">{summary.attemptedCards}/{summary.totalGeneratedCards} cards worked</span>
            <span className="coach-metric-chip">{summary.untouchedCards} untouched cards</span>
            <span className="coach-metric-chip">{summary.staleCards} stale cards</span>
            <span className="coach-metric-chip">{summary.patternsStarted} patterns started</span>
            <span className="coach-metric-chip">{summary.patternsUntouched} untouched patterns</span>
          </div>
        )}
        {summary && (
          <p className="skill-map-intro">
            Strong submit threshold: {summary.successThreshold}% • Review becomes due after about {summary.staleAfterDays} days.
          </p>
        )}
        {error && <p className="skill-map-intro">{error}</p>}
        <div className="skill-map-grid">
          {loading && !error && <p className="skill-map-intro">Loading readiness overview...</p>}
          {patterns.map((node) => (
            <article key={node.slug} className="skill-map-card">
              <div className="skill-map-header">
                <span className="skill-map-level">Pattern</span>
                <h3>{node.pattern}</h3>
                <span className={`coach-status-chip coach-status-chip-${readinessTone(node.overallReadiness)}`}>
                  {node.overallReadiness}%
                </span>
              </div>
              <div className="dashboard-summary" style={{ marginBottom: '0.7rem' }}>
                <span className="coach-metric-chip">{node.practicedCards}/{node.totalCards} cards worked</span>
                <span className="coach-metric-chip">{node.untouchedCards} untouched</span>
                <span className="coach-metric-chip">{node.staleCards} stale</span>
                <span className="coach-metric-chip">{node.overallAttemptCount} submits</span>
              </div>
              <p className="skill-map-subtitle">Level 2: Core methods</p>
              <div className="skill-method-list">
                {node.methods.map((method) => (
                  <span key={method} className="skill-method-chip">{method}</span>
                ))}
              </div>
              <div className="dashboard-mode-grid">
                {(['pseudo', 'skeleton', 'full'] as const).map((mode) => {
                  const modeSummary = node.modes[mode]
                  return (
                    <div key={mode} className="dashboard-mode-card">
                      <div className="dashboard-mode-header">
                        <span>{formatTemplateModeLabel(mode)}</span>
                        <span className={`coach-status-chip coach-status-chip-${readinessTone(modeSummary.readiness)}`}>
                          {modeSummary.readiness}%
                        </span>
                      </div>
                      <p className="dashboard-mode-meta">
                        {modeSummary.practicedCards}/{modeSummary.totalCards} cards · {modeSummary.attemptCount} submits
                      </p>
                      <p className="dashboard-mode-meta">
                        Avg {modeSummary.avgAccuracy}% · {modeSummary.stale ? 'Review due' : 'Fresh enough'}
                      </p>
                      {(modeSummary.untouchedCards > 0 || modeSummary.staleCards > 0) && (
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
          ))}
        </div>

        {reviewQueue.length > 0 && (
          <section className="dashboard-review-queue">
            <h3>Review Queue</h3>
            <p className="skill-map-intro">
              Lowest-readiness practiced card/mode combinations, with stale items surfaced first.
            </p>
            <div className="practice-history-list">
              {reviewQueue.map((item) => (
                <article key={`${item.cardId}-${item.templateMode}`} className="practice-history-entry">
                  <div className="practice-history-entry-top">
                    <div>
                      <p className="practice-history-title">{item.title || item.cardId}</p>
                      <p className="practice-history-meta">
                        {item.pattern} · {formatTemplateModeLabel(item.templateMode)} · {item.attemptCount} submits
                      </p>
                    </div>
                    <span className={`coach-status-chip coach-status-chip-${readinessTone(item.readiness)}`}>
                      {item.readiness}%
                    </span>
                  </div>
                  <p className="practice-history-feedback">
                    {item.daysSinceLastSubmit === null
                      ? 'No recent submit stored.'
                      : item.daysSinceLastSubmit === 0
                        ? 'Practiced today.'
                        : `${item.daysSinceLastSubmit} day${item.daysSinceLastSubmit === 1 ? '' : 's'} since last submit.`}
                    {item.stale ? ' Review due.' : ''}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    </div>
  )
}
