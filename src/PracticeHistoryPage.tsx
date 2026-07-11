import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiUrl } from './api'
import { skillMap } from './data/skill-map'
import GhostRepActivityChart, {
  type GhostRepActivity,
  type GhostRepPatternOrder,
  type GhostRepSpacedRepetition,
} from './GhostRepActivityChart'
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
  spacedRepetition: GhostRepSpacedRepetition
}

const MAIN_RECALL_CLOSE_ENOUGH_ACCURACY = 90

const isMultipleChoiceEntry = (entry: PracticeHistoryEntry) =>
  entry.questionType.startsWith('skill-map-mcq') || entry.generatedCard.cardMode === 'multiple-choice'

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


export default function PracticeHistoryPage() {
  const configuredProviderLabel = useConfiguredProviderLabel()

  const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryEntry[]>([])
  const [practiceHistorySummary, setPracticeHistorySummary] = useState<PracticeHistorySummary | null>(null)
  const [practiceHistoryLoading, setPracticeHistoryLoading] = useState(false)
  const [practiceHistoryError, setPracticeHistoryError] = useState('')
  const [ghostRepOverview, setGhostRepOverview] = useState<SkillMapOverviewForGhostReps | null>(null)
  const [ghostRepOverviewError, setGhostRepOverviewError] = useState('')
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])

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

  const historyPatternOrder = useMemo(() => {
    const canonicalMethods = new Map(skillMap.map(node => [node.pattern, node.methods]))
    return (ghostRepOverview?.patterns ?? []).map(pattern => ({
      ...pattern,
      methods: canonicalMethods.get(pattern.pattern) ?? pattern.methods,
    }))
  }, [ghostRepOverview?.patterns])

  const repeatedWeakDimensions = practiceHistorySummary?.dimensionSummary?.weakDimensions ?? []

  return (
    <div className="app">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} />

      <GhostRepActivityChart
        activity={ghostRepOverview?.ghostRepActivity}
        patternOrder={historyPatternOrder}
        spacedRepetition={ghostRepOverview?.spacedRepetition}
        onSelectionChange={handleSelectionChange}
      />
      {ghostRepOverviewError && <p className="coach-error">{ghostRepOverviewError}</p>}

      {selectedSlugs.length > 0 && (
        <div className="pattern-history-section">
          <div className="pattern-history-header">
            <span className="pattern-history-title">Recent Practice</span>
            {practiceHistorySummary && (
              <>
                <span className="coach-metric-chip">{practiceHistorySummary.attemptCount} attempts</span>
                <span className="coach-metric-chip">Readiness {practiceHistorySummary.readiness}%</span>
                <span className="coach-metric-chip">Avg {practiceHistorySummary.recentAvgAccuracy}%</span>
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
                const entryTone = entry.exact
                  ? 'success'
                  : entry.accuracy >= MAIN_RECALL_CLOSE_ENOUGH_ACCURACY
                    ? 'warning'
                    : 'error'
                const entryDate = new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

                return (
                  <article key={`${entry.attemptId}-${entry.createdAt}`} className="practice-history-entry">
                    <div className="practice-history-entry-top">
                      <p className="practice-history-title">{entry.cardTitle || entry.cardId}</p>
                      <span className={`coach-status-value coach-status-value-${entryTone}`}>
                        {multipleChoice ? (entry.exact ? 'Correct' : 'Missed') : `${entry.accuracy}%`}
                      </span>
                    </div>
                    <p className="practice-history-meta">
                      {entryDate} · {multipleChoice ? 'MCQ' : 'Ghost Rep'} · {(entry.elapsedMs / 1000).toFixed(1)}s
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
