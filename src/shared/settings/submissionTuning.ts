import { storedSetting } from '../lib/storedSetting'

export type SubmissionGradingMode = 'core-logic' | 'balanced' | 'strict'
export type SubmissionContractStrictness = 'light' | 'balanced' | 'strict'

export type SubmissionTuning = {
  gradingMode: SubmissionGradingMode
  contractStrictness: SubmissionContractStrictness
  rewardEquivalentPhrasing: boolean
  requireAnswerStep: boolean
  allowExtraParameters: boolean
  microDrillEnabled: boolean
}

export const SUBMISSION_TUNING_STORAGE_KEY = 'system1-submission-tuning-v1'

export const defaultSubmissionTuning: SubmissionTuning = {
  gradingMode: 'core-logic',
  contractStrictness: 'light',
  rewardEquivalentPhrasing: true,
  requireAnswerStep: true,
  allowExtraParameters: true,
  microDrillEnabled: false,
}

const SUBMISSION_GRADING_MODES: readonly SubmissionGradingMode[] = ['core-logic', 'balanced', 'strict']
const SUBMISSION_CONTRACT_STRICTNESSES: readonly SubmissionContractStrictness[] = ['light', 'balanced', 'strict']

const isSubmissionGradingMode = (value: unknown): value is SubmissionGradingMode =>
  typeof value === 'string' && SUBMISSION_GRADING_MODES.includes(value as SubmissionGradingMode)

const isSubmissionContractStrictness = (value: unknown): value is SubmissionContractStrictness =>
  typeof value === 'string' && SUBMISSION_CONTRACT_STRICTNESSES.includes(value as SubmissionContractStrictness)

export const submissionTuningSetting = storedSetting<SubmissionTuning>(
  SUBMISSION_TUNING_STORAGE_KEY,
  defaultSubmissionTuning,
  (parsed) => ({
    ...defaultSubmissionTuning,
    ...parsed,
    gradingMode: isSubmissionGradingMode(parsed.gradingMode)
      ? parsed.gradingMode
      : defaultSubmissionTuning.gradingMode,
    contractStrictness: isSubmissionContractStrictness(parsed.contractStrictness)
      ? parsed.contractStrictness
      : defaultSubmissionTuning.contractStrictness,
  }),
)

export const loadStoredSubmissionTuning = submissionTuningSetting.load
export const saveStoredSubmissionTuning = submissionTuningSetting.save
