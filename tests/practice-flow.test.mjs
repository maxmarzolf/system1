import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../src/practiceFlow.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { nextFlowStep, loadFlowConfig, FLOW_STAGES, DEFAULT_FLOW } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

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
