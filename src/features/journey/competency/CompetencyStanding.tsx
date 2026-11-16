import { type MouseEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CompetencyDetail from './CompetencyDetail'
import { formatCalendarDate } from '@/shared/lib/dailyWork'
import {
  STANDING_HINTS, STANDING_LABELS, TREND_CHIP, TREND_LABELS, cellsFor, trendOf, competencyFill, daysAgo, pluralize, practiceHref, standingOf,
  type CompetencyAlgorithm, type CompetencyTerrainData, type UnpractisedAlgorithm,
} from './competencyDisplay'

const TREND_DAYS = 30 // the collapsed preview; the expanded row shows the whole history
const SPARK_WIDTH = 120
const SPARK_HEIGHT = 28

/** The last ``TREND_DAYS`` of an algorithm's competency as a small line, dots on practised days. */
function Sparkline({ terrain, slug, name }: { terrain: CompetencyTerrainData; slug: string; name: string }) {
  const cells = cellsFor(terrain, slug, TREND_DAYS)
  const xOf = (index: number) => (cells.length > 1 ? (index / (cells.length - 1)) * SPARK_WIDTH : SPARK_WIDTH)
  const yOf = (competency: number) => SPARK_HEIGHT - 2 - (competency / 100) * (SPARK_HEIGHT - 4)
  return (
    <svg className="competency-spark" viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} role="img"
      aria-label={`${name}: the last ${pluralize(cells.length, 'day')} of competency`}>
      <polyline points={cells.map((cell, index) => `${xOf(index)},${yOf(cell.competency)}`).join(' ')} />
      {cells.map((cell, index) => cell.observed ? (
        <circle key={cell.date} cx={xOf(index)} cy={yOf(cell.competency)} r={2} style={{ fill: competencyFill(cell.competency) }} />
      ) : null)}
    </svg>
  )
}

function PractiseButton({ algorithm }: { algorithm: UnpractisedAlgorithm }) {
  const navigate = useNavigate()
  const open = (event: MouseEvent) => {
    event.stopPropagation() // not an expand/collapse click
    navigate(practiceHref(algorithm))
  }
  return (
    <button type="button" className="secondary competency-practise" onClick={open} aria-label={`Practise ${algorithm.name}`}>
      Practise
    </button>
  )
}

function StandingRow({ terrain, algorithm, onSelect }: {
  terrain: CompetencyTerrainData
  algorithm: CompetencyAlgorithm
  onSelect: (date: string, slug: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const standing = standingOf(algorithm.standing)
  const freeFall = `Decaying for more than ${pluralize(terrain.freeFallDays, 'day')}.`
  const toggle = () => setExpanded((open) => !open)
  // Expands on click; deliberately no visual expand indicator.
  return (
    <li className="competency-row" tabIndex={0} aria-expanded={expanded} aria-label={`${algorithm.name}: show details`}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          toggle()
        }
      }}>
      <div className="competency-row-head">
        <strong className="competency-row-name">
          {algorithm.freeFall ? <span className="competency-flag quick-tip" data-tip={freeFall} aria-label={freeFall}>!</span> : null}
          {algorithm.name}
        </strong>
        <span className={`competency-chip competency-chip-${standing} quick-tip`} data-tip={STANDING_HINTS[standing]}>{STANDING_LABELS[standing]}</span>
      </div>
      <div className="competency-row-bar" role="meter" aria-label={`${algorithm.name} competency`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={algorithm.competency}>
        <span style={{ width: `${Math.min(Math.max(algorithm.competency, 0), 100)}%`, background: competencyFill(algorithm.competency) }} />
        <em>{Math.round(algorithm.competency)}</em>
      </div>
      <p className="competency-row-meta">
        last {Math.round(algorithm.lastAverage)} on {formatCalendarDate(algorithm.lastPractised)} · {daysAgo(algorithm.daysSince)} · {pluralize(algorithm.answers, 'answer')}
      </p>
      <Sparkline terrain={terrain} slug={algorithm.slug} name={algorithm.name} />
      <PractiseButton algorithm={algorithm} />
      {expanded ? <CompetencyDetail terrain={terrain} algorithm={algorithm} onSelect={onSelect} /> : null}
    </li>
  )
}

