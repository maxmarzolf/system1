import type { FlowAttempt, SubmissionModality } from '../practiceFlow'
import { api, unwrap } from '../api/client'
import type { Flashcard, FlowHistoryEntry, FlowHistoryResponse } from './types'

export const compactFeedbackItems = (items: Array<string | undefined>, limit = 4) => {
  const seen = new Set<string>()
  return items
    .map((item) => item?.trim() ?? '')
    .filter((item) => {
      if (!item) return false
      const key = item.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

export const isSubmissionModality = (value: unknown): value is SubmissionModality =>
  value === 'total-recall' || value === 'ghost-rep' || value === 'mcq' || value === 'microdrill'

export const flowEvaluationScore = (evaluation: Record<string, unknown>) => {
  const score = evaluation.score
  const overall = score && typeof score === 'object' ? Number((score as Record<string, unknown>).overall) : 0
  return Number.isFinite(overall) ? Math.max(0, Math.min(100, overall)) : 0
}

export const flowEvaluationWeaknesses = (evaluation: Record<string, unknown>, missedLineCount = 0) => {
  const primaryFailure = evaluation.primaryFailure && typeof evaluation.primaryFailure === 'object'
    ? evaluation.primaryFailure as Record<string, unknown>
    : {}
  const feedback = evaluation.feedback && typeof evaluation.feedback === 'object'
    ? evaluation.feedback as Record<string, unknown>
    : {}
  const errorTags = Array.isArray(feedback.errorTags) ? feedback.errorTags.map(String) : []
  return compactFeedbackItems([
    String(primaryFailure.label ?? primaryFailure.key ?? ''),
    String(feedback.primaryFocus ?? ''),
    ...errorTags,
    missedLineCount > 0 ? `${missedLineCount} missed code line${missedLineCount === 1 ? '' : 's'}` : '',
  ])
}

export const flowModalityWeakness = (modality: SubmissionModality, successful: boolean) => {
  if (successful) return ''
  if (modality === 'mcq') return 'incorrect conceptual choice'
  if (modality === 'microdrill') return 'code reconstruction remained unsound'
  if (modality === 'ghost-rep') return 'targeted recall remained unsound'
  return 'full recall remained unsound'
}

export const flowAttemptFromHistoryEntry = (entry: FlowHistoryEntry, anchorCardId: string): FlowAttempt | null => {
  if (!isSubmissionModality(entry.modality)) return null
  const storedAnchor = String(entry.signals.flow?.anchorCardId ?? entry.cardId ?? '')
  if (storedAnchor !== anchorCardId) return null
  const missedLineCount = Number(entry.signals.modality?.missedLineCount ?? 0)
  return {
    attemptId: entry.attemptId,
    interactionId: entry.interactionId,
    anchorCardId: storedAnchor,
    modality: entry.modality,
    successful: entry.successful,
    score: flowEvaluationScore(entry.signals.evaluation ?? {}),
    elapsedMs: Number(entry.signals.elapsedMs ?? 0),
    missedLineCount: Number.isFinite(missedLineCount) ? Math.max(0, missedLineCount) : 0,
    weaknesses: compactFeedbackItems([
      ...flowEvaluationWeaknesses(entry.signals.evaluation ?? {}, missedLineCount),
      flowModalityWeakness(entry.modality, entry.successful),
    ]),
    question: entry.question,
    createdAt: entry.createdAt,
  }
}

export const requestFlowAttemptHistory = async (anchorCard: Flashcard): Promise<FlowAttempt[]> => {
  const result = await api.POST('/api/coach/history', {
    body: { cardId: anchorCard.id, questionType: '', skillTags: [], limit: 20 },
  })
  const payload = unwrap(result, 'Unable to load flow history') as unknown as FlowHistoryResponse
  return payload.entries
    .map((entry) => flowAttemptFromHistoryEntry(entry, anchorCard.id))
    .filter((entry): entry is FlowAttempt => entry !== null)
    .reverse()
}
