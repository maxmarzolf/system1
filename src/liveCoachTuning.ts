export type LiveFeedbackFrequency = 'more-often' | 'balanced' | 'less-often'

export type LiveCoachTuning = {
  enabled: boolean
  focusMode: 'memorization' | 'interview'
  tone: 'calm' | 'direct' | 'technical'
  singleIssue: boolean
  showPatternNames: boolean
  specificitySource: 'time-only' | 'time-and-quality'
  feedbackFrequency: LiveFeedbackFrequency
  allowExactEditsWhenStuck: boolean
  canonicalAnswerStage: 'mid' | 'late' | 'very-late'
  affirmationMode: 'stable-only' | 'never'
  driftThresholdAttempts: number
  stallThresholdSeconds: number
}

export const LIVE_COACH_TUNING_STORAGE_KEY = 'system1-live-coach-tuning-v1'

export const defaultLiveCoachTuning: LiveCoachTuning = {
  enabled: true,
  focusMode: 'memorization',
  tone: 'calm',
  singleIssue: true,
  showPatternNames: false,
  specificitySource: 'time-and-quality',
  feedbackFrequency: 'balanced',
  allowExactEditsWhenStuck: true,
  canonicalAnswerStage: 'late',
  affirmationMode: 'stable-only',
  driftThresholdAttempts: 3,
  stallThresholdSeconds: 40,
}

const LIVE_FEEDBACK_FREQUENCIES: readonly LiveFeedbackFrequency[] = ['more-often', 'balanced', 'less-often']

const isLiveFeedbackFrequency = (value: unknown): value is LiveFeedbackFrequency =>
  typeof value === 'string' && LIVE_FEEDBACK_FREQUENCIES.includes(value as LiveFeedbackFrequency)

export const loadStoredLiveCoachTuning = (): LiveCoachTuning => {
  if (typeof window === 'undefined') return defaultLiveCoachTuning

  try {
    const raw = window.localStorage.getItem(LIVE_COACH_TUNING_STORAGE_KEY)
    if (!raw) return defaultLiveCoachTuning

    const parsed = JSON.parse(raw) as Partial<LiveCoachTuning>
    const driftThresholdAttempts = Number(parsed.driftThresholdAttempts ?? defaultLiveCoachTuning.driftThresholdAttempts)
    const stallThresholdSeconds = Number(parsed.stallThresholdSeconds ?? defaultLiveCoachTuning.stallThresholdSeconds)
    const feedbackFrequency = isLiveFeedbackFrequency(parsed.feedbackFrequency)
      ? parsed.feedbackFrequency
      : defaultLiveCoachTuning.feedbackFrequency

    return {
      ...defaultLiveCoachTuning,
      ...parsed,
      feedbackFrequency,
      driftThresholdAttempts: Number.isFinite(driftThresholdAttempts)
        ? driftThresholdAttempts
        : defaultLiveCoachTuning.driftThresholdAttempts,
      stallThresholdSeconds: Number.isFinite(stallThresholdSeconds)
        ? stallThresholdSeconds
        : defaultLiveCoachTuning.stallThresholdSeconds,
    }
  } catch {
    return defaultLiveCoachTuning
  }
}

export const saveStoredLiveCoachTuning = (tuning: LiveCoachTuning) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LIVE_COACH_TUNING_STORAGE_KEY, JSON.stringify(tuning))
}

export const getLiveCoachFrequencyProfile = (frequency: LiveFeedbackFrequency) => {
  switch (frequency) {
    case 'more-often':
      return {
        milestoneCharDelta: 12,
        debounceMs: 550,
        idleRefreshMs: 12_000,
      }
    case 'less-often':
      return {
        milestoneCharDelta: 40,
        debounceMs: 1_350,
        idleRefreshMs: 30_000,
      }
    case 'balanced':
    default:
      return {
        milestoneCharDelta: 24,
        debounceMs: 900,
        idleRefreshMs: 20_000,
      }
  }
}
