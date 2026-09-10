export const FLOW_STAGES = ['recall', 'ghost', 'multiple-choice', 'microdrill'] as const
export type FlowStage = typeof FLOW_STAGES[number]
export const FLOW_LABELS: Record<FlowStage, string> = {
  recall: 'Recall', ghost: 'Ghost', 'multiple-choice': 'MCQ', microdrill: 'Microdrill',
}
export type FlowBlock = { stage: FlowStage; count: number }
export type FlowConfig = { mode: 'custom' | 'random'; blocks: FlowBlock[]; randomStages: FlowStage[] }
export const DEFAULT_FLOW: FlowConfig = {
  mode: 'custom',
  blocks: [{ stage: 'recall', count: 1 }, { stage: 'ghost', count: 2 }, { stage: 'multiple-choice', count: 1 }, { stage: 'microdrill', count: 1 }],
  randomStages: [...FLOW_STAGES],
}
const STORAGE_KEY = 'practice-flow-v1'
export const expandFlow = (blocks: FlowBlock[]): FlowStage[] => blocks.flatMap(({ stage, count }) => Array.from({ length: count }, () => stage))
export const pickRandomStage = (stages: FlowStage[], random = Math.random): FlowStage => stages[Math.min(stages.length - 1, Math.floor(random() * stages.length))] ?? 'recall'
export function loadFlowConfig(): FlowConfig {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!value || !['custom', 'random'].includes(value.mode)) return DEFAULT_FLOW
    const blocks = Array.isArray(value.blocks) ? value.blocks.filter((b: FlowBlock) => b && FLOW_STAGES.includes(b.stage) && Number.isInteger(b.count) && b.count >= 1 && b.count <= 20).slice(0, 20) : []
    const randomStages = FLOW_STAGES.filter(stage => value.randomStages?.includes(stage))
    return { mode: value.mode, blocks: blocks.length ? blocks : DEFAULT_FLOW.blocks, randomStages: randomStages.length ? randomStages : [...FLOW_STAGES] }
  } catch { return DEFAULT_FLOW }
}
export function saveFlowConfig(config: FlowConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)) } catch { /* Flow remains usable without storage. */ }
}
export function nextFlowStep(config: FlowConfig, step: number, random = Math.random) {
  const sequence = expandFlow(config.blocks)
  return {
    stage: config.mode === 'random' ? pickRandomStage(config.randomStages, random) : sequence[step % sequence.length] ?? 'recall',
    cycle: config.mode === 'random' ? 1 : Math.floor(step / Math.max(sequence.length, 1)) + 1,
  }
}
