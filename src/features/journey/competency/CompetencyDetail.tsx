import { useState } from 'react'
import { formatCalendarDate } from '@/shared/lib/dailyWork'
import { dayTicks } from '../terrain/terrainLayout'
import {
  competencyFill, pluralize, type CompetencyAlgorithm, type CompetencyCell, type CompetencySignal, type CompetencyTerrainData,
} from './competencyDisplay'

const GRAPH_WIDTH = 600
const GRAPH_HEIGHT = 90
const STRIP_HEIGHT = 14

const describe = (name: string, cell: CompetencyCell) =>
  `${name} · ${formatCalendarDate(cell.date)} · competency ${cell.competency.toFixed(1)} · ${
    cell.observed
      ? `${pluralize(cell.answers, 'answer')}, ${cell.signals} signals averaged`
      : `not practised: decayed from ${formatCalendarDate(cell.lastPractised)}`
  }`

function SignalList({ title, signals }: { title: string; signals: CompetencySignal[] }) {
  return (
    <div className="competency-signals">
      <h4>{title}</h4>
      {signals.length ? (
        <ol>
          {signals.map((signal) => (
            <li key={signal.key}>
              <span>{signal.label}</span>
              <strong style={{ color: competencyFill(signal.average) }}>{Math.round(signal.average)}</strong>
              <em>{pluralize(signal.answers, 'answer')}</em>
            </li>
          ))}
        </ol>
      ) : <p>Not enough signals yet.</p>}
    </div>
  )
}

/**
 * An expanded algorithm: its whole competency history as a graph, the same days as a heat strip
 * (practised days open their answers), and its strongest and weakest signals. Every value is the
 * server's; this only places it. Days use the terrain's shared range so algorithms line up.
 */
export default function CompetencyDetail({ terrain, algorithm, onSelect }: {
  terrain: CompetencyTerrainData
  algorithm: CompetencyAlgorithm
  onSelect: (date: string, slug: string) => void
}) {
  const [hovered, setHovered] = useState<CompetencyCell | null>(null)
  const dayIndex = new Map(terrain.days.map((day, index) => [day, index]))
  const span = Math.max(terrain.days.length - 1, 1)
  const cells = terrain.cells.filter((cell) => cell.algorithm === algorithm.slug)
  const xOf = (date: string) => ((dayIndex.get(date) ?? 0) / span) * GRAPH_WIDTH
  const yOf = (competency: number) => GRAPH_HEIGHT - 4 - (competency / 100) * (GRAPH_HEIGHT - 8)
  const cellWidth = GRAPH_WIDTH / Math.max(terrain.days.length, 1)
  const ticks = dayTicks(terrain.days.length, 5)

  return (
    <div className="competency-detail" onClick={(event) => event.stopPropagation()}>
      <svg className="competency-detail-graph" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} preserveAspectRatio="none"
        role="img" aria-label={`${algorithm.name}: competency from ${formatCalendarDate(terrain.days[0])} to ${formatCalendarDate(terrain.days.at(-1) ?? terrain.days[0])}`}>
        {[25, 50, 75].map((level) => <line key={level} className="competency-detail-gridline" x1={0} x2={GRAPH_WIDTH} y1={yOf(level)} y2={yOf(level)} />)}
        <polyline points={cells.map((cell) => `${xOf(cell.date)},${yOf(cell.competency)}`).join(' ')} />
        {cells.filter((cell) => cell.observed).map((cell) => (
          // A zero-length round-capped line stays a circle however the graph is stretched.
          <line key={cell.date} className="competency-detail-dot" x1={xOf(cell.date)} x2={xOf(cell.date)}
            y1={yOf(cell.competency)} y2={yOf(cell.competency)} vectorEffect="non-scaling-stroke"
            style={{ stroke: competencyFill(cell.competency) }} />
        ))}
      </svg>
      <svg className="competency-detail-strip" viewBox={`0 0 ${GRAPH_WIDTH} ${STRIP_HEIGHT}`} preserveAspectRatio="none"
        role="group" aria-label={`${algorithm.name} by day; practised days open their answers`} onMouseLeave={() => setHovered(null)}>
        {cells.map((cell) => {
          const shared = {
            x: (dayIndex.get(cell.date) ?? 0) * cellWidth, y: 1, width: cellWidth, height: STRIP_HEIGHT - 2,
            style: { fill: competencyFill(cell.competency) }, onMouseEnter: () => setHovered(cell),
          }
          if (!cell.observed) return <rect key={cell.date} {...shared} className="competency-strip-cell" />
          const select = () => onSelect(cell.date, algorithm.slug)
          return (
            <rect key={cell.date} {...shared} className="competency-strip-cell competency-strip-practised"
              vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-label={describe(algorithm.name, cell)}
              onFocus={() => setHovered(cell)} onClick={select}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  select()
                }
              }} />
          )
        })}
      </svg>
      <div className="competency-detail-ticks" aria-hidden="true">
        {ticks.map((index) => (
          <span key={index} style={{ left: `${(index / span) * 100}%` }}>{formatCalendarDate(terrain.days[index])}</span>
        ))}
      </div>
      <p className="competency-detail-status" role="status">
        {hovered ? describe(algorithm.name, hovered) : 'Hover a day for its values; outlined days were practised and open their answers.'}
      </p>
      <div className="competency-detail-signals">
        <SignalList title="Strongest signals" signals={algorithm.strongestSignals} />
        <SignalList title="Weakest signals" signals={algorithm.weakestSignals} />
      </div>
    </div>
  )
}
