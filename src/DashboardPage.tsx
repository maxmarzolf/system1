import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type GameMode =
  | 'main-recall'
  | 'snap-classify'
  | 'template-hunt'
  | 'gut-check'
  | 'no-go-trap'
  | 'near-miss-duel'
  | 'multiple-choice'
  | 'full-solution'
  | 'typing-race'

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
    'main-recall': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
    'snap-classify': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
    'template-hunt': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
    'gut-check': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
    'no-go-trap': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
    'near-miss-duel': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
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

type System1SessionSummary = {
  total_sessions: number
  avg_accuracy: number
  avg_duration_ms: number
  avg_score: number
  best_accuracy: number
  best_score: number
}

type System1SessionDay = {
  date: string
  sessions: number
  avg_accuracy: number
  avg_score: number
  avg_duration_ms: number
}

type System1SessionModeStats = {
  sessions: number
  avg_accuracy: number
  avg_score: number
}

type System1SessionRecord = {
  id: number
  mode: GameMode
  question_type: string
  order_type: string
  card_count: number
  attempts: number
  correct_count: number
  accuracy: number
  duration_ms: number
  total_score: number
  avg_automaticity: number
  started_at: string
  completed_at: string
  created_at: string
}

type System1SessionActivityResponse = {
  summary: System1SessionSummary
  byDay: System1SessionDay[]
  byMode: Record<string, System1SessionModeStats>
  recent: System1SessionRecord[]
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

const defaultSystem1SessionActivity: System1SessionActivityResponse = {
  summary: {
    total_sessions: 0,
    avg_accuracy: 0,
    avg_duration_ms: 0,
    avg_score: 0,
    best_accuracy: 0,
    best_score: 0,
  },
  byDay: [],
  byMode: {},
  recent: [],
}

const modeOrder: GameMode[] = [
  'main-recall',
  'snap-classify',
  'template-hunt',
  'gut-check',
  'no-go-trap',
  'near-miss-duel',
]

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
  mode === 'main-recall'
    ? 'Main Recall'
    : mode === 'snap-classify'
    ? 'Snap Classify'
    : mode === 'template-hunt'
      ? 'Template Hunt'
      : mode === 'gut-check'
        ? 'Gut Check'
        : mode === 'no-go-trap'
          ? 'No-Go Trap'
          : mode === 'near-miss-duel'
            ? 'Near-Miss Duel'
            : mode === 'multiple-choice'
              ? 'Multiple Choice'
              : mode === 'full-solution'
                ? 'Full Solution'
                : 'Typing Race'

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse>(defaultStats)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState('')
  const [typingActivity, setTypingActivity] = useState<TypingActivityResponse>(defaultTypingActivity)
  const [system1SessionActivity, setSystem1SessionActivity] = useState<System1SessionActivityResponse>(defaultSystem1SessionActivity)

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

    const fetchSystem1SessionActivity = async () => {
      try {
        const response = await fetch(apiUrl('/api/system1-session-activity'))
        if (!response.ok) throw new Error('Unable to load session activity')
        const payload = (await response.json()) as System1SessionActivityResponse
        setSystem1SessionActivity(payload)
      } catch {
        // silently fail
      }
    }

    void fetchStats()
    void fetchTypingActivity()
    void fetchSystem1SessionActivity()
  }, [])

  // Build merged activity map for the grid
  const mergedActivityMap = (() => {
    const map = new Map<string, { typing: ActivityDay | null; flashcard: DayStats | null; system1: System1SessionDay | null }>()

    for (const day of typingActivity.activity) {
      map.set(day.day, { typing: day, flashcard: null, system1: null })
    }
    for (const day of system1SessionActivity.byDay) {
      const existing = map.get(day.date)
      if (existing) {
        existing.system1 = day
      } else {
        map.set(day.date, { typing: null, flashcard: null, system1: day })
      }
    }
    for (const day of stats.byDay) {
      const existing = map.get(day.date)
      if (existing) {
        existing.flashcard = day
      } else {
        map.set(day.date, { typing: null, flashcard: day, system1: null })
      }
    }
    return map
  })()

  const activeDayCount = Array.from(mergedActivityMap.values()).filter(
    (d) => (d.typing?.sessions ?? 0) > 0 || (d.flashcard?.attempts ?? 0) > 0 || (d.system1?.sessions ?? 0) > 0
  ).length

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

      {/* ─── Activity Grid (top) ─── */}
      <section className="dashboard">
        <div className="activity-grid-section">
          <h3>Practice Activity</h3>
          <p className="activity-grid-subtitle">
            {activeDayCount > 0
              ? `${activeDayCount} active day${activeDayCount !== 1 ? 's' : ''} in the last year · ${typingActivity.streak} day streak`
              : 'No activity yet — start practicing!'}
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

                  const cells: React.ReactNode[] = []
                  const cursor = new Date(startDate)

                  while (cursor <= today) {
                    const key = cursor.toISOString().slice(0, 10)
                    const merged = mergedActivityMap.get(key)
                    const typingData = merged?.typing
                    const flashcardData = merged?.flashcard
                    const system1Data = merged?.system1

                    const typingSessions = typingData?.sessions ?? 0
                    const typingMin = Math.round((typingData?.total_ms ?? 0) / 60000)
                    const fcAttempts = flashcardData?.attempts ?? 0
                    const s1Sessions = system1Data?.sessions ?? 0
                    const totalActivity = typingSessions + fcAttempts + s1Sessions

                    let level = 0
                    if (totalActivity > 0) {
                      const totalMin = typingMin + fcAttempts * 2 + s1Sessions * 4 // rough weight
                      if (totalMin >= 60) level = 4
                      else if (totalMin >= 30) level = 3
                      else if (totalMin >= 10) level = 2
                      else level = 1
                    }

                    const hasActivity = totalActivity > 0

                    cells.push(
                      <div
                        key={key}
                        className={`activity-cell level-${level}`}
                      >
                        {hasActivity && (
                          <div className="activity-tooltip">
                            <strong>{key}</strong>
                            {typingSessions > 0 && (
                              <>
                                <span className="tooltip-section">Typing</span>
                                <span>{typingSessions} session{typingSessions > 1 ? 's' : ''} · {typingMin}min</span>
                                <span>{typingData?.avg_wpm ?? 0} WPM · {typingData?.avg_accuracy ?? 0}% acc</span>
                                {typingData?.total_chars ? <span>{typingData.total_chars.toLocaleString()} chars</span> : null}
                              </>
                            )}
                            {fcAttempts > 0 && (
                              <>
                                <span className="tooltip-section">Flashcards</span>
                                <span>{flashcardData?.correct ?? 0}/{fcAttempts} correct ({flashcardData?.accuracy ?? 0}%)</span>
                              </>
                            )}
                            {s1Sessions > 0 && (
                              <>
                                <span className="tooltip-section">System 1 sessions</span>
                                <span>{s1Sessions} session{s1Sessions > 1 ? 's' : ''} · avg {system1Data?.avg_accuracy ?? 0}%</span>
                                <span>avg score {system1Data?.avg_score ?? 0}</span>
                              </>
                            )}
                          </div>
                        )}
                        {!hasActivity && (
                          <div className="activity-tooltip">
                            <strong>{key}</strong>
                            <span>No practice</span>
                          </div>
                        )}
                      </div>
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
      </section>

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

      <section className="dashboard">
        <h2>System 1 Session Trends</h2>
        <div className="dashboard-metrics">
          <article className="metric-card">
            <p className="metric-label">Total Sessions</p>
            <p className="metric-value">{system1SessionActivity.summary.total_sessions}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Avg Accuracy</p>
            <p className="metric-value">{system1SessionActivity.summary.avg_accuracy}%</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Avg Duration</p>
            <p className="metric-value">{formatDuration(system1SessionActivity.summary.avg_duration_ms)}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Avg Score</p>
            <p className="metric-value">{system1SessionActivity.summary.avg_score}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Best Accuracy</p>
            <p className="metric-value">{system1SessionActivity.summary.best_accuracy}%</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Best Score</p>
            <p className="metric-value">{system1SessionActivity.summary.best_score}</p>
          </article>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-panel">
            <h3>By mode</h3>
            <div className="mode-breakdown">
              {modeOrder.map((mode) => {
                const value = system1SessionActivity.byMode[mode] ?? {
                  sessions: 0,
                  avg_accuracy: 0,
                  avg_score: 0,
                }
                return (
                  <div key={mode} className="breakdown-row">
                    <p>{modeLabel(mode)}</p>
                    <div className="bar-track" aria-hidden="true">
                      <div className="bar-fill" style={{ width: `${value.avg_accuracy}%` }} />
                    </div>
                    <span>{value.avg_accuracy}% ({value.sessions})</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="dashboard-panel">
            <h3>Session trend (365d)</h3>
            {system1SessionActivity.byDay.length === 0 ? (
              <p className="dashboard-message">No completed sessions yet.</p>
            ) : (
              <div className="trend-list">
                {system1SessionActivity.byDay.map((day) => {
                  const width = Math.max(day.avg_accuracy, day.sessions > 0 ? 8 : 0)
                  return (
                    <div key={day.date} className="trend-row">
                      <span>{day.date.slice(5)}</span>
                      <div className="bar-track" aria-hidden="true">
                        <div className="bar-fill" style={{ width: `${width}%` }} />
                      </div>
                      <span>{day.avg_accuracy}% ({day.sessions})</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {system1SessionActivity.recent.length > 0 && (
          <div className="dashboard-panel recent-panel">
            <h3>Recent completed sessions</h3>
            <ul className="recent-list">
              {system1SessionActivity.recent.slice(0, 10).map((session) => (
                <li key={session.id}>
                  <span>{modeLabel(session.mode)} · {session.question_type} · {session.order_type}</span>
                  <span>{session.correct_count}/{session.attempts} ({session.accuracy}%) · score {session.total_score}</span>
                  <span>{new Date(session.completed_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
