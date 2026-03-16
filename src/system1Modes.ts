export type System1Mode =
  | 'snap-classify'
  | 'template-hunt'
  | 'gut-check'
  | 'no-go-trap'
  | 'near-miss-duel'

export type CardBand = 'weak' | 'medium' | 'strong'

export type CardProgress = {
  strength: number
  fastCorrectDays: string[]
  automatic: boolean
  dueByMode: Partial<Record<System1Mode, string>>
}

export type AttemptInput = {
  mode: System1Mode
  correct: boolean
  elapsedMs: number
  confidence?: number
  falseAlarm?: boolean
  secondTry?: boolean
}

export type AttemptOutcome = {
  pointsDelta: number
  nextStrength: number
  nextDueIso: string
  automaticityIndex: number
  wasFastCorrect: boolean
}

export const SYSTEM1_MODE_ORDER: System1Mode[] = [
  'snap-classify',
  'template-hunt',
  'gut-check',
  'no-go-trap',
  'near-miss-duel',
]

export const modeShortLabel = (mode: System1Mode): string =>
  mode === 'snap-classify'
    ? 'Snap'
    : mode === 'template-hunt'
      ? 'Template'
      : mode === 'gut-check'
        ? 'Gut'
        : mode === 'no-go-trap'
          ? 'No-Go'
          : 'Duel'

export const modeTitle = (mode: System1Mode): string =>
  mode === 'snap-classify'
    ? 'Snap Classify'
    : mode === 'template-hunt'
      ? 'Template Hunt'
      : mode === 'gut-check'
        ? 'Gut Check'
        : mode === 'no-go-trap'
          ? 'No-Go Trap'
          : 'Near-Miss Duel'

export const modeDescription = (mode: System1Mode): string =>
  mode === 'snap-classify'
    ? 'Fast classification. Reward quick accurate picks.'
    : mode === 'template-hunt'
      ? 'Find the matching structure. One retry allowed.'
      : mode === 'gut-check'
        ? 'Calibrate confidence with instant feedback.'
        : mode === 'no-go-trap'
          ? 'Respond only to true targets. Penalize impulse taps.'
          : 'Pick between highly similar options under time pressure.'

