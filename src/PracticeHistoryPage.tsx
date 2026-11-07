import { useEffect, useState } from 'react'
import { apiUrl } from './api'
import DailyWorkHistory, {
  type DailyWorkActivity,
  type DailyWorkAlgorithm,
} from './DailyWorkHistory'
import { DAILY_WORK_RANGES, type DailyWorkRange, viewerTimeZone } from './dailyWork'
import HistoryDayDetail from './HistoryDayDetail'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'

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
        onSelectDate={setSelectedDate}
        loading={loading}
      />
      {skillMapOverviewError && <p className="coach-error">{skillMapOverviewError}</p>}
      {skillMapOverview ? <HistoryDayDetail date={selectedDate} /> : null}
    </div>
  )
}
