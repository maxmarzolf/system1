import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FLOW,
  adaptiveNextFlowStep,
  buildFlowGenerationContext,
  buildFlowTransitionCopy,
  expandFlow,
  loadFlowConfig,
  mergeFlowAttempts,
  nextFlowStep,
  pickRandomStage,
  saveFlowConfig,
  summarizeFlowMastery,
  type FlowAttempt,
  type SubmissionModality,
} from './practiceFlow'

const attempt = (modality: SubmissionModality, overrides: Partial<FlowAttempt> = {}): FlowAttempt => ({
  anchorCardId: 'card',
  modality,
  successful: true,
  score: 95,
  elapsedMs: 1000,
  missedLineCount: 0,
  weaknesses: [],
  question: 'q',
  ...overrides,
})

const masteredHistory = (): FlowAttempt[] => [
  attempt('total-recall'),
  attempt('ghost-rep'),
  attempt('mcq'),
  attempt('microdrill'),
  attempt('mcq'),
  attempt('total-recall', { score: 98 }),
]

describe('flow sequencing', () => {
  it('expands blocks and picks random stages within bounds', () => {
    expect(expandFlow([{ stage: 'recall', count: 2 }, { stage: 'ghost', count: 1 }])).toEqual(['recall', 'recall', 'ghost'])
    expect(pickRandomStage(['recall', 'ghost'], () => 0.99)).toBe('ghost')
    expect(pickRandomStage(['recall', 'ghost'], () => 1)).toBe('ghost')
    expect(pickRandomStage([], () => 0)).toBe('recall')
  })

  it('walks custom sequences in cycles and random mode by chance', () => {
    const custom = { mode: 'custom' as const, blocks: [{ stage: 'ghost' as const, count: 2 }], randomStages: [] }
    expect(nextFlowStep(custom, 0)).toEqual({ stage: 'ghost', cycle: 1 })
    expect(nextFlowStep(custom, 2)).toEqual({ stage: 'ghost', cycle: 2 })
    const random = { mode: 'random' as const, blocks: [], randomStages: ['microdrill' as const] }
    expect(nextFlowStep(random, 5, () => 0)).toEqual({ stage: 'microdrill', cycle: 1 })
    const empty = { mode: 'custom' as const, blocks: [], randomStages: [] }
    expect(nextFlowStep(empty, 0)).toEqual({ stage: 'recall', cycle: 1 })
  })

  it('starts adaptive flows with recall and remediates misses', () => {
    expect(nextFlowStep(DEFAULT_FLOW, 0)).toEqual({ stage: 'recall', cycle: 1 })
    expect(adaptiveNextFlowStep([attempt('total-recall', { successful: false })], 1).stage).toBe('ghost')
    expect(adaptiveNextFlowStep([attempt('ghost-rep', { score: 40 })], 1).stage).toBe('microdrill')
    expect(adaptiveNextFlowStep([attempt('mcq', { missedLineCount: 2 })], 1).stage).toBe('microdrill')
    expect(adaptiveNextFlowStep([attempt('microdrill', { successful: false })], 1).stage).toBe('recall')
  })

  it('proves unproven modalities before progressing', () => {
    expect(adaptiveNextFlowStep([attempt('total-recall')], 1).stage).toBe('multiple-choice')
    expect(adaptiveNextFlowStep([attempt('total-recall'), attempt('mcq')], 2).stage).toBe('microdrill')
    const proven = [attempt('total-recall'), attempt('mcq'), attempt('microdrill')]
    expect(adaptiveNextFlowStep(proven, 3).stage).toBe('recall')
    expect(adaptiveNextFlowStep([...proven, attempt('ghost-rep')], 4)).toEqual({ stage: 'multiple-choice', cycle: 2 })
    expect(adaptiveNextFlowStep([...proven, attempt('mcq')], 4).stage).toBe('microdrill')
    expect(adaptiveNextFlowStep([...proven, attempt('total-recall')], 4).stage).toBe('multiple-choice')
  })

  it('keeps challenging a proficient learner after a microdrill', () => {
    const proficient = [attempt('total-recall'), attempt('mcq'), attempt('total-recall', { score: 90 }), attempt('microdrill', { score: 80 })]
    expect(summarizeFlowMastery(proficient).phase).toBe('challenge')
    expect(adaptiveNextFlowStep(proficient, 4).stage).toBe('multiple-choice')
  })
})

