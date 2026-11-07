import { Suspense, lazy, useEffect, useState } from 'react'
import { apiUrl } from './api'
import DailyWorkHistory, {
  type DailyWorkActivity,
  type DailyWorkAlgorithm,
} from './DailyWorkHistory'
import { DAILY_WORK_RANGES, type DailyWorkRange, viewerTimeZone } from './dailyWork'
import HistoryDayDetail from './HistoryDayDetail'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'

// three.js is large; load the loss landscape only when this page renders it.
const SignalHologram = lazy(() => import('./SignalHologram'))

type SkillMapOverview = {
  algorithms: DailyWorkAlgorithm[]
  ghostRepActivity: DailyWorkActivity
}

const latestActiveDate = (activity: DailyWorkActivity) =>
  [...activity.days].reverse().find(day => day.segments.some(segment => segment.count > 0))?.date ?? null

export default function PracticeHistoryPage() {
  const configuredProviderLabel = useConfiguredProviderLabel()
  const [range, setRange] = useState<DailyWorkRange>('month')
  const [skillMapOverview, setSkillMapOverview] = useState<SkillMapOverview | null>(null)
  const [skillMapOverviewError, setSkillMapOverviewError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // Algorithm slug the day detail shows; '' shows every algorithm.
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('')

  // Clicking the date or algorithm that is already selected clears just that filter.
  const selectDate = (date: string) => setSelectedDate(current => (current === date ? null : date))
  const selectAlgorithm = (slug: string) => setSelectedAlgorithm(current => (current === slug ? '' : slug))

  useEffect(() => {
    const controller = new AbortController()
    const historyDays = DAILY_WORK_RANGES.find(option => option.value === range)?.days ?? 30
    const loadSkillMapOverview = async () => {
      setLoading(true)
      setSkillMapOverviewError('')
      try {
        const response = await fetch(
          apiUrl(`/api/skill-map-overview?historyDays=${historyDays}&tz=${encodeURIComponent(viewerTimeZone())}`),
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error('Unable to load skill map overview')
        const payload = (await response.json()) as SkillMapOverview
        setSkillMapOverview(payload)
        // Keep the selected day while it is in range; otherwise show the most recent day with work.
        setSelectedDate(current =>
          current && payload.ghostRepActivity.days.some(day => day.date === current)
            ? current
            : latestActiveDate(payload.ghostRepActivity),
        )
      } catch {
        if (controller.signal.aborted) return
        setSkillMapOverview(null)
        setSkillMapOverviewError('Daily work history is unavailable right now.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadSkillMapOverview()
    return () => controller.abort()
  }, [range])

  return (
    <div className="app">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} />
      <DailyWorkHistory
        activity={skillMapOverview?.ghostRepActivity}
        algorithmOrder={skillMapOverview?.algorithms ?? []}
        range={range}
        onRangeChange={setRange}
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        selectedAlgorithm={selectedAlgorithm}
        onSelectAlgorithm={selectAlgorithm}
        loading={loading}
      />
      {skillMapOverviewError && <p className="coach-error">{skillMapOverviewError}</p>}
      {skillMapOverview ? (
        <HistoryDayDetail
          date={selectedDate}
          algorithmFilter={selectedAlgorithm}
          algorithmNames={Object.fromEntries(skillMapOverview.algorithms.map(algorithm => [algorithm.slug, algorithm.algorithm]))}
        />
      ) : null}
      <Suspense
        fallback={(
          <section className="daily-work-history signal-hologram" aria-label="Signal loss landscape">
            <p className="dashboard-activity-eyebrow">Signal Loss Landscape</p>
            <p className="dashboard-mode-meta">Projecting signal history…</p>
          </section>
        )}
      >
        <SignalHologram />
      </Suspense>
    </div>
  )
}
