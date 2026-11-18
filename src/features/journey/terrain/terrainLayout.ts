/**
 * Lays the backend's competency cells out on the terrain's grid. No competency is computed here:
 * the server's aggregate query (GET /api/history/competency) does all of it, including the decay
 * on days without practice. This only finds each cell's place, kept free of three.js for testing.
 */
import type { components } from '@/api/schema'

export type CompetencyTerrainData = components['schemas']['CompetencyTerrainResponse']
export type CompetencyCell = components['schemas']['CompetencyCell']

export type TerrainGrid = {
  /** ``cells[algorithmIndex][dayIndex]``; null before the algorithm was first practised. */
  cells: (CompetencyCell | null)[][]
  /** The practised cells, in algorithm then day order (the dots). */
  observed: { cell: CompetencyCell; algorithmIndex: number; dayIndex: number }[]
}

export function terrainGrid(terrain: CompetencyTerrainData): TerrainGrid {
  const algorithmIndex = new Map(terrain.algorithms.map((algorithm, index) => [algorithm.slug, index]))
  const dayIndex = new Map(terrain.days.map((day, index) => [day, index]))
  const cells: (CompetencyCell | null)[][] = terrain.algorithms.map(() => terrain.days.map(() => null))
  const observed: TerrainGrid['observed'] = []
  for (const cell of terrain.cells) {
    const column = algorithmIndex.get(cell.algorithm)
    const row = dayIndex.get(cell.date)
    if (column === undefined || row === undefined) continue
    cells[column][row] = cell
    if (cell.observed) observed.push({ cell, algorithmIndex: column, dayIndex: row })
  }
  return { cells, observed }
}

/** The day indices to label down the side: evenly spread, always the first and the last. */
export function dayTicks(dayCount: number, ticks = 5): number[] {
  if (dayCount <= 0) return []
  if (dayCount <= ticks) return Array.from({ length: dayCount }, (_, index) => index)
  return [...new Set(Array.from({ length: ticks }, (_, tick) => Math.round((tick / (ticks - 1)) * (dayCount - 1))))]
}

/** The cell nearest a position on the grid (``column`` and ``row`` in algorithm and day units). */
export function nearestCell(grid: TerrainGrid, column: number, row: number): CompetencyCell | null {
  const algorithm = grid.cells[Math.min(Math.max(Math.round(column), 0), grid.cells.length - 1)]
  if (!algorithm?.length) return null
  return algorithm[Math.min(Math.max(Math.round(row), 0), algorithm.length - 1)]
}