describe('mastery summary', () => {
  it('is empty and establishing with no history', () => {
    const summary = summarizeFlowMastery([])
    expect(summary).toMatchObject({ phase: 'establish', proficiency: 0, mastered: false, recentAverage: 0 })
  })

  it('reaches mastery with broad, strong, recent success', () => {
    const summary = summarizeFlowMastery(masteredHistory())
    expect(summary.phase).toBe('mastered')
    expect(summary.mastered).toBe(true)
    expect(summary.consecutiveSuccesses).toBe(6)
    expect(summary.successfulModalities).toBe(4)
    expect(summary.modality.mcq).toEqual({ attempts: 2, successes: 2, latestScore: 95, bestScore: 95 })
  })

  it('remediates after a weak latest attempt and ranks weaknesses', () => {
    const history = [
      attempt('total-recall', { weaknesses: ['bounds', ' '] }),
      attempt('mcq', { weaknesses: ['bounds', 'loop'] }),
      attempt('microdrill', { successful: false, score: Number.NaN, weaknesses: ['loop', 'bounds'] }),
    ]
    const summary = summarizeFlowMastery(history)
    expect(summary.phase).toBe('remediate')
    expect(summary.weaknesses).toEqual(['bounds', 'loop'])
    expect(summary.modality.microdrill.latestScore).toBe(0)
  })

  it('consolidates when steady but not yet proficient', () => {
    expect(summarizeFlowMastery([attempt('total-recall', { score: 70 }), attempt('ghost-rep', { score: 70 })]).phase).toBe('consolidate')
  })

  it('builds generation context from the most recent attempts', () => {
    const history = Array.from({ length: 8 }, (_, index) =>
      attempt('mcq', { question: `${index}`.repeat(300), score: 150, weaknesses: index === 7 ? ['edge'] : [] }),
    )
    const context = buildFlowGenerationContext(history)
    expect(context.recentAttempts).toHaveLength(6)
    expect(context.recentAttempts[0]).toMatchObject({ score: 100, weakness: 'edge' })
    expect(context.recentAttempts[0].question).toHaveLength(240)
    expect(context.weaknessSummary).toBe('edge')
  })
})

describe('merging attempts', () => {
  it('replaces attempts by id or interaction and caps the history', () => {
    const merged = mergeFlowAttempts(
      [attempt('mcq', { attemptId: 1, score: 10 }), attempt('mcq', { interactionId: 'i', score: 10 })],
      [attempt('mcq', { attemptId: 1, score: 99 }), attempt('mcq', { interactionId: 'i', score: 88 }), attempt('mcq')],
    )
    expect(merged.map((item) => item.score)).toEqual([99, 88, 95])
    const many = Array.from({ length: 45 }, (_, index) => attempt('mcq', { attemptId: index + 1 }))
    expect(mergeFlowAttempts([], many)).toHaveLength(40)
  })
})

describe('transition copy', () => {
  it('covers the first step, a new anchor and configured flows', () => {
    expect(buildFlowTransitionCopy({ fromStage: null, toStage: 'recall', mode: 'adaptive' }).headline).toBe('Establish a clean baseline')
    expect(buildFlowTransitionCopy({ fromStage: null, toStage: 'ghost', mode: 'adaptive' }).headline).toBe('Begin with Ghost')
    expect(buildFlowTransitionCopy({ fromStage: 'mcq' as never, toStage: 'recall', mode: 'adaptive', newAnchor: true }).headline)
      .toBe('Move to the next pattern')
    expect(buildFlowTransitionCopy({ fromStage: 'recall', toStage: 'ghost', mode: 'custom' }).detail).toContain('Total Recall is complete')
  })

  it('explains each adaptive move', () => {
    const copy = (toStage: 'ghost' | 'multiple-choice' | 'microdrill' | 'recall', latestAttempt?: FlowAttempt) =>
      buildFlowTransitionCopy({ fromStage: 'recall', toStage, mode: 'adaptive', latestAttempt }).headline
    expect(copy('ghost')).toBe('Reinforce the missed steps')
    expect(copy('multiple-choice', attempt('total-recall'))).toBe('Check the decision')
    expect(buildFlowTransitionCopy({ fromStage: 'recall', toStage: 'multiple-choice', mode: 'adaptive' }).detail)
      .toContain('before returning')
    expect(copy('microdrill')).toBe('Turn feedback into code')
    expect(copy('recall')).toBe('Return to independent recall')
  })
})

