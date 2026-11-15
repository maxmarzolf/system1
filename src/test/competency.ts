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
  kind: 'algorithm', answers: 1, lastPractised: '2026-03-01', lastAverage: fields.competency, daysSince: 0, standing: 'learn',
  freeFall: false, strongestSignals: [], weakestSignals: [], ...fields,
})

/**
 * Heap: practised Mar 1 at 80, decaying to 76.8 (review), in free fall, with signals on both sides.
 * Sliding window: practised Mar 3 at 90 (strong). Trees: never practised.
 */
export const competencyTerrain = (): components['schemas']['CompetencyTerrainResponse'] => ({
  decayPerDay: 0.02,
  freeFallDays: 10,
  overall: {
    competency: 83.4,
    days: [{ date: '2026-03-01', competency: 80 }, { date: '2026-03-02', competency: 78.4 }, { date: '2026-03-03', competency: 83.4 }],
  },
  unpractised: [{ slug: 'trees', name: 'Trees', kind: 'algorithm' }],
  algorithms: [
    competencyAlgorithm({
      slug: 'heap', name: 'Heap', answers: 2, competency: 76.8, lastAverage: 80, daysSince: 2, standing: 'review', freeFall: true,
      strongestSignals: [{ key: 'conceptRecognition', label: 'Concept recognition', average: 96, answers: 1 }],
      weakestSignals: [{ key: 'correctness', label: 'Correct choice', average: 40, answers: 2 }],
    }),
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
