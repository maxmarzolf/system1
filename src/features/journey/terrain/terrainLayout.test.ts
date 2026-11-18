import { describe, expect, it } from 'vitest'
import { competencyAlgorithm, competencyCell, competencyTerrain } from '@/test/competency'
import { dayTicks, nearestCell, terrainGrid, type CompetencyTerrainData } from './terrainLayout'

const terrain: CompetencyTerrainData = {
  ...competencyTerrain(),
  algorithms: [
    competencyAlgorithm({ slug: 'heap', name: 'Heap', competency: 78.4 }),
    competencyAlgorithm({ slug: 'sliding-window', name: 'Sliding Window', competency: 90 }),
  ],
  days: ['2026-01-01', '2026-01-02'],
  cells: [
    competencyCell('heap', '2026-01-01', 80, true),
    competencyCell('heap', '2026-01-02', 78.4, false),
    competencyCell('sliding-window', '2026-01-02', 90, true),
    competencyCell('unknown', '2026-01-02', 10, true),
  ],
}

describe('terrainGrid', () => {
  it('places each cell by algorithm and day, leaving days before first practice empty', () => {
    const grid = terrainGrid(terrain)
    expect(grid.cells[0].map((item) => item?.competency)).toEqual([80, 78.4])
    expect(grid.cells[1][0]).toBeNull()
    expect(grid.cells[1][1]?.competency).toBe(90)
  })

  it('lists only practised cells as dots, and ignores cells for unknown algorithms', () => {
    expect(terrainGrid(terrain).observed.map(({ cell: item, algorithmIndex, dayIndex }) => [item.algorithm, algorithmIndex, dayIndex])).toEqual([
      ['heap', 0, 0],
      ['sliding-window', 1, 1],
    ])
  })
})

describe('dayTicks', () => {
  it('labels every day when there are few, and spreads labels otherwise', () => {
    expect(dayTicks(0)).toEqual([])
    expect(dayTicks(3)).toEqual([0, 1, 2])
    expect(dayTicks(101)).toEqual([0, 25, 50, 75, 100])
  })
})

describe('nearestCell', () => {
  it('snaps a grid position to the nearest cell, clamped to the grid', () => {
    const grid = terrainGrid(terrain)
    expect(nearestCell(grid, 0.2, 0.9)?.competency).toBe(78.4)
    expect(nearestCell(grid, 5, -3)).toBeNull() // sliding window, day 0: before first practice
    expect(nearestCell({ cells: [], observed: [] }, 0, 0)).toBeNull()
  })
})
