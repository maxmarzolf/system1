export type SubmissionGradingMode = 'core-logic' | 'balanced' | 'strict'
export type SubmissionContractStrictness = 'light' | 'balanced' | 'strict'

export type SubmissionTuning = {
  gradingMode: SubmissionGradingMode
  contractStrictness: SubmissionContractStrictness
  rewardEquivalentPhrasing: boolean
  requireAnswerStep: boolean
  allowExtraParameters: boolean
}

export const SUBMISSION_TUNING_STORAGE_KEY = 'system1-submission-tuning-v1'

export const defaultSubmissionTuning: SubmissionTuning = {
  gradingMode: 'core-logic',
  contractStrictness: 'light',
  rewardEquivalentPhrasing: true,
  requireAnswerStep: true,
  allowExtraParameters: true,
}

const SUBMISSION_GRADING_MODES: readonly SubmissionGradingMode[] = ['core-logic', 'balanced', 'strict']
const SUBMISSION_CONTRACT_STRICTNESSES: readonly SubmissionContractStrictness[] = ['light', 'balanced', 'strict']

const isSubmissionGradingMode = (value: unknown): value is SubmissionGradingMode =>
  typeof value === 'string' && SUBMISSION_GRADING_MODES.includes(value as SubmissionGradingMode)

const isSubmissionContractStrictness = (value: unknown): value is SubmissionContractStrictness =>
  typeof value === 'string' && SUBMISSION_CONTRACT_STRICTNESSES.includes(value as SubmissionContractStrictness)

export const loadStoredSubmissionTuning = (): SubmissionTuning => {
  if (typeof window === 'undefined') return defaultSubmissionTuning

  try {
    const raw = window.localStorage.getItem(SUBMISSION_TUNING_STORAGE_KEY)
    if (!raw) return defaultSubmissionTuning

    const parsed = JSON.parse(raw) as Partial<SubmissionTuning>
    return {
      ...defaultSubmissionTuning,
      ...parsed,
      gradingMode: isSubmissionGradingMode(parsed.gradingMode)
        ? parsed.gradingMode
        : defaultSubmissionTuning.gradingMode,
      contractStrictness: isSubmissionContractStrictness(parsed.contractStrictness)
        ? parsed.contractStrictness
        : defaultSubmissionTuning.contractStrictness,
    }
  } catch {
    return defaultSubmissionTuning
  }
}

export const saveStoredSubmissionTuning = (tuning: SubmissionTuning) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SUBMISSION_TUNING_STORAGE_KEY, JSON.stringify(tuning))
}