const speedTargetByMode: Record<System1Mode, number> = {
  'snap-classify': 2000,
  'template-hunt': 3000,
  'gut-check': 2500,
  'no-go-trap': 1800,
  'near-miss-duel': 4000,
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const cardBand = (progress?: CardProgress): CardBand => {
  const strength = progress?.strength ?? 45
  if (strength < 40) return 'weak'
  if (strength < 75) return 'medium'
  return 'strong'
}

export const isDueForMode = (progress: CardProgress | undefined, mode: System1Mode, nowMs: number): boolean => {
  const due = progress?.dueByMode?.[mode]
  if (!due) return true
  return new Date(due).getTime() <= nowMs
}

export const defaultCardProgress = (): CardProgress => ({
  strength: 45,
  fastCorrectDays: [],
  automatic: false,
  dueByMode: {},
})

export const scoreAttempt = (
  progress: CardProgress | undefined,
  input: AttemptInput,
  now: Date
): AttemptOutcome => {
  const prev = progress ?? defaultCardProgress()
  const speedTarget = speedTargetByMode[input.mode]
  const fast = input.correct && input.elapsedMs <= speedTarget
  const speedFactor = clamp(speedTarget / Math.max(input.elapsedMs, 1), 0, 1)

  let pointsDelta = 0
  if (input.mode === 'snap-classify') {
    pointsDelta = input.correct ? (fast ? 2 : 1) : -1
  } else if (input.mode === 'template-hunt') {
    pointsDelta = input.correct ? (input.secondTry ? 1 : 3) : 0
    if (!input.correct) pointsDelta = -1
  } else if (input.mode === 'gut-check') {
    const confidence = clamp(input.confidence ?? 0.5, 0.5, 0.95)
    const calibration = 1 - Math.abs((input.correct ? 1 : 0) - confidence)
    pointsDelta = Math.round((input.correct ? 2 : -2) + calibration * 2)
  } else if (input.mode === 'no-go-trap') {
    if (input.correct) pointsDelta = 2
    else if (input.falseAlarm) pointsDelta = -2
    else pointsDelta = -1
  } else {
    pointsDelta = input.correct ? (input.elapsedMs < 4000 ? 3 : 2) : -2
  }

  let strengthDelta = pointsDelta * 3
  if (input.mode === 'gut-check' && input.confidence !== undefined) {
    const calibration = 1 - Math.abs((input.correct ? 1 : 0) - input.confidence)
    strengthDelta += Math.round((calibration - 0.5) * 8)
  }
  if (input.mode === 'no-go-trap' && input.falseAlarm) {
    strengthDelta -= 4
  }
  const nextStrength = clamp(prev.strength + strengthDelta, 0, 100)

  const dueDays = nextDueDays(input.mode, input.correct, nextStrength)
  const nextDue = new Date(now)
  nextDue.setDate(nextDue.getDate() + dueDays)

  const controlFactor =
    input.mode === 'gut-check'
      ? clamp(1 - Math.abs((input.correct ? 1 : 0) - (input.confidence ?? 0.5)), 0.35, 1)
      : input.mode === 'no-go-trap' && input.falseAlarm
        ? 0.45
        : 1
  const accuracyFactor = input.correct ? 1 : 0.45
  const automaticityIndex = Math.round(100 * accuracyFactor * speedFactor * controlFactor)

  return {
    pointsDelta,
    nextStrength,
    nextDueIso: nextDue.toISOString(),
    automaticityIndex,
    wasFastCorrect: fast,
  }
}

function nextDueDays(mode: System1Mode, correct: boolean, strength: number): number {
  if (!correct) {
    if (mode === 'snap-classify') return 0
    if (mode === 'template-hunt') return 1
    if (mode === 'gut-check') return 0
    if (mode === 'no-go-trap') return 0
    return 1
  }

  if (mode === 'snap-classify') {
    if (strength >= 85) return 14
    if (strength >= 70) return 7
    if (strength >= 50) return 3
    return 1
  }
  if (mode === 'template-hunt') {
    if (strength >= 80) return 12
    if (strength >= 60) return 6
    return 2
  }
  if (mode === 'gut-check') {
    if (strength >= 80) return 7
    if (strength >= 55) return 3
    return 1
  }
  if (mode === 'no-go-trap') {
    if (strength >= 80) return 7
    if (strength >= 55) return 3
    return 1
  }
  if (strength >= 85) return 21
  if (strength >= 70) return 10
  if (strength >= 50) return 4
  return 1
}

export const updateAutomaticity = (
  progress: CardProgress,
  wasFastCorrect: boolean,
  now: Date
): CardProgress => {
  if (!wasFastCorrect) return progress
  const dayKey = now.toISOString().slice(0, 10)
  const days = progress.fastCorrectDays.includes(dayKey)
    ? progress.fastCorrectDays
    : [...progress.fastCorrectDays, dayKey]
  return {
    ...progress,
    fastCorrectDays: days.slice(-10),
    automatic: days.length >= 3,
  }
}

export const cardSelectionWeight = (
  progress: CardProgress | undefined,
  mode: System1Mode,
  nowMs: number
): number => {
  const band = cardBand(progress)
  const due = isDueForMode(progress, mode, nowMs)
  const automaticPenalty = progress?.automatic ? 0.35 : 1

  let bandWeight = 1
  if (band === 'weak') bandWeight = 6
  else if (band === 'medium') bandWeight = 3
  else bandWeight = 1

  const dueWeight = due ? 1.3 : 0.2
  return bandWeight * dueWeight * automaticPenalty
}
