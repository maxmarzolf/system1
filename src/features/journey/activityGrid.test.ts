import { describe, expect, it } from 'vitest'
import { activityWeeks, dayWork, monthLabels } from './activityGrid'

const day = (date: string, count = 0) => ({ date, segments: count ? [{ slug: 'heap', count }] : [] })
const range = (from: string, days: number) =>
  Array.from({ length: days }, (_, index) => {
    const date = new Date(`${from}T12:00:00`)
    date.setDate(date.getDate() + index)
    return day(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`)
  })

describe('activityWeeks', () => {
  it('pads the first week back to Sunday and the last forward to Saturday', () => {
    // Wed Mar 4 2026 to Mon Mar 9.
    const weeks = activityWeeks(range('2026-03-04', 6))
    expect(weeks).toHaveLength(2)
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null])
    expect(weeks[0][3]?.date).toBe('2026-03-04')
    expect(weeks[1][1]?.date).toBe('2026-03-09')
    expect(weeks[1].slice(2)).toEqual([null, null, null, null, null])
  })

  it('has nothing to lay out without days', () => {
    expect(activityWeeks([])).toEqual([])
    expect(monthLabels([])).toEqual([])
  })
})

describe('monthLabels', () => {
  it('labels each week that starts a new month, skipping a crowded partial first week', () => {
    // Fri Jan 30 2026 to mid-March: the first week holds two January days.
    const labels = monthLabels(activityWeeks(range('2026-01-30', 45)))
    expect(labels.map((label) => label.week)).toEqual([1, 5])
    expect(labels[0].label).toBe(new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date('2026-02-02T12:00:00')))
  })

  it('labels a short history from its first week', () => {
    expect(monthLabels(activityWeeks(range('2026-03-04', 6)))).toEqual([
      { week: 0, label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date('2026-03-04T12:00:00')) },
    ])
  })
})

describe('dayWork', () => {
  it('totals a day and lists its algorithms once', () => {
    expect(dayWork({ date: 'd', segments: [{ slug: 'heap', count: 2 }, { slug: 'heap', count: 1 }, { slug: 'trie', count: 0 }] }))
      .toEqual({ total: 3, slugs: ['heap'] })
  })
})
