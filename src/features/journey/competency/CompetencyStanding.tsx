import { useNavigate } from 'react-router-dom'
import { formatCalendarDate } from '@/shared/lib/dailyWork'
import {
  STANDING_HINTS, STANDING_LABELS, cellsFor, competencyFill, daysAgo, pluralize, practiceHref, standingOf,
  type CompetencyAlgorithm, type CompetencyTerrainData,
} from './competencyDisplay'

const TREND_DAYS = 90
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

function StandingRow({ terrain, algorithm }: { terrain: CompetencyTerrainData; algorithm: CompetencyAlgorithm }) {
  const navigate = useNavigate()
  const standing = standingOf(algorithm.standing)
  return (
    <li className="competency-row">
      <div className="competency-row-head">
        <strong>{algorithm.name}</strong>
        <span className={`competency-chip competency-chip-${standing}`} title={STANDING_HINTS[standing]}>{STANDING_LABELS[standing]}</span>
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
      <button type="button" className="secondary competency-practise" onClick={() => navigate(practiceHref(algorithm))}
        aria-label={`Practise ${algorithm.name}`}>
        Practise
      </button>
    </li>
  )
}

/** Where you stand today, weakest first: competency, why it is low, the trend, and a way in. */
export default function CompetencyStanding({ terrain, ranked }: { terrain: CompetencyTerrainData; ranked: CompetencyAlgorithm[] }) {
  return (
    <ol className="competency-standing" aria-label="Competency today, weakest first">
      {ranked.map((algorithm) => <StandingRow key={algorithm.slug} terrain={terrain} algorithm={algorithm} />)}
    </ol>
  )
}
