import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './theme'

describe('theme', () => {
  it('restores the stored theme and requires a provider', () => {
    localStorage.setItem('system1-theme', 'light-high-contrast')
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })
    expect(result.current.theme).toBe('light-high-contrast')
    act(() => result.current.setTheme('dark-high-contrast'))
    expect(localStorage.getItem('system1-theme')).toBe('dark-high-contrast')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within a ThemeProvider')
  })
})
