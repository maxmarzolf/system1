import { errorMessage } from '@/api/client'
import { useCompetencyTerrain } from '@/api/queries'
import CompetencyStanding from './CompetencyStanding'
import { rankedAlgorithms } from './competencyDisplay'

/** Journey's readable competency views: where you stand today, and the history behind it. */
export default function CompetencySection({ onSelect }: { onSelect: (date: string, slug: string) => void }) {
  const query = useCompetencyTerrain()
  const terrain = query.error ? null : query.data ?? null
  const ranked = terrain ? rankedAlgorithms(terrain) : []
  const decay = terrain ? `${+(terrain.decayPerDay * 100).toFixed(1)}%` : ''

  return (
    <section className="daily-work-history competency-section" aria-label="Competency by algorithm" aria-busy={!terrain && !query.error}>
      <div className="daily-work-history-header">
        <p className="section-eyebrow">Competency</p>
        {terrain ? (
          <p className="competency-section-note">
            Average signal score per algorithm; days without practice fade {decay}. Learn: never strong. Review: was strong, has faded. Select an algorithm for its history and signals.
          </p>
        ) : null}
      </div>
      {query.error ? <p className="coach-error" role="alert">{errorMessage(query.error, 'Competency unavailable')}</p> : null}
      {!terrain && !query.error ? <p className="section-meta">Loading competency…</p> : null}
      {terrain && !ranked.length ? <p className="section-meta">No graded answers yet.</p> : null}
      {terrain && (ranked.length || terrain.unpractised.length) ? <CompetencyStanding terrain={terrain} ranked={ranked} onSelect={onSelect} /> : null}
    </section>
  )
}
