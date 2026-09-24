import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from './api'
import DailyWorkHistory, {
  type DailyWorkActivity,
  type DailyWorkAlgorithm,
} from './DailyWorkHistory'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'

type PracticeHistoryEntry = {
  attemptId: number
  sessionId: string
  interactionId: string
  cardId: string
  cardTitle: string
  question: string
  questionType: string
  correctAnswer: string
  userAnswer: string
  successful: boolean
  signals: {
    elapsedMs: number
    evaluation: SubmissionEvaluation
    flow?: Record<string, unknown>
    modality?: Record<string, unknown>
  }
  templateMode: string
  supportLayer: 'none' | 'ghost-reps'
  modality?: 'total-recall' | 'ghost-rep' | 'mcq' | 'microdrill'
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

type SubmissionEvaluation = SubmissionRubric & {
  version?: number
  feedback?: {
    fullFeedback?: string
    diagnosis?: string
    primaryFocus?: string
  }
  provenance?: {
    llmUsed?: boolean
    provider?: string
    source?: string
  }
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
  successRate: number
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

type SkillMapOverview = {
  algorithms: DailyWorkAlgorithm[]
  ghostRepActivity: DailyWorkActivity
}

const isMultipleChoiceEntry = (entry: PracticeHistoryEntry) =>
  entry.modality === 'mcq' || entry.questionType.startsWith('skill-map-mcq') || entry.generatedCard.cardMode === 'multiple-choice'

const modalityLabel = (entry: PracticeHistoryEntry) => {
  if (entry.modality === 'microdrill') return 'Microdrill'
  if (entry.modality === 'mcq' || isMultipleChoiceEntry(entry)) return 'MCQ'
  if (entry.modality === 'ghost-rep' || entry.supportLayer === 'ghost-reps') return 'Ghost Rep'
  return 'Total Recall'
}

const summarizeHistoryText = (entry: PracticeHistoryEntry) => {
  if (isMultipleChoiceEntry(entry)) {
    return entry.generatedCard.explanation?.trim() || 'Multiple choice result saved.'
  }

  const submissionSummary =
    entry.signals.evaluation.feedback?.fullFeedback ||
    entry.signals.evaluation.feedback?.diagnosis ||
    entry.signals.evaluation.feedback?.primaryFocus ||
    ''
  if (submissionSummary.trim()) return submissionSummary.trim()
  return 'No stored feedback yet for this submission.'
}

const dimensionLabel = (dimension?: { key?: string; label?: string }) =>
  dimension?.label?.trim() || dimension?.key?.replace(/_/g, ' ') || ''


export default function PracticeHistoryPage() {
  const configuredProviderLabel = useConfiguredProviderLabel()

  const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryEntry[]>([])
  const [practiceHistorySummary, setPracticeHistorySummary] = useState<PracticeHistorySummary | null>(null)
  const [practiceHistoryLoading, setPracticeHistoryLoading] = useState(false)
  const [practiceHistoryError, setPracticeHistoryError] = useState('')
  const [skillMapOverview, setSkillMapOverview] = useState<SkillMapOverview | null>(null)
  const [skillMapOverviewError, setSkillMapOverviewError] = useState('')
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])

  useEffect(() => {
    const loadSkillMapOverview = async () => {
      setSkillMapOverviewError('')
      try {
        const response = await fetch(apiUrl('/api/skill-map-overview'))
        if (!response.ok) throw new Error('Unable to load skill map overview')
        const payload = (await response.json()) as SkillMapOverview
        setSkillMapOverview(payload)
      } catch {
        setSkillMapOverview(null)
        setSkillMapOverviewError('Daily work history is unavailable right now.')
      }
    }

    void loadSkillMapOverview()
  }, [])

  useEffect(() => {
    if (selectedSlugs.length === 0) {
      setPracticeHistory([])
      setPracticeHistorySummary(null)
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
            cardId: '',
            questionType: 'skill-map',
            skillTags: selectedSlugs,
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
  }, [selectedSlugs])

  const handleSelectionChange = useCallback((slugs: string[]) => {
    setSelectedSlugs(slugs)
  }, [])

  const repeatedWeakDimensions = practiceHistorySummary?.dimensionSummary?.weakDimensions ?? []

  return (
    <div className="app">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} />

      <DailyWorkHistory
        activity={skillMapOverview?.ghostRepActivity}
        algorithmOrder={skillMapOverview?.algorithms ?? []}
        onSelectionChange={handleSelectionChange}
      />
      {skillMapOverviewError && <p className="coach-error">{skillMapOverviewError}</p>}

      {selectedSlugs.length > 0 && (
        <div className="pattern-history-section">
          <div className="pattern-history-header">
            <span className="pattern-history-title">Recent Practice</span>
            {practiceHistorySummary && (
              <>
                <span className="coach-metric-chip">{practiceHistorySummary.attemptCount} attempts</span>
                <span className="coach-metric-chip">Readiness {practiceHistorySummary.readiness}%</span>
                <span className="coach-metric-chip">Success {practiceHistorySummary.successRate}%</span>
                {repeatedWeakDimensions.length > 0 && (
                  <span className="coach-metric-chip">Weak: {dimensionLabel(repeatedWeakDimensions[0])} {repeatedWeakDimensions[0].avgScore ?? 0}%</span>
                )}
              </>
            )}
          </div>

          {practiceHistoryLoading && <p className="coach-muted">Loading recent attempts...</p>}
          {!practiceHistoryLoading && practiceHistoryError && <p className="coach-error">{practiceHistoryError}</p>}
          {!practiceHistoryLoading && !practiceHistoryError && practiceHistory.length === 0 && (
            <p className="coach-muted">No stored submission history yet for this skill pattern.</p>
          )}

          {!practiceHistoryLoading && practiceHistory.length > 0 && (
            <div className="practice-history-list">
              {practiceHistory.map((entry) => {
                const multipleChoice = isMultipleChoiceEntry(entry)
                const entryTone = entry.successful ? 'success' : 'error'
                const entryDate = new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

                return (
                  <article key={`${entry.attemptId}-${entry.createdAt}`} className="practice-history-entry">
                    <div className="practice-history-entry-top">
                      <p className="practice-history-title">{entry.cardTitle || entry.cardId}</p>
                      <span className={`coach-status-value coach-status-value-${entryTone}`}>
                        {multipleChoice ? (entry.successful ? 'Correct' : 'Missed') : (entry.successful ? 'Sound' : 'Needs work')}
                      </span>
                    </div>
                    <p className="practice-history-meta">
                      {entryDate} · {modalityLabel(entry)} · {(entry.signals.elapsedMs / 1000).toFixed(1)}s
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