/** An algorithm with no graded answers: a centred dash instead of a value. */
function UnpractisedRow({ algorithm }: { algorithm: UnpractisedAlgorithm }) {
  return (
    <li className="competency-row competency-row-unpractised">
      <div className="competency-row-head">
        <strong className="competency-row-name">{algorithm.name}</strong>
        <span className="competency-chip competency-chip-new quick-tip" data-tip="Never practiced.">Not started</span>
      </div>
      <span className="competency-never quick-tip" data-tip="Never practiced." aria-label="Never practiced.">-</span>
      <PractiseButton algorithm={algorithm} />
    </li>
  )
}

const OVERALL_WIDTH = 600
const OVERALL_HEIGHT = 40

/**
 * The average across every practised algorithm: a label, a bar the size of the rows' bars, and
 * its history as a graph across the rest of the width. Sits on the card, without a row outline.
 */
function OverallRow({ terrain }: { terrain: CompetencyTerrainData }) {
  const { competency, days, weekChange } = terrain.overall
  if (competency === null || competency === undefined) return null
  const trend = trendOf(terrain.overall.trend)
  const change = weekChange ?? 0
  const trendTip = `${change > 0 ? 'Up' : change < 0 ? 'Down' : 'No change'}${change ? ` ${Math.abs(change).toFixed(1)} points` : ''} over the last week.`
  const span = Math.max(days.length - 1, 1)
  const xOf = (index: number) => (days.length > 1 ? (index / span) * OVERALL_WIDTH : OVERALL_WIDTH)
  const yOf = (value: number) => OVERALL_HEIGHT - 3 - (value / 100) * (OVERALL_HEIGHT - 6)
  return (
    <div className="competency-row competency-overall">
      <div className="competency-row-head">
        <strong className="competency-row-name">Overall</strong>
        {trend ? (
          <span className={`competency-chip competency-chip-${TREND_CHIP[trend]} quick-tip`} data-tip={trendTip}>{TREND_LABELS[trend]}</span>
        ) : null}
      </div>
      <div className="competency-row-bar" role="meter" aria-label="Overall competency" aria-valuemin={0} aria-valuemax={100} aria-valuenow={competency}>
        <span style={{ width: `${Math.min(Math.max(competency, 0), 100)}%`, background: competencyFill(competency) }} />
        <em>{Math.round(competency)}</em>
      </div>
      <svg className="competency-overall-graph" viewBox={`0 0 ${OVERALL_WIDTH} ${OVERALL_HEIGHT}`} preserveAspectRatio="none" role="img"
        aria-label={`Overall competency from ${formatCalendarDate(days[0].date)} to ${formatCalendarDate(days[days.length - 1].date)}`}>
        <polyline points={days.map((day, index) => `${xOf(index)},${yOf(day.competency)}`).join(' ')} />
      </svg>
    </div>
  )
}

/**
 * Where you stand today, weakest first: competency, why it is low, the trend, and a way in.
 * Clicking a row expands its history and signals. Never-practised algorithms come last.
 */
export default function CompetencyStanding({ terrain, ranked, onSelect }: {
  terrain: CompetencyTerrainData
  ranked: CompetencyAlgorithm[]
  onSelect: (date: string, slug: string) => void
}) {
  return (
    <>
    <OverallRow terrain={terrain} />
    <ol className="competency-standing" aria-label="Competency today, weakest first">
      {ranked.map((algorithm) => <StandingRow key={algorithm.slug} terrain={terrain} algorithm={algorithm} onSelect={onSelect} />)}
      {terrain.unpractised.map((algorithm) => <UnpractisedRow key={algorithm.slug} algorithm={algorithm} />)}
    </ol>
    </>
  )
}
