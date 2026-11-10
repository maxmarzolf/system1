import { describe, expect, it } from 'vitest'
import { SIGNAL_FIELD_HELP } from './signalFieldHelp'

describe('signal field help', () => {
  it('describes every field and primitive', () => {
    expect(Object.keys(SIGNAL_FIELD_HELP).length).toBeGreaterThan(10)
    expect(Object.keys(SIGNAL_FIELD_HELP.criteria)).toEqual(['choice', 'score', 'noul'])
  })
})
