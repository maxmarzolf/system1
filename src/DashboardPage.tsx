import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type GameMode = 'multiple-choice' | 'full-solution' | 'typing-race'

type ModeStats = {
  correct: number
  incorrect: number
  attempts: number
  accuracy: number
}

type DayStats = {
  date: string
  correct: number
  incorrect: number
  attempts: number
  accuracy: number
}

type AttemptRecord = {
  cardId: string
  mode: GameMode
  correct: boolean
  timestamp: string
}

type StatsResponse = {
  totals: ModeStats
  byMode: Record<GameMode, ModeStats>
  byDay: DayStats[]
  recent: AttemptRecord[]
}

const defaultStats: StatsResponse = {
  totals: { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
  byMode: {
    'multiple-choice': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
    'full-solution': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
    'typing-race': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
  },
  byDay: [],
  recent: [],
}

type ActivityDay = {
  day: string
  sessions: number
  total_ms: number
  avg_accuracy: number
  avg_wpm: number
  total_chars: number
  correct_count: number
  question_types: string
  category_tags: string
}

type TypingSummary = {
  total_sessions: number
  total_ms: number
  total_chars: number
  avg_accuracy: number
  avg_wpm: number
  total_correct: number
  best_score: number
  best_wpm: number
}

type TypingSession = {
  id: number
  card_id: string
  card_title: string
  question_type: string
  category_tags: string
  correct: number
  accuracy: number
  wpm: number
  score: number
  elapsed_ms: number
  mistakes: number
  backspaces: number
  chars_typed: number
  created_at: string
}

type TypingActivityResponse = {
  activity: ActivityDay[]
  summary: TypingSummary
  recent: TypingSession[]
  streak: number
}

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiUrl = (path: string) => `${API_BASE_URL}${path}`

const defaultTypingActivity: TypingActivityResponse = {
  activity: [],
  summary: {
    total_sessions: 0, total_ms: 0, total_chars: 0,
    avg_accuracy: 0, avg_wpm: 0, total_correct: 0,
    best_score: 0, best_wpm: 0,
  },
  recent: [],
  streak: 0,
}

const modeOrder: GameMode[] = ['multiple-choice', 'full-solution', 'typing-race']

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

const modeLabel = (mode: GameMode) =>
  mode === 'multiple-choice'
    ? 'Multiple Choice'
    : mode === 'full-solution'
      ? 'Full Solution'
      : 'Typing Race'

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse>(defaultStats)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState('')
  const [typingActivity, setTypingActivity] = useState<TypingActivityResponse>(defaultTypingActivity)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(apiUrl('/api/stats'))
        if (!response.ok) throw new Error('Unable to load stats')
        const payload = (await response.json()) as StatsResponse
        setStats(payload)
        setStatsError('')
      } catch {
        setStatsError('Backend unavailable — scores are not being tracked right now.')
      } finally {
        setStatsLoading(false)
      }
    }

    const fetchTypingActivity = async () => {
      try {
        const response = await fetch(apiUrl('/api/typing-activity'))
        if (!response.ok) throw new Error('Unable to load typing activity')
        const payload = (await response.json()) as TypingActivityResponse
        setTypingActivity(payload)
      } catch {
        // silently fail
      }
    }

    void fetchStats()
    void fetchTypingActivity()
  }, [])

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">LeetCode Flashcard Game</p>
          <p className="subtitle">Progress Dashboard &amp; Typing Practice Activity</p>
        </div>
        <div className="meta">
          <Link to="/" className="nav-link">← Back to Practice</Link>
        </div>
      </header>

      {/* ─── Progress Dashboard ─── */}
      <section className="dashboard">
        <h2>Progress Dashboard</h2>
        {statsLoading ? (
          <p className="dashboard-message">Loading score history…</p>
        ) : (
          <>
            <div className="dashboard-metrics">
              <article className="metric-card">
                <p className="metric-label">Correct</p>
                <p className="metric-value">{stats.totals.correct}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Incorrect</p>
                <p className="metric-value">{stats.totals.incorrect}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Attempts</p>
                <p className="metric-value">{stats.totals.attempts}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Accuracy</p>
                <p className="metric-value">{stats.totals.accuracy}%</p>
              </article>
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-panel">
                <h3>By game mode</h3>
                <div className="mode-breakdown">
                  {modeOrder.map((mode) => {
                    const value = stats.byMode[mode] ?? {
                      correct: 0,
                      incorrect: 0,
                      attempts: 0,
                      accuracy: 0,
                    }
                    return (
                      <div key={mode} className="breakdown-row">
                        <p>{modeLabel(mode)}</p>
                        <div className="bar-track" aria-hidden="true">
                          <div className="bar-fill" style={{ width: `${value.accuracy}%` }} />
                        </div>
                        <span>{value.accuracy}% ({value.correct}/{value.attempts || 0})</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="dashboard-panel">
                <h3>Last 14 days</h3>
                {stats.byDay.length === 0 ? (
                  <p className="dashboard-message">No attempts yet.</p>
                ) : (
                  <div className="trend-list">
                    {stats.byDay.map((day) => {
                      const width = Math.max(day.accuracy, day.attempts > 0 ? 8 : 0)
                      return (
                        <div key={day.date} className="trend-row">
                          <span>{day.date.slice(5)}</span>
                          <div className="bar-track" aria-hidden="true">
                            <div className="bar-fill" style={{ width: `${width}%` }} />
                          </div>
                          <span>{day.accuracy}% ({day.attempts})</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {statsError && <p className="dashboard-error">{statsError}</p>}
      </section>

      {/* ─── Typing Practice Activity ─── */}
      <section className="dashboard typing-activity-section">
        <h2>Typing Practice Activity</h2>

        <div className="dashboard-metrics">
          <article className="metric-card">
            <p className="metric-label">Sessions</p>
            <p className="metric-value">{typingActivity.summary.total_sessions}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Total Time</p>
            <p className="metric-value">{formatDuration(typingActivity.summary.total_ms)}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Streak</p>
            <p className="metric-value">{typingActivity.streak} day{typingActivity.streak !== 1 ? 's' : ''}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Best WPM</p>
            <p className="metric-value">{typingActivity.summary.best_wpm}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Avg Accuracy</p>
            <p className="metric-value">{typingActivity.summary.avg_accuracy}%</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Avg WPM</p>
            <p className="metric-value">{typingActivity.summary.avg_wpm}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Best Score</p>
            <p className="metric-value">{typingActivity.summary.best_score}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Chars Typed</p>
            <p className="metric-value">{typingActivity.summary.total_chars.toLocaleString()}</p>
          </article>
        </div>

        <div className="activity-grid-section">
          <h3>Practice Activity</h3>
          <p className="activity-grid-subtitle">
            {typingActivity.activity.length > 0
              ? `${typingActivity.activity.filter((d) => d.sessions > 0).length} active days in the last year`
              : 'No typing sessions yet — start practicing!'}
          </p>
          <div className="activity-grid-wrapper">
            <div className="activity-grid-months">
              {(() => {
                const months: string[] = []
                const today = new Date()
                for (let i = 11; i >= 0; i--) {
                  const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
                  months.push(d.toLocaleString('default', { month: 'short' }))
                }
                return months.map((m) => <span key={m}>{m}</span>)
              })()}
            </div>
            <div className="activity-grid-container">
              <div className="activity-grid-days">
                <span>Mon</span>
                <span></span>
                <span>Wed</span>
                <span></span>
                <span>Fri</span>
                <span></span>
                <span></span>
              </div>
              <div className="activity-grid">
                {(() => {
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const startDate = new Date(today)
                  startDate.setDate(startDate.getDate() - 364)
                  startDate.setDate(startDate.getDate() - startDate.getDay())

                  const activityMap = new Map<string, ActivityDay>()
                  for (const day of typingActivity.activity) {
                    activityMap.set(day.day, day)
                  }

                  const cells: React.ReactNode[] = []
                  const cursor = new Date(startDate)

                  while (cursor <= today) {
                    const key = cursor.toISOString().slice(0, 10)
                    const dayData = activityMap.get(key)
                    const sessions = dayData?.sessions ?? 0
                    const totalMin = Math.round((dayData?.total_ms ?? 0) / 60000)

                    let level = 0
                    if (sessions > 0) {
                      if (totalMin >= 60) level = 4
                      else if (totalMin >= 30) level = 3
                      else if (totalMin >= 10) level = 2
                      else level = 1
                    }

                    const tooltip = sessions > 0
                      ? `${key}: ${sessions} session${sessions > 1 ? 's' : ''}, ${totalMin}min, ${dayData?.avg_accuracy ?? 0}% accuracy`
                      : `${key}: No practice`

                    cells.push(
                      <div
                        key={key}
                        className={`activity-cell level-${level}`}
                        title={tooltip}
                      />
                    )
                    cursor.setDate(cursor.getDate() + 1)
                  }

                  return cells
                })()}
              </div>
            </div>
          </div>
          <div className="activity-legend">
            <span>Less</span>
            <div className="activity-cell level-0" />
            <div className="activity-cell level-1" />
            <div className="activity-cell level-2" />
            <div className="activity-cell level-3" />
            <div className="activity-cell level-4" />
            <span>More</span>
          </div>
        </div>

        {typingActivity.recent.length > 0 && (
          <div className="dashboard-panel">
            <h3>Recent Typing Sessions</h3>
            <div className="recent-sessions-list">
              {typingActivity.recent.map((session) => (
                <div key={session.id} className="recent-session-row">
                  <span className="recent-session-title">
                    #{session.card_id} {session.card_title}
                  </span>
                  <span className="recent-session-tags">{session.question_type}</span>
                  <span className={`recent-session-result ${session.correct ? 'correct' : 'incorrect'}`}>
                    {session.correct ? '✓' : '✗'}
                  </span>
                  <span>{session.accuracy}%</span>
                  <span>{session.wpm} WPM</span>
                  <span>{formatDuration(session.elapsed_ms)}</span>
                  <span className="recent-session-date">
                    {new Date(session.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
