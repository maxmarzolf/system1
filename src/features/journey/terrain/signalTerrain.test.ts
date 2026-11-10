import { describe, expect, it } from 'vitest'
import { LANDSCAPE_ROWS, MIN_TIME_SPAN_MS, signalShortfallRows, timeFraction, timeRange, type TerrainPoint } from './signalTerrain'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-08T12:00:00Z')
const at = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString()
const point = (signal: string, score: number, offsetDays: number): TerrainPoint => ({ signal, score, createdAt: at(offsetDays) })
const LAST = LANDSCAPE_ROWS - 1

describe('timeRange', () => {
  it('spans at least a week, ending at the newest answer', () => {
    const range = timeRange([point('a', 40, 0), point('b', 70, 0)])
    expect(range).toEqual({ tMin: NOW - MIN_TIME_SPAN_MS, tMax: NOW })
    expect(timeFraction(NOW, range)).toBe(1)
  })

  it('keeps a longer history as it is', () => {
    expect(timeRange([point('a', 40, -30), point('a', 70, 0)])).toEqual({ tMin: NOW - 30 * DAY, tMax: NOW })
  })

  it('has a usable axis with no answers', () => {
    const range = timeRange([])
    expect(range.tMax - range.tMin).toBe(MIN_TIME_SPAN_MS)
  })
})

describe('signalShortfallRows', () => {
  it('draws one answer as a hump at its own time, not a ridge along the axis', () => {
    const points = [point('near-miss', 40, 0)]
    const [rows] = signalShortfallRows({ signals: [{ key: 'near-miss' }], points }, timeRange(points))
    expect(rows[LAST]).toBeCloseTo(60) // full shortfall at today, the front edge
    expect(rows[0]).toBeLessThan(0.01) // a week back: the floor
    expect(rows[Math.round(LAST / 2)]).toBeLessThan(0.01)
  })

  it('draws two separated answers as two humps with a valley between', () => {
    const points = [point('s', 20, -20), point('s', 50, 0)]
    const [rows] = signalShortfallRows({ signals: [{ key: 's' }], points }, timeRange(points))
    expect(rows[0]).toBeCloseTo(80)
    expect(rows[LAST]).toBeCloseTo(50)
    expect(rows[Math.round(LAST / 2)]).toBeLessThan(1)
  })

  it('averages answers that crowd together', () => {
    const points = [point('s', 20, 0), point('s', 60, 0), point('s', 100, -10)]
    const [rows] = signalShortfallRows({ signals: [{ key: 's' }], points }, timeRange(points))
    expect(rows[LAST]).toBeCloseTo(60) // mean of 80 and 40
  })

  it('leaves a signal with no answers on the floor', () => {
    const points = [point('a', 10, 0)]
    const [, empty] = signalShortfallRows({ signals: [{ key: 'a' }, { key: 'b' }], points }, timeRange(points))
    expect(empty.every((value) => value === 0)).toBe(true)
  })
})
