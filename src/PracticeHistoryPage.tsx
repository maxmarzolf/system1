import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

type PracticeHistoryEntry = {
  attemptId: number
  interactionId: string
  cardId: string
  cardTitle: string
  question: string
  accuracy: number
  exact: boolean
  elapsedMs: number
  templateMode: 'pseudo' | 'skeleton' | 'full'
  hintUsed: boolean
  liveCoachUsed: boolean
  drillDownUsed: boolean
  categoryTags: string[]
  generatedCard: {
    prompt?: string
  }
  liveFeedbackCount: number
  latestLiveFeedback: {
    primaryFocus?: string
    immediateCorrection?: string
  }
  submissionFeedback: {
    fullFeedback?: string
    diagnosis?: string
    primaryFocus?: string
  }
  createdAt: string
}

type PracticeHistorySummary = {
  attemptCount: number
  recentAvgAccuracy: number
  readiness: number
  daysSinceLastSubmit: number | null
  stale: boolean
  weakestTag: string
  repeatedErrorTags: string[]
  recentPrimaryFocuses: string[]
  templateModes: Record<string, { readiness: number }>
}

type PracticeHistoryResponse = {
  summary: PracticeHistorySummary
  entries: PracticeHistoryEntry[]
}

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const MAIN_RECALL_CLOSE_ENOUGH_ACCURACY = 90
const apiUrl = (path: string) => `${API_BASE_URL}${path}`
const formatTemplateModeLabel = (templateMode: PracticeHistoryEntry['templateMode']) =>
  ({
    pseudo: 'Pseudo',
    skeleton: 'Skeleton',
    full: 'Full',
  })[templateMode] ?? templateMode

const summarizeHistoryText = (entry: PracticeHistoryEntry) => {
  const submissionSummary =
    entry.submissionFeedback.fullFeedback ||
    entry.submissionFeedback.diagnosis ||
    entry.submissionFeedback.primaryFocus ||
    ''
  if (submissionSummary.trim()) return submissionSummary.trim()

  const liveSummary =
    entry.latestLiveFeedback.primaryFocus ||
    entry.latestLiveFeedback.immediateCorrection ||
    ''
  return liveSummary.trim() || 'No stored feedback yet for this submission.'
}

