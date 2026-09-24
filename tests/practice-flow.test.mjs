import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../src/practiceFlow.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { buildFlowTransitionCopy, nextFlowStep, loadFlowConfig, summarizeFlowMastery, FLOW_STAGES, DEFAULT_FLOW } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const attempt = (modality, successful, score, missedLineCount = 0, weaknesses = []) => ({
  anchorCardId: 'card-1', modality, successful, score, missedLineCount, weaknesses, elapsedMs: 1000, question: '',
})

test('custom flow preserves quantities and arrangement across repeated cycles', () => {
  const config = { mode: 'custom', blocks: [{ stage: 'ghost', count: 2 }, { stage: 'multiple-choice', count: 1 }, { stage: 'microdrill', count: 3 }, { stage: 'recall', count: 2 }], randomStages: FLOW_STAGES }
  assert.deepEqual(Array.from({ length: 9 }, (_, i) => nextFlowStep(config, i).stage), ['ghost', 'ghost', 'multiple-choice', 'microdrill', 'microdrill', 'microdrill', 'recall', 'recall', 'ghost'])
  assert.equal(nextFlowStep(config, 8).cycle, 2)
})
test('random flow draws each next step independently, allows repeats, and honors enabled modes', () => {
  const config = { ...DEFAULT_FLOW, mode: 'random', randomStages: ['ghost', 'microdrill'] }
  const values = [0, 0.2, 0.9, 0.7, 0.8]
  let draws = 0
  const results = values.map((_, i) => nextFlowStep(config, i, () => values[draws++]).stage)
  assert.equal(draws, 5)
  assert.deepEqual(results, ['ghost', 'ghost', 'microdrill', 'microdrill', 'microdrill'])
})
test('one-modality flows remain valid and corrupted saved settings recover', () => {
  assert.equal(nextFlowStep({ ...DEFAULT_FLOW, mode: 'random', randomStages: ['microdrill'] }, 100).stage, 'microdrill')
  globalThis.localStorage = { getItem: () => '{broken' }
  assert.deepEqual(loadFlowConfig(), DEFAULT_FLOW)
  globalThis.localStorage = { getItem: () => JSON.stringify({ mode: 'custom', blocks: [{ stage: 'unknown', count: 3 }, { stage: 'ghost', count: -1 }], randomStages: [] }) }
  assert.deepEqual(loadFlowConfig(), DEFAULT_FLOW)
  delete globalThis.localStorage
})

test('adaptive flow crosses modalities to remediate and verify a weakness', () => {
  const config = { ...DEFAULT_FLOW, mode: 'adaptive' }
  assert.equal(nextFlowStep(config, 0, Math.random, []).stage, 'recall')
  const recallMiss = [attempt('total-recall', false, 40, 2, ['left boundary update'])]
  assert.equal(nextFlowStep(config, 1, Math.random, recallMiss).stage, 'ghost')
  const ghostRepair = [...recallMiss, attempt('ghost-rep', true, 100)]
  assert.equal(nextFlowStep(config, 2, Math.random, ghostRepair).stage, 'multiple-choice')
  const mcqMiss = [...ghostRepair, attempt('mcq', false, 0, 0, ['loop invariant'])]
  assert.equal(nextFlowStep(config, 3, Math.random, mcqMiss).stage, 'microdrill')
  const drillMiss = [...mcqMiss, attempt('microdrill', false, 45, 0, ['update order'])]
  assert.equal(nextFlowStep(config, 4, Math.random, drillMiss).stage, 'recall')
})

test('adaptive mastery requires strong recent evidence from all modalities', () => {
  const history = [
    attempt('total-recall', true, 90),
    attempt('mcq', true, 90),
    attempt('microdrill', true, 92),
    attempt('ghost-rep', true, 100),
    attempt('total-recall', true, 94),
    attempt('mcq', true, 96),
  ]
  const summary = summarizeFlowMastery(history)
  assert.equal(summary.phase, 'mastered')
  assert.equal(summary.mastered, true)
  assert.equal(summary.successfulModalities, 4)
  assert.ok(summary.proficiency >= 90)
})

test('adaptive flow skips ghost support when recall has no weakness', () => {
  const config = { ...DEFAULT_FLOW, mode: 'adaptive' }
  const cleanRecall = [attempt('total-recall', true, 95)]
  assert.equal(nextFlowStep(config, 1, Math.random, cleanRecall).stage, 'multiple-choice')
})

test('clean mastery does not require an unnecessary ghost rep', () => {
  const history = [
    attempt('total-recall', true, 90), attempt('mcq', true, 91), attempt('microdrill', true, 92),
    attempt('total-recall', true, 94), attempt('mcq', true, 95), attempt('microdrill', true, 96),
  ]
  const summary = summarizeFlowMastery(history)
  assert.equal(summary.successfulModalities, 3)
  assert.equal(summary.mastered, true)
})

test('coach-led transitions provide destination-specific guidance for every modality', () => {
  const latestAttempt = attempt('total-recall', false, 42, 2, ['left boundary update'])
  const transitions = FLOW_STAGES.map((toStage) => ({
    toStage,
    copy: buildFlowTransitionCopy({
      fromStage: 'recall',
      toStage,
      mode: 'adaptive',
      latestAttempt,
    }),
  }))

  transitions.forEach(({ toStage, copy }) => {
    assert.ok(copy.headline.trim(), `${toStage} should have a headline`)
    assert.ok(copy.detail.trim(), `${toStage} should explain the handoff`)
    assert.ok(copy.status.trim(), `${toStage} should have a loading status`)
  })
  assert.match(transitions.find(({ toStage }) => toStage === 'ghost').copy.headline, /missed steps/i)
  assert.match(transitions.find(({ toStage }) => toStage === 'multiple-choice').copy.headline, /decision/i)
  assert.match(transitions.find(({ toStage }) => toStage === 'microdrill').copy.headline, /code/i)
  assert.match(transitions.find(({ toStage }) => toStage === 'recall').copy.headline, /recall/i)
})

test('coach-led transitions explain flow starts and new anchors', () => {
  const start = buildFlowTransitionCopy({ fromStage: null, toStage: 'recall', mode: 'adaptive' })
  const nextAnchor = buildFlowTransitionCopy({
    fromStage: 'microdrill',
    toStage: 'recall',
    mode: 'adaptive',
    newAnchor: true,
  })

  assert.match(start.headline, /baseline/i)
  assert.match(nextAnchor.headline, /next pattern/i)
})
