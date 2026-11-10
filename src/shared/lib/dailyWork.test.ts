import { describe, expect, it, vi } from 'vitest'
import { DAILY_WORK_RANGES, formatCalendarDate, formatCalendarWeekday, formatLongCalendarDate, viewerTimeZone } from './dailyWork'

describe('daily work', () => {
  it('formats calendar dates without shifting the day', () => {
    expect(formatCalendarDate('2026-03-01')).toMatch(/Mar|3/)
    expect(formatCalendarWeekday('2026-03-01')).toMatch(/Sun/)
    expect(formatLongCalendarDate('2026-03-01')).toMatch(/2026/)
    expect(DAILY_WORK_RANGES.map((range) => range.days)).toEqual([7, 30, 0])
  })

  it('reads the viewer timezone and falls back to UTC', () => {
    expect(viewerTimeZone()).toBeTruthy()
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no intl')
    })
    expect(viewerTimeZone()).toBe('UTC')
  })
})
