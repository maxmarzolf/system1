import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { storedSetting, useStoredSetting } from './storedSetting'

type Prefs = { size: number; mode: 'a' | 'b' }
const defaults: Prefs = { size: 1, mode: 'a' }
const setting = storedSetting<Prefs>('test-prefs', defaults, (stored) => ({
  size: typeof stored.size === 'number' ? stored.size : defaults.size,
  mode: stored.mode === 'b' ? 'b' : 'a',
}))

describe('storedSetting', () => {
  it('falls back to the defaults for missing, corrupt or non-object values', () => {
    expect(setting.load()).toEqual(defaults)
    for (const raw of ['{', '42', 'null', '"text"']) {
      localStorage.setItem('test-prefs', raw)
      expect(setting.load()).toEqual(defaults)
    }
    localStorage.setItem('test-prefs', JSON.stringify({ size: 3, mode: 'z' }))
    expect(setting.load()).toEqual({ size: 3, mode: 'a' })
  })

  it('survives blocked storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => setting.save({ size: 2, mode: 'b' })).not.toThrow()
    setItem.mockRestore()
  })

  it('backs React state and saves each change', () => {
    const { result } = renderHook(() => useStoredSetting(setting))
    expect(result.current[0]).toEqual(defaults)
    act(() => result.current[1]({ size: 5, mode: 'b' }))
    expect(JSON.parse(localStorage.getItem('test-prefs') ?? '{}')).toEqual({ size: 5, mode: 'b' })
  })
})
