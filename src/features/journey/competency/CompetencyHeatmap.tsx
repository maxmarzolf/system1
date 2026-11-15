import { type CSSProperties, useState } from 'react'
import { formatCalendarDate } from '@/shared/lib/dailyWork'
import { dayTicks } from '../terrain/terrainLayout'
import { competencyFill, pluralize, type CompetencyAlgorithm, type CompetencyCell, type CompetencyTerrainData } from './competencyDisplay'

const CELL_WIDTH = 4
const ROW_HEIGHT = 18

type Hovered = { cell: CompetencyCell; name: string }

const describe = ({ cell, name }: Hovered) =>
  `${name} · ${formatCalendarDate(cell.date)} · competency ${cell.competency.toFixed(1)} · ${
    cell.observed
      ? `${pluralize(cell.answers, 'answer')}, ${cell.signals} signals averaged`
      : `not practised: decayed from ${formatCalendarDate(cell.lastPractised)}`
  }`

/**
 * Competency history: one row per algorithm (in the list's order), one column per day. Practised
 * days are outlined and open that day's answers below.
 */
export default function CompetencyHeatmap({ terrain, ranked, onSelect }: {
  terrain: CompetencyTerrainData
  ranked: CompetencyAlgorithm[]
  onSelect: (date: string, slug: string) => void
}) {
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const dayIndex = new Map(terrain.days.map((day, index) => [day, index]))
  const width = Math.max(terrain.days.length, 1) * CELL_WIDTH
  const ticks = dayTicks(terrain.days.length, 6)

  return (
    <div className="competency-heatmap" style={{ '--competency-rows': ranked.length } as CSSProperties}>
      <div className="competency-heatmap-ticks" aria-hidden="true">
        {ticks.map((index) => (
          <span key={index} style={{ left: `${terrain.days.length > 1 ? (index / (terrain.days.length - 1)) * 100 : 0}%` }}>
            {formatCalendarDate(terrain.days[index])}
          </span>
        ))}
      </div>
      <div className="competency-heatmap-body">
        <ul className="competency-heatmap-labels" aria-hidden="true">
          {ranked.map((algorithm) => <li key={algorithm.slug}>{algorithm.name}</li>)}
        </ul>
        <svg className="competency-heatmap-grid" viewBox={`0 0 ${width} ${ranked.length * ROW_HEIGHT}`} preserveAspectRatio="none"
          role="group" aria-label="Competency per algorithm per day; practised days open that day's answers"
          onMouseLeave={() => setHovered(null)}>
          {ranked.map((algorithm, row) => terrain.cells
            .filter((cell) => cell.algorithm === algorithm.slug)
            .map((cell) => {
              const x = (dayIndex.get(cell.date) ?? 0) * CELL_WIDTH
              const shared = {
                x, y: row * ROW_HEIGHT + 1, width: CELL_WIDTH, height: ROW_HEIGHT - 2,
                style: { fill: competencyFill(cell.competency) },
                onMouseEnter: () => setHovered({ cell, name: algorithm.name }),
              }
              if (!cell.observed) return <rect key={cell.date} {...shared} className="competency-heatmap-cell" />
              const select = () => onSelect(cell.date, algorithm.slug)
              return (
                <rect key={cell.date} {...shared} className="competency-heatmap-cell competency-heatmap-practised"
                  vectorEffect="non-scaling-stroke" tabIndex={0} role="button"
                  aria-label={describe({ cell, name: algorithm.name })}
                  onFocus={() => setHovered({ cell, name: algorithm.name })}
                  onClick={select}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      select()
                    }
                  }} />
              )
            }))}
        </svg>
      </div>
      <p className="competency-heatmap-status" role="status">
        {hovered ? describe(hovered) : 'Hover a day for its values; outlined days were practised and open their answers.'}
      </p>
    </div>
  )
}
