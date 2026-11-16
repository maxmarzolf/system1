/**
 * Display helpers for the competency views. Every number they show comes from the server
 * (GET /api/history/competency); these only order, select and colour it.
 */
import type { components } from '@/api/schema'

export type CompetencyTerrainData = components['schemas']['CompetencyTerrainResponse']
export type CompetencyAlgorithm = components['schemas']['CompetencyAlgorithm']
export type CompetencyCell = components['schemas']['CompetencyCell']
export type CompetencySignal = components['schemas']['CompetencySignal']
export type UnpractisedAlgorithm = components['schemas']['UnpractisedAlgorithm']
export type Standing = 'strong' | 'learn' | 'review'

export const STANDING_LABELS: Record<Standing, string> = { learn: 'Learn', review: 'Review', strong: 'Strong' }
export const STANDING_HINTS: Record<Standing, string> = {
  learn: 'Never scored strongly: work through it again',
  review: 'Was strong, has faded: a quick review should bring it back',
  strong: 'Strong right now',
}

export type Trend = 'improving' | 'maintaining' | 'regressing'
export const TREND_LABELS: Record<Trend, string> = { improving: 'Improving', maintaining: 'Maintaining', regressing: 'Regressing' }
/** Trends share the standing chips' colours: green, yellow, red. */
export const TREND_CHIP: Record<Trend, Standing> = { improving: 'strong', maintaining: 'review', regressing: 'learn' }
export const trendOf = (value: string | null | undefined): Trend | null =>
  value === 'improving' || value === 'maintaining' || value === 'regressing' ? value : null

export const standingOf = (value: string): Standing => (value === 'strong' || value === 'review' ? value : 'learn')

/** Weakest first, so the list starts where practice helps most. */
export const rankedAlgorithms = (terrain: CompetencyTerrainData) =>
  [...terrain.algorithms].sort((a, b) => a.competency - b.competency || a.name.localeCompare(b.name))

/** One algorithm's cells, oldest first, optionally only the most recent ``limit`` days. */
export function cellsFor(terrain: CompetencyTerrainData, slug: string, limit?: number): CompetencyCell[] {
  const cells = terrain.cells.filter((cell) => cell.algorithm === slug)
  return limit ? cells.slice(-limit) : cells
}

/** The theme colour for a competency: error at 0, warning at 50, accent at 100. */
export function competencyFill(competency: number): string {
  const value = Math.min(Math.max(competency, 0), 100)
  return value < 50
    ? `color-mix(in srgb, var(--hc-warning) ${Math.round(value * 2)}%, var(--hc-error))`
    : `color-mix(in srgb, var(--hc-accent) ${Math.round((value - 50) * 2)}%, var(--hc-warning))`
}

export const pluralize = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

export const daysAgo = (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`)

/** The deck to practise an algorithm or playlist with (`focusPattern` or `playlist` on /practice). */
export const practiceHref = (algorithm: Pick<UnpractisedAlgorithm, 'slug' | 'kind'>) =>
  `/practice?${new URLSearchParams(algorithm.kind === 'playlist' ? { playlist: algorithm.slug } : { focusPattern: algorithm.slug })}`