describe('stored flow config', () => {
  it('round-trips a valid config', () => {
    const config = { mode: 'custom' as const, blocks: [{ stage: 'mcq' as never, count: 1 }, { stage: 'ghost' as const, count: 3 }], randomStages: [] }
    saveFlowConfig(config)
    expect(loadFlowConfig()).toEqual({ mode: 'custom', blocks: [{ stage: 'ghost', count: 3 }], randomStages: expect.any(Array) })
  })

  it.each([
    ['nothing stored', null],
    ['bad json', '{'],
    ['unknown mode', JSON.stringify({ mode: 'chaos' })],
    ['custom with no blocks', JSON.stringify({ mode: 'custom', blocks: [] })],
    ['random with no stages', JSON.stringify({ mode: 'random', randomStages: ['nope'] })],
  ])('falls back to the default for %s', (_name, raw) => {
    if (raw !== null) localStorage.setItem('practice-flow-v1', raw)
    expect(loadFlowConfig()).toBe(DEFAULT_FLOW)
  })

  it('fills in defaults for a random config without blocks', () => {
    localStorage.setItem('practice-flow-v1', JSON.stringify({ mode: 'random', randomStages: ['ghost'] }))
    expect(loadFlowConfig()).toEqual({ mode: 'random', blocks: DEFAULT_FLOW.blocks, randomStages: ['ghost'] })
  })
})

// Scenarios carried over from the retired tests/practice-flow.test.mjs (node:test).
describe('flow scenarios', () => {
  it('custom flows preserve quantities and order across cycles', () => {
    const config = {
      mode: 'custom' as const,
      blocks: [
        { stage: 'ghost' as const, count: 2 },
        { stage: 'multiple-choice' as const, count: 1 },
        { stage: 'microdrill' as const, count: 3 },
        { stage: 'recall' as const, count: 2 },
      ],
      randomStages: [],
    }
    expect(Array.from({ length: 9 }, (_, index) => nextFlowStep(config, index).stage)).toEqual([
      'ghost', 'ghost', 'multiple-choice', 'microdrill', 'microdrill', 'microdrill', 'recall', 'recall', 'ghost',
    ])
    expect(nextFlowStep(config, 8).cycle).toBe(2)
  })

  it('random flows draw independently, allow repeats and honor enabled stages', () => {
    const config = { ...DEFAULT_FLOW, mode: 'random' as const, randomStages: ['ghost' as const, 'microdrill' as const] }
    const values = [0, 0.2, 0.9, 0.7, 0.8]
    let draws = 0
    const results = values.map((_, index) => nextFlowStep(config, index, () => values[draws++]).stage)
    expect(draws).toBe(5)
    expect(results).toEqual(['ghost', 'ghost', 'microdrill', 'microdrill', 'microdrill'])
  })

  it('crosses modalities to remediate and verify a weakness', () => {
    const recallMiss = [attempt('total-recall', { successful: false, score: 40, missedLineCount: 2 })]
    expect(nextFlowStep(DEFAULT_FLOW, 1, Math.random, recallMiss).stage).toBe('ghost')
    const ghostRepair = [...recallMiss, attempt('ghost-rep', { score: 100 })]
    expect(nextFlowStep(DEFAULT_FLOW, 2, Math.random, ghostRepair).stage).toBe('multiple-choice')
    const mcqMiss = [...ghostRepair, attempt('mcq', { successful: false, score: 0 })]
    expect(nextFlowStep(DEFAULT_FLOW, 3, Math.random, mcqMiss).stage).toBe('microdrill')
    const drillMiss = [...mcqMiss, attempt('microdrill', { successful: false, score: 45 })]
    expect(nextFlowStep(DEFAULT_FLOW, 4, Math.random, drillMiss).stage).toBe('recall')
  })

  it('does not require a ghost rep for clean mastery', () => {
    const history = [90, 91, 92, 94, 95, 96].map((score, index) =>
      attempt((['total-recall', 'mcq', 'microdrill'] as const)[index % 3], { score }),
    )
    const summary = summarizeFlowMastery(history)
    expect(summary.successfulModalities).toBe(3)
    expect(summary.mastered).toBe(true)
    expect(summary.proficiency).toBeGreaterThanOrEqual(90)
  })

  it('ignores invalid saved blocks', () => {
    localStorage.setItem(
      'practice-flow-v1',
      JSON.stringify({ mode: 'custom', blocks: [{ stage: 'unknown', count: 3 }, { stage: 'ghost', count: -1 }] }),
    )
    expect(loadFlowConfig()).toBe(DEFAULT_FLOW)
  })
})
