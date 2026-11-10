/**
 * The signal terrain's maths, kept free of three.js so it can be tested on its own.
 * Height is shortfall (100 - score): peaks are weak spots, the floor is "no evidence of weakness".
 */

export type TerrainPoint = { createdAt: string; signal: string; score: number }
export type TerrainHistory = { signals: { key: string }[]; points: TerrainPoint[] }
export type TimeRange = { tMin: number; tMax: number }

export const LANDSCAPE_ROWS = 48 // samples along time, back (oldest) to front (newest)
export const TIME_BANDWIDTH = 0.07 // smoothing kernel width, as a fraction of the whole time span
export const MIN_TIME_SPAN_MS = 7 * 24 * 60 * 60 * 1000

export const shortfallOf = (score: number) => 100 - score

/**
 * The time axis: it ends at the newest answer and spans at least MIN_TIME_SPAN_MS, so a single
 * day's answers sit at the front edge instead of being stretched across (or centred on) the floor.
 */
export function timeRange(points: TerrainPoint[]): TimeRange {
  const times = points.map((point) => Date.parse(point.createdAt)).filter(Number.isFinite)
  if (!times.length) return { tMin: 0, tMax: MIN_TIME_SPAN_MS }
  const tMax = Math.max(...times)
  return { tMin: Math.min(Math.min(...times), tMax - MIN_TIME_SPAN_MS), tMax }
}

/** Where ``time`` falls on the axis: 0 is the oldest edge, 1 the newest. */
export const timeFraction = (time: number, { tMin, tMax }: TimeRange) => (time - tMin) / (tMax - tMin)

/**
 * Shortfall for each signal at each time row, Gaussian-smoothed over time.
 *
 * ``Σ w·s / max(Σ w, 1)``: where answers are dense (Σw ≥ 1) this is their weighted average; away from
 * answers it falls to the floor. So one answer is a hump that peaks at its own shortfall at its own
 * time, rather than a ridge at that height along the whole axis.
 */
export function signalShortfallRows(history: TerrainHistory, range: TimeRange): number[][] {
  return history.signals.map((signal) => {
    const samples = history.points
      .filter((point) => point.signal === signal.key)
      .map((point) => ({ at: timeFraction(Date.parse(point.createdAt), range), shortfall: shortfallOf(point.score) }))
    return Array.from({ length: LANDSCAPE_ROWS }, (_, row) => {
      const at = row / (LANDSCAPE_ROWS - 1)
      let weights = 0
      let total = 0
      for (const sample of samples) {
        const weight = Math.exp(-((at - sample.at) ** 2) / (2 * TIME_BANDWIDTH ** 2))
        weights += weight
        total += weight * sample.shortfall
      }
      return total / Math.max(weights, 1)
    })
  })
}
