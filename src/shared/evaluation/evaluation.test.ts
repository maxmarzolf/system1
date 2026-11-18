import { describe, expect, it } from 'vitest'
import {
  correctnessSource, feedbackText, flagsOf, overallScore, overrideReasons, signalOutcomes, verdictOf, type Evaluation,
} from './evaluation'

const evaluation = (fields: Record<string, unknown>) => fields as unknown as Evaluation

describe('evaluation readers', () => {
  it('reads the verdict and ignores unknown or missing ones', () => {
    expect(verdictOf(evaluation({ verdict: 'close' }))).toBe('close')
    expect(verdictOf(evaluation({ verdict: 'great' }))).toBeNull()
    expect(verdictOf(null)).toBeNull()
  })

  it('reads the overall score only when it is a number', () => {
    expect(overallScore(evaluation({ score: { overall: 72.5 } }))).toBe(72.5)
    expect(overallScore(evaluation({ score: { overall: '72' } }))).toBeNull()
    expect(overallScore(evaluation({ score: [] }))).toBeNull()
    expect(overallScore(undefined)).toBeNull()
  })

  it('reads who decided correctness, and the override reasons', () => {
    const graded = evaluation({
      correctness: {
        source: 'deterministic-override',
        overrides: [{ key: 'no_return', message: 'The answer never returns a value.' }, { key: 'syntax' }, {}],
      },
    })
    expect(correctnessSource(graded)).toBe('deterministic-override')
    expect(overrideReasons(graded)).toEqual(['The answer never returns a value.', 'syntax'])
    expect(correctnessSource(evaluation({ correctness: { source: 'oracle' } }))).toBeNull()
    expect(overrideReasons(evaluation({ correctness: { overrides: 'none' } }))).toEqual([])
  })

  it('reads flags from provenance', () => {
    expect(flagsOf(evaluation({ provenance: { flags: ['jev_unavailable', 3] } }))).toEqual(['jev_unavailable', '3'])
    expect(flagsOf(evaluation({ provenance: {} }))).toEqual([])
  })

  it('lists signal outcomes with scored ones first and defaults for missing fields', () => {
    const outcomes = signalOutcomes(evaluation({
      signalResults: {
        speed: { status: 'unavailable' },
        nearMiss: { label: 'Near miss', role: 'score', status: 'scored', score: 91.5, raw: 'Near', note: 'n' },
      },
    }))
    expect(outcomes.map((outcome) => outcome.key)).toEqual(['nearMiss', 'speed'])
    expect(outcomes[0]).toEqual({ key: 'nearMiss', label: 'Near miss', role: 'score', status: 'scored', score: 91.5, raw: 'Near', note: 'n' })
    expect(outcomes[1]).toMatchObject({ label: 'speed', role: '', score: null, raw: null, note: '' })
  })

  it('reads written feedback strings, trimmed', () => {
    const graded = evaluation({ feedback: { fullFeedback: '  Return the total.  ', strengths: ['a'] } })
    expect(feedbackText(graded, 'fullFeedback')).toBe('Return the total.')
    expect(feedbackText(graded, 'strengths')).toBe('')
    expect(feedbackText(evaluation({}), 'fullFeedback')).toBe('')
  })
})
