export type LiveCoachTuning = {
  focusMode: 'memorization' | 'interview'
  tone: 'calm' | 'direct' | 'technical'
  singleIssue: boolean
  showPatternNames: boolean
  specificitySource: 'time-only' | 'time-and-quality'
  allowExactEditsWhenStuck: boolean
  canonicalAnswerStage: 'mid' | 'late' | 'very-late'
  affirmationMode: 'stable-only' | 'never'
  driftThresholdAttempts: number
  drillDownEnabled: boolean
  stallThresholdSeconds: number
}

export const LIVE_COACH_TUNING_STORAGE_KEY = 'system1-live-coach-tuning-v1'

export const defaultLiveCoachTuning: LiveCoachTuning = {
  focusMode: 'memorization',
  tone: 'calm',
  singleIssue: true,
  showPatternNames: false,
  specificitySource: 'time-and-quality',
  allowExactEditsWhenStuck: true,
  canonicalAnswerStage: 'late',
  affirmationMode: 'stable-only',
  driftThresholdAttempts: 3,
  drillDownEnabled: true,
  stallThresholdSeconds: 40,
}

export const loadStoredLiveCoachTuning = (): LiveCoachTuning => {
  if (typeof window === 'undefined') return defaultLiveCoachTuning

  try {
    const raw = window.localStorage.getItem(LIVE_COACH_TUNING_STORAGE_KEY)
    if (!raw) return defaultLiveCoachTuning

    const parsed = JSON.parse(raw) as Partial<LiveCoachTuning>
    const driftThresholdAttempts = Number(parsed.driftThresholdAttempts ?? defaultLiveCoachTuning.driftThresholdAttempts)
    const stallThresholdSeconds = Number(parsed.stallThresholdSeconds ?? defaultLiveCoachTuning.stallThresholdSeconds)

    return {
      ...defaultLiveCoachTuning,
      ...parsed,
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
