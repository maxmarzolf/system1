/** A small competency response for the Journey competency tests. */
import type { components } from '@/api/schema'

type Cell = components['schemas']['CompetencyCell']
type Algorithm = components['schemas']['CompetencyAlgorithm']

export const competencyCell = (
  algorithm: string, date: string, competency: number, observed: boolean,
  { lastPractised = date, standing = competency >= 70 ? 'strong' : 'learn' }: { lastPractised?: string; standing?: string } = {},
): Cell => ({
  algorithm, date, competency, observed, lastPractised, standing,
  answers: observed ? 2 : 0, signals: observed ? 9 : 0, average: observed ? competency : null,
})

export const competencyAlgorithm = (fields: Partial<Algorithm> & Pick<Algorithm, 'slug' | 'name' | 'competency'>): Algorithm => ({
  kind: 'algorithm', answers: 1, lastPractised: '2026-03-01', lastAverage: fields.competency, daysSince: 0, standing: 'learn', ...fields,
})

/** Heap: practised Mar 1 at 80, decaying to 76.8 (review). Sliding window: practised Mar 3 at 90 (strong). */
export const competencyTerrain = () => ({
  decayPerDay: 0.02,
  algorithms: [
    competencyAlgorithm({ slug: 'heap', name: 'Heap', answers: 2, competency: 76.8, lastAverage: 80, daysSince: 2, standing: 'review' }),
    competencyAlgorithm({ slug: 'sliding-window', name: 'Sliding Window with a very long name', answers: 2, competency: 90, lastPractised: '2026-03-03', standing: 'strong' }),
  ],
  days: ['2026-03-01', '2026-03-02', '2026-03-03'],
  cells: [
    competencyCell('heap', '2026-03-01', 80, true, { standing: 'strong' }),
    competencyCell('heap', '2026-03-02', 78.4, false, { lastPractised: '2026-03-01', standing: 'strong' }),
    competencyCell('heap', '2026-03-03', 76.8, false, { lastPractised: '2026-03-01', standing: 'review' }),
    competencyCell('sliding-window', '2026-03-03', 90, true),
  ],
})
