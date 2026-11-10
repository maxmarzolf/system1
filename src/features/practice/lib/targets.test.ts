import { describe, expect, it } from 'vitest'
import { derivePracticeTargets } from './targets'
import { emptySkillMapCard } from './types'

describe('derivePracticeTargets', () => {
  const card = { ...emptySkillMapCard, tags: ['sliding-window'], solution: 'def f():\n    return {{missing}}', missing: '1', prompt: '' }

  it('fills the missing piece into the solution', () => {
    expect(derivePracticeTargets(card).practiceTarget).toBe('def f():\n    return 1')
  })

  it('prefers a generated algorithm target and prompt', () => {
    const generated = { ...card, templateTargets: { algorithm: 'x = {{missing}}' }, templatePrompts: { algorithm: 'Write it' } }
    expect(derivePracticeTargets(generated)).toMatchObject({ practiceTarget: 'x = 1', practicePrompt: 'Write it' })
  })

  it('builds a prompt when the card has none', () => {
    expect(derivePracticeTargets(card).practicePrompt.length).toBeGreaterThan(0)
    expect(derivePracticeTargets(card).primaryPatternTag).toBe('sliding-window')
  })
})