export default function PracticeHistoryPage() {
  const [searchParams] = useSearchParams()
  const cardId = searchParams.get('cardId')?.trim() || ''
  const cardTitle = searchParams.get('cardTitle')?.trim() || ''
  const questionType = searchParams.get('questionType')?.trim() || 'skill-map'
  const skillTags = useMemo(
    () => searchParams.getAll('tag').map((tag) => tag.trim()).filter(Boolean),
    [searchParams]
  )

  const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryEntry[]>([])
  const [practiceHistorySummary, setPracticeHistorySummary] = useState<PracticeHistorySummary | null>(null)
  const [practiceHistoryLoading, setPracticeHistoryLoading] = useState(false)
  const [practiceHistoryError, setPracticeHistoryError] = useState('')

  useEffect(() => {
    if (!cardId && skillTags.length === 0) {
      setPracticeHistory([])
      setPracticeHistorySummary(null)
      setPracticeHistoryLoading(false)
      setPracticeHistoryError('')
      return
    }

    const loadPracticeHistory = async () => {
      setPracticeHistoryLoading(true)
      setPracticeHistoryError('')

      try {
        const response = await fetch(apiUrl('/api/coach/history'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId,
            questionType,
            skillTags,
            limit: 20,
          }),
        })
        if (!response.ok) throw new Error('Unable to load practice history')

        const payload = (await response.json()) as PracticeHistoryResponse
        setPracticeHistory(payload.entries)
        setPracticeHistorySummary(payload.summary)
      } catch {
        setPracticeHistory([])
        setPracticeHistorySummary(null)
        setPracticeHistoryError('Practice history is unavailable right now.')
      } finally {
        setPracticeHistoryLoading(false)
      }
    }

    void loadPracticeHistory()
  }, [cardId, questionType, skillTags])

  const historyWeakestTag = practiceHistorySummary?.weakestTag?.trim() || ''
  const recentPrimaryFocuses =
    practiceHistorySummary?.recentPrimaryFocuses.map((focus) => focus.trim()).filter(Boolean) ?? []
  const pageTitle = cardTitle || cardId || 'Practice History'
  const hasContext = Boolean(cardId || skillTags.length > 0)

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-left">
          <span className="navbar-brand">System 1 Trainer</span>
          <span className="navbar-divider" />
          <div className="navbar-group">
            <button className="nav-tab active" type="button">
              Practice History
            </button>
          </div>
        </div>
        <div className="navbar-right">
          <Link to="/coach-tuning" className="navbar-dashboard">Tune Coach</Link>
          <Link to="/" className="navbar-dashboard">Back to Practice</Link>
          <Link to="/dashboard" className="navbar-dashboard">Dashboard</Link>
        </div>
      </nav>

      <section className="card">
        <div className="card-header practice-history-page-header">
          <div>
            <h2>{pageTitle}</h2>
            <p className="difficulty">
              {cardId ? `Card ${cardId}` : 'Skill-tag history'} · {questionType}
            </p>
            <p className="hint practice-history-page-intro">
              Stored submissions, live coach snapshots, and final feedback for the current practice context.
            </p>
          </div>
          {skillTags.length > 0 && (
            <div className="tags">
              {skillTags.map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {!hasContext && (
          <p className="coach-muted">
            Open this page from a practice card to load related submission history.
          </p>
        )}

        {hasContext && (
          <div className="practice-history-panel panel">
            <div className="practice-history-header">
              <div>
                <h3>Recent Submission History</h3>
                <p className="hint" style={{ marginTop: '0.35rem' }}>
                  The backend keeps generated questions, live coach snapshots, and final submission feedback together so future prompts can adapt.
                </p>
              </div>
              {practiceHistorySummary && (
                <div className="practice-history-summary">
                  <span className="coach-metric-chip">{practiceHistorySummary.attemptCount} related attempts</span>
                  <span className="coach-metric-chip">Readiness {practiceHistorySummary.readiness}%</span>
                  <span className="coach-metric-chip">Avg {practiceHistorySummary.recentAvgAccuracy}%</span>
                  {practiceHistorySummary.daysSinceLastSubmit !== null && (
                    <span className="coach-metric-chip">
                      {practiceHistorySummary.daysSinceLastSubmit === 0
                        ? 'Practiced today'
                        : `${practiceHistorySummary.daysSinceLastSubmit}d since last submit`}
                    </span>
                  )}
                  {practiceHistorySummary.stale && (
                    <span className="coach-metric-chip">Review due</span>
                  )}
                  {historyWeakestTag && (
                    <span className="coach-metric-chip">Weakest {historyWeakestTag}</span>
                  )}
                </div>
              )}
            </div>

            {practiceHistorySummary && (
              <div className="practice-history-focuses">
                {(['pseudo', 'skeleton', 'full'] as const).map((mode) => (
                  <span key={mode} className="coach-metric-chip">
                    {formatTemplateModeLabel(mode)} {practiceHistorySummary.templateModes?.[mode]?.readiness ?? 0}%
                  </span>
                ))}
              </div>
            )}

            {recentPrimaryFocuses.length > 0 && (
              <div className="practice-history-focuses">
                {recentPrimaryFocuses.map((focus) => (
                  <span key={focus} className="coach-metric-chip">{focus}</span>
                ))}
              </div>
            )}

            {practiceHistoryLoading && <p className="coach-muted">Loading recent submissions...</p>}
            {!practiceHistoryLoading && practiceHistoryError && <p className="coach-error">{practiceHistoryError}</p>}
            {!practiceHistoryLoading && !practiceHistoryError && practiceHistory.length === 0 && (
              <p className="coach-muted">No stored submission history yet for this skill pattern.</p>
            )}
            {!practiceHistoryLoading && practiceHistory.length > 0 && (
              <div className="practice-history-list">
                {practiceHistory.map((entry) => {
                  const entryTone =
                    entry.exact
                      ? 'success'
                      : entry.accuracy >= MAIN_RECALL_CLOSE_ENOUGH_ACCURACY
                        ? 'warning'
                        : 'error'

                  return (
                    <article key={`${entry.attemptId}-${entry.createdAt}`} className="practice-history-entry">
                      <div className="practice-history-entry-top">
                        <div>
                          <p className="practice-history-title">{entry.cardTitle || entry.cardId}</p>
                          <p className="practice-history-meta">
                            {formatTemplateModeLabel(entry.templateMode)} · {entry.liveFeedbackCount} live feedback {entry.liveFeedbackCount === 1 ? 'snapshot' : 'snapshots'} · {(entry.elapsedMs / 1000).toFixed(1)}s
                          </p>
                        </div>
                        <span className={`coach-status-chip coach-status-chip-${entryTone}`}>
                          {entry.exact ? 'Sound' : `${entry.accuracy}%`}
                        </span>
                      </div>
                      {(entry.hintUsed || entry.liveCoachUsed || entry.drillDownUsed) && (
                        <div className="practice-history-focuses">
                          {entry.hintUsed && <span className="coach-metric-chip">Hint used</span>}
                          {entry.liveCoachUsed && <span className="coach-metric-chip">Live coach used</span>}
                          {entry.drillDownUsed && <span className="coach-metric-chip">Drill-down used</span>}
                        </div>
                      )}
                      <p className="practice-history-question">
                        {entry.question || entry.generatedCard.prompt || 'Stored generated question'}
                      </p>
                      <p className="practice-history-feedback">{summarizeHistoryText(entry)}</p>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
