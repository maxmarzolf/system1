export const FLOW_STAGES = ['recall', 'ghost', 'multiple-choice', 'microdrill'] as const
export type FlowStage = typeof FLOW_STAGES[number]
export const FLOW_LABELS: Record<FlowStage, string> = {
  recall: 'Recall', ghost: 'Ghost', 'multiple-choice': 'MCQ', microdrill: 'Microdrill',
}

export type SubmissionModality = 'total-recall' | 'ghost-rep' | 'mcq' | 'microdrill'
export const STAGE_MODALITY: Record<FlowStage, SubmissionModality> = {
  recall: 'total-recall', ghost: 'ghost-rep', 'multiple-choice': 'mcq', microdrill: 'microdrill',
}
export const MODALITY_STAGE: Record<SubmissionModality, FlowStage> = {
  'total-recall': 'recall', 'ghost-rep': 'ghost', mcq: 'multiple-choice', microdrill: 'microdrill',
}

export type FlowBlock = { stage: FlowStage; count: number }
export type FlowConfig = { mode: 'adaptive' | 'custom' | 'random'; blocks: FlowBlock[]; randomStages: FlowStage[] }
export type FlowAttempt = {
  attemptId?: number | null
  interactionId?: string
  anchorCardId: string
  modality: SubmissionModality
  successful: boolean
  score: number
  elapsedMs: number
  missedLineCount: number
  weaknesses: string[]
  question: string
  createdAt?: string
}
export type FlowPhase = 'establish' | 'remediate' | 'consolidate' | 'challenge' | 'mastered'
export type FlowModalitySummary = { attempts: number; successes: number; latestScore: number; bestScore: number }
export type FlowMasterySummary = {
  phase: FlowPhase
  proficiency: number
  mastered: boolean
  recentAverage: number
  consecutiveSuccesses: number
  successfulModalities: number
  weaknesses: string[]
  modality: Record<SubmissionModality, FlowModalitySummary>
}
export type FlowGenerationContext = {
  phase: FlowPhase
  proficiency: number
  weaknessSummary: string
  recentAttempts: Array<{
    modality: SubmissionModality
    successful: boolean
    score: number
    weakness: string
    question: string
  }>
}

export const DEFAULT_FLOW: FlowConfig = {
  mode: 'adaptive',
  blocks: [{ stage: 'recall', count: 1 }, { stage: 'ghost', count: 2 }, { stage: 'multiple-choice', count: 1 }, { stage: 'microdrill', count: 1 }],
  randomStages: [...FLOW_STAGES],
}
const STORAGE_KEY = 'practice-flow-v1'
const MODALITIES = Object.values(STAGE_MODALITY) as SubmissionModality[]

const boundedScore = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
const emptyModalitySummary = (): Record<SubmissionModality, FlowModalitySummary> => ({
  'total-recall': { attempts: 0, successes: 0, latestScore: 0, bestScore: 0 },
  'ghost-rep': { attempts: 0, successes: 0, latestScore: 0, bestScore: 0 },
  mcq: { attempts: 0, successes: 0, latestScore: 0, bestScore: 0 },
  microdrill: { attempts: 0, successes: 0, latestScore: 0, bestScore: 0 },
})

export const expandFlow = (blocks: FlowBlock[]): FlowStage[] => blocks.flatMap(({ stage, count }) => Array.from({ length: count }, () => stage))
export const pickRandomStage = (stages: FlowStage[], random = Math.random): FlowStage => stages[Math.min(stages.length - 1, Math.floor(random() * stages.length))] ?? 'recall'

export function summarizeFlowMastery(history: FlowAttempt[]): FlowMasterySummary {
  const recent = history.slice(-8)
  const modality = emptyModalitySummary()
  recent.forEach((attempt) => {
    const bucket = modality[attempt.modality]
    const score = boundedScore(attempt.score)
    bucket.attempts += 1
    bucket.successes += attempt.successful ? 1 : 0
    bucket.latestScore = score
    bucket.bestScore = Math.max(bucket.bestScore, score)
  })
  const outcomeWindow = recent.slice(-4)
  const recentAverage = outcomeWindow.length
    ? outcomeWindow.reduce((sum, attempt) => sum + boundedScore(attempt.score), 0) / outcomeWindow.length
    : 0
  let consecutiveSuccesses = 0
  for (let index = recent.length - 1; index >= 0 && recent[index].successful; index -= 1) consecutiveSuccesses += 1
  const successfulModalities = MODALITIES.filter((name) => modality[name].successes > 0).length
  const latestRecall = [...recent].reverse().find((attempt) => attempt.modality === 'total-recall')
  const weaknessCounts = new Map<string, number>()
  ;[...recent].reverse().forEach((attempt) => attempt.weaknesses.forEach((weakness) => {
    const normalized = weakness.trim()
    if (normalized) weaknessCounts.set(normalized, (weaknessCounts.get(normalized) ?? 0) + 1)
  }))
  const weaknesses = [...weaknessCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([weakness]) => weakness)

  const coverageScore = successfulModalities / MODALITIES.length
  const streakScore = Math.min(consecutiveSuccesses, 3) / 3
  const proficiency = Math.round(Math.min(100, recentAverage * 0.55 + coverageScore * 25 + streakScore * 20))
  const proficient = recent.length >= 4
    && recentAverage >= 80
    && consecutiveSuccesses >= 2
    && successfulModalities >= 3
    && Boolean(latestRecall?.successful)
  const mastered = recent.length >= 6
    && recentAverage >= 88
    && consecutiveSuccesses >= 3
    && modality['total-recall'].successes > 0
    && modality.mcq.successes > 0
    && modality.microdrill.successes > 0
    && Boolean(latestRecall?.successful && latestRecall.score >= 85)
  const latest = recent[recent.length - 1]
  const phase: FlowPhase = mastered
    ? 'mastered'
    : latest && (!latest.successful || latest.score < 65 || latest.missedLineCount > 0)
      ? 'remediate'
      : proficient
        ? 'challenge'
        : recent.length < 2
          ? 'establish'
          : 'consolidate'

  return {
    phase,
    proficiency,
    mastered,
    recentAverage: Math.round(recentAverage * 10) / 10,
    consecutiveSuccesses,
    successfulModalities,
    weaknesses,
    modality,
  }
}

