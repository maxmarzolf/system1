import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiUrl } from './api'
import GhostRepActivityChart, { type GhostRepActivity, type GhostRepPatternOrder } from './GhostRepActivityChart'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'

type PracticeHistoryEntry = {
  attemptId: number
  interactionId: string
  cardId: string
  cardTitle: string
  question: string
  questionType: string
  correctAnswer: string
  userAnswer: string
  accuracy: number
  exact: boolean
  elapsedMs: number
  templateMode: string
  supportLayer: 'none' | 'ghost-reps'
  liveCoachUsed: boolean
  categoryTags: string[]
  generatedCard: {
    cardMode?: string
    prompt?: string
    question?: string
    difficulty?: string
    pattern?: string
    correctChoiceId?: string
    choices?: Array<{ id?: string; text?: string }>
    explanation?: string
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
  submissionRubric: SubmissionRubric
  createdAt: string
}

type RubricDimension = {
  key?: string
  label?: string
  status?: string
  score?: number
  evidence?: string[]
  missing?: string[]
}

type SubmissionRubric = {
  verdict?: string
  score?: {
    overall?: number
    conceptual?: number
    fidelity?: number
    executable?: number
    fluency?: number
  }
  primaryFailure?: {
    key?: string
    label?: string
    severity?: string
    evidence?: string[]
  }
  dimensions?: Record<string, RubricDimension>
  modifiers?: Record<string, RubricDimension>
  recommendedAction?: string
}

type DimensionItem = {
  key: string
  label: string
  avgScore?: number
  weakCount?: number
  failCount?: number
}

type DimensionSummary = {
  rubricAttemptCount?: number
  avgRubricScore?: number
  topWeakDimension?: DimensionItem
  weakDimensions?: DimensionItem[]
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
  dimensionSummary: DimensionSummary
  templateModes: Record<string, { readiness: number; dimensionSummary?: DimensionSummary }>
}

type PracticeHistoryResponse = {
  summary: PracticeHistorySummary
  entries: PracticeHistoryEntry[]
}

type SkillMapOverviewForGhostReps = {
  patterns: GhostRepPatternOrder[]
  ghostRepActivity: GhostRepActivity
}

const MAIN_RECALL_CLOSE_ENOUGH_ACCURACY = 90
type TemplateMode = 'algorithm'
const TEMPLATE_MODE_ORDER: TemplateMode[] = ['algorithm']
const TEMPLATE_MODE_LABELS: Record<string, string> = {
    algorithm: 'Algorithm',
    total: 'Inline',
}
const formatTemplateModeLabel = (templateMode: PracticeHistoryEntry['templateMode']) =>
  TEMPLATE_MODE_LABELS[templateMode] ?? 'Legacy'

const formatSupportLayerLabel = (supportLayer: PracticeHistoryEntry['supportLayer']) =>
  supportLayer === 'ghost-reps' ? 'Ghost Rep' : 'Unsupported'

const isMultipleChoiceEntry = (entry: PracticeHistoryEntry) =>
  entry.questionType.startsWith('skill-map-mcq') || entry.generatedCard.cardMode === 'multiple-choice'

const choiceTextByStoredAnswer = (entry: PracticeHistoryEntry, storedAnswer: string) => {
  const answer = storedAnswer.trim()
  const choiceId = answer.match(/^([A-D])\./)?.[1] || answer
  const choice = entry.generatedCard.choices?.find((item) => item.id === choiceId)
  if (choice?.id && choice.text) return `${choice.id}. ${choice.text}`
  return answer
}

const summarizeHistoryText = (entry: PracticeHistoryEntry) => {
  if (isMultipleChoiceEntry(entry)) {
    return entry.generatedCard.explanation?.trim() || 'Multiple choice result saved.'
  }

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

const dimensionLabel = (dimension?: { key?: string; label?: string }) =>
  dimension?.label?.trim() || dimension?.key?.replace(/_/g, ' ') || ''

const rubricDimensionsForDisplay = (rubric: SubmissionRubric) =>
  Object.values({ ...(rubric.dimensions ?? {}), ...(rubric.modifiers ?? {}) })
    .filter((dimension) => dimension.status && dimension.status !== 'not_applicable')
    .sort((a, b) => {
      const statusRank = (status?: string) => ({ fail: 0, partial: 1, pass: 2 }[status ?? ''] ?? 3)
      return statusRank(a.status) - statusRank(b.status) || (a.score ?? 0) - (b.score ?? 0)
    })
    .slice(0, 6)

const formatWeakDimension = (summary?: DimensionSummary) => {
  const weak = summary?.topWeakDimension
  if (!weak?.key) return ''
  return `${dimensionLabel(weak)}${weak.avgScore !== undefined ? ` ${weak.avgScore}%` : ''}`
}

export default function PracticeHistoryPage() {
  const configuredProviderLabel = useConfiguredProviderLabel()
  const [searchParams] = useSearchParams()
  const cardId = searchParams.get('cardId')?.trim() || ''
  const questionType = searchParams.get('questionType')?.trim() || 'skill-map'
  const skillTags = useMemo(
    () => searchParams.getAll('tag').map((tag) => tag.trim()).filter(Boolean),
    [searchParams]
  )

  const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryEntry[]>([])
  const [practiceHistorySummary, setPracticeHistorySummary] = useState<PracticeHistorySummary | null>(null)
  const [practiceHistoryLoading, setPracticeHistoryLoading] = useState(false)
  const [practiceHistoryError, setPracticeHistoryError] = useState('')
  const [ghostRepOverview, setGhostRepOverview] = useState<SkillMapOverviewForGhostReps | null>(null)
  const [ghostRepOverviewError, setGhostRepOverviewError] = useState('')

  useEffect(() => {
    const loadGhostRepOverview = async () => {
      setGhostRepOverviewError('')
      try {
        const response = await fetch(apiUrl('/api/skill-map-overview'))
        if (!response.ok) throw new Error('Unable to load Ghost Rep overview')
        const payload = (await response.json()) as SkillMapOverviewForGhostReps
        setGhostRepOverview(payload)
      } catch {
        setGhostRepOverview(null)
        setGhostRepOverviewError('Ghost Rep activity is unavailable right now.')
      }
    }

    void loadGhostRepOverview()
  }, [])

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
  const repeatedWeakDimensions = practiceHistorySummary?.dimensionSummary?.weakDimensions ?? []
  const hasContext = Boolean(cardId || skillTags.length > 0)

  return (
    <div className="app">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} />

        <GhostRepActivityChart
          activity={ghostRepOverview?.ghostRepActivity}
          patternOrder={ghostRepOverview?.patterns ?? []}
        />
        {ghostRepOverviewError && <p className="coach-error">{ghostRepOverviewError}</p>}

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
                {TEMPLATE_MODE_ORDER.map((mode) => (
                  <span key={mode} className="coach-metric-chip">
                    {formatTemplateModeLabel(mode)} {practiceHistorySummary.templateModes?.[mode]?.readiness ?? 0}%
                  </span>
                ))}
              </div>
            )}

            {repeatedWeakDimensions.length > 0 && (
              <div className="practice-history-rubric-summary">
                <p className="practice-history-meta">Repeated weak dimensions</p>
                <div className="practice-history-focuses">
                  {repeatedWeakDimensions.slice(0, 5).map((dimension) => (
                    <span key={dimension.key} className="coach-metric-chip">
                      {dimensionLabel(dimension)} {dimension.avgScore ?? 0}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {recentPrimaryFocuses.length > 0 && (
              <div className="practice-history-focuses">
                {recentPrimaryFocuses.map((focus) => (
                  <span key={focus} className="coach-metric-chip">{focus}</span>
                ))}
              </div>
            )}

            {practiceHistoryLoading && <p className="coach-muted">Loading recent attempts...</p>}
            {!practiceHistoryLoading && practiceHistoryError && <p className="coach-error">{practiceHistoryError}</p>}
            {!practiceHistoryLoading && !practiceHistoryError && practiceHistory.length === 0 && (
              <p className="coach-muted">No stored submission history yet for this skill pattern.</p>
            )}
            {!practiceHistoryLoading && practiceHistory.length > 0 && (
              <div className="practice-history-list">
                {practiceHistory.map((entry) => {
                  const multipleChoice = isMultipleChoiceEntry(entry)
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
                            {multipleChoice
                              ? `Multiple Choice · ${entry.generatedCard.difficulty || 'Med.'} · ${(entry.elapsedMs / 1000).toFixed(1)}s`
                              : `${formatTemplateModeLabel(entry.templateMode)} · ${formatSupportLayerLabel(entry.supportLayer)} · ${entry.liveFeedbackCount} live feedback ${entry.liveFeedbackCount === 1 ? 'snapshot' : 'snapshots'} · ${(entry.elapsedMs / 1000).toFixed(1)}s`}
                          </p>
                        </div>
                        <span className={`coach-status-value coach-status-value-${entryTone}`}>
                          {multipleChoice ? (entry.exact ? 'Correct' : 'Missed') : `${entry.accuracy}%`}
                        </span>
                      </div>
                      {multipleChoice && (
                        <div className="practice-history-focuses">
                          {entry.generatedCard.pattern && <span className="coach-metric-chip">{entry.generatedCard.pattern}</span>}
                          <span className="coach-metric-chip">Selected {choiceTextByStoredAnswer(entry, entry.userAnswer)}</span>
                          <span className="coach-metric-chip">Correct {choiceTextByStoredAnswer(entry, entry.correctAnswer)}</span>
                        </div>
                      )}
                      {!multipleChoice && (entry.liveCoachUsed || entry.supportLayer === 'ghost-reps') && (
                        <div className="practice-history-focuses">
                          {entry.liveCoachUsed && <span className="coach-metric-chip">Live coach used</span>}
                          {entry.supportLayer === 'ghost-reps' && <span className="coach-metric-chip">Support Layer Ghost Reps</span>}
                        </div>
                      )}
                      {!multipleChoice && entry.submissionRubric?.verdict && (
                        <div className="practice-history-rubric-strip">
                          <div className="practice-history-rubric-strip-top">
                            <span className="coach-metric-chip">
                              Verdict {entry.submissionRubric.verdict}
                            </span>
                            <span className="coach-metric-chip">
                              Rubric {entry.submissionRubric.score?.overall ?? 0}%
                            </span>
                            {entry.submissionRubric.primaryFailure?.key && entry.submissionRubric.primaryFailure.key !== 'sound' && (
                              <span className="coach-metric-chip">
                                Primary {dimensionLabel(entry.submissionRubric.primaryFailure)}
                              </span>
                            )}
                          </div>
                          <div className="practice-history-dimension-strip">
                            {rubricDimensionsForDisplay(entry.submissionRubric).map((dimension) => (
                              <span
                                key={`${entry.attemptId}-${dimension.key}`}
                                className={`practice-history-dimension-pill practice-history-dimension-pill-${dimension.status}`}
                              >
                                {dimensionLabel(dimension)} {dimension.score ?? 0}%
                              </span>
                            ))}
                          </div>
                          {(entry.submissionRubric.recommendedAction || formatWeakDimension(practiceHistorySummary?.templateModes?.[entry.templateMode]?.dimensionSummary)) && (
                            <p className="practice-history-meta">
                              {entry.submissionRubric.recommendedAction ||
                                `Repair ${formatWeakDimension(practiceHistorySummary?.templateModes?.[entry.templateMode]?.dimensionSummary)} next.`}
                            </p>
                          )}
                        </div>
                      )}
                      <p className="practice-history-question">
                        {entry.question || entry.generatedCard.question || entry.generatedCard.prompt || 'Stored generated question'}
                      </p>
                      <p className="practice-history-feedback">{summarizeHistoryText(entry)}</p>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}
    </div>
  )
}