export function buildFlowGenerationContext(history: FlowAttempt[]): FlowGenerationContext {
  const summary = summarizeFlowMastery(history)
  return {
    phase: summary.phase,
    proficiency: summary.proficiency,
    weaknessSummary: summary.weaknesses.join('; '),
    recentAttempts: history.slice(-6).reverse().map((attempt) => ({
      modality: attempt.modality,
      successful: attempt.successful,
      score: boundedScore(attempt.score),
      weakness: attempt.weaknesses[0] ?? '',
      question: attempt.question.slice(0, 240),
    })),
  }
}

export function mergeFlowAttempts(current: FlowAttempt[], incoming: FlowAttempt[]): FlowAttempt[] {
  const merged = [...current]
  incoming.forEach((attempt) => {
    const key = attempt.attemptId ? `attempt:${attempt.attemptId}` : attempt.interactionId ? `interaction:${attempt.interactionId}` : ''
    const existingIndex = key
      ? merged.findIndex((candidate) => (candidate.attemptId ? `attempt:${candidate.attemptId}` : candidate.interactionId ? `interaction:${candidate.interactionId}` : '') === key)
      : -1
    if (existingIndex >= 0) merged[existingIndex] = attempt
    else merged.push(attempt)
  })
  return merged.slice(-40)
}

export function adaptiveNextFlowStep(history: FlowAttempt[], step: number): { stage: FlowStage; cycle: number } {
  const summary = summarizeFlowMastery(history)
  const cycle = Math.floor(step / FLOW_STAGES.length) + 1
  if (history.length === 0) return { stage: 'recall', cycle }

  const latest = history[history.length - 1]
  if (!latest.successful || latest.score < 65 || latest.missedLineCount > 0) {
    const remediation: Record<SubmissionModality, FlowStage> = {
      'total-recall': 'ghost',
      'ghost-rep': 'microdrill',
      mcq: 'microdrill',
      microdrill: 'recall',
    }
    return { stage: remediation[latest.modality], cycle }
  }

  const unproven = (['mcq', 'microdrill', 'total-recall'] as SubmissionModality[])
    .find((modality) => summary.modality[modality].successes === 0)
  if (unproven) return { stage: MODALITY_STAGE[unproven], cycle }

  const progression: Record<SubmissionModality, FlowStage> = {
    'total-recall': 'multiple-choice',
    'ghost-rep': 'multiple-choice',
    mcq: 'microdrill',
    microdrill: summary.phase === 'challenge' ? 'multiple-choice' : 'recall',
  }
  return { stage: progression[latest.modality], cycle }
}

export function loadFlowConfig(): FlowConfig {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!value || !['adaptive', 'custom', 'random'].includes(value.mode)) return DEFAULT_FLOW
    const blocks = Array.isArray(value.blocks) ? value.blocks.filter((b: FlowBlock) => b && FLOW_STAGES.includes(b.stage) && Number.isInteger(b.count) && b.count >= 1 && b.count <= 20).slice(0, 20) : []
    const randomStages = FLOW_STAGES.filter(stage => value.randomStages?.includes(stage))
    if ((value.mode === 'custom' && blocks.length === 0) || (value.mode === 'random' && randomStages.length === 0)) return DEFAULT_FLOW
    return { mode: value.mode, blocks: blocks.length ? blocks : DEFAULT_FLOW.blocks, randomStages: randomStages.length ? randomStages : [...FLOW_STAGES] }
  } catch { return DEFAULT_FLOW }
}
export function saveFlowConfig(config: FlowConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)) } catch { /* Flow remains usable without storage. */ }
}
export function nextFlowStep(config: FlowConfig, step: number, random = Math.random, history: FlowAttempt[] = []) {
  if (config.mode === 'adaptive') return adaptiveNextFlowStep(history, step)
  const sequence = expandFlow(config.blocks)
  return {
    stage: config.mode === 'random' ? pickRandomStage(config.randomStages, random) : sequence[step % sequence.length] ?? 'recall',
    cycle: config.mode === 'random' ? 1 : Math.floor(step / Math.max(sequence.length, 1)) + 1,
  }
}
