import { useEffect, useState } from 'react'
import { apiUrl } from './api'
import DailyWorkHistory, {
  type DailyWorkActivity,
  type DailyWorkAlgorithm,
} from './DailyWorkHistory'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'

type SkillMapOverview = {
  algorithms: DailyWorkAlgorithm[]
  ghostRepActivity: DailyWorkActivity
}

export default function PracticeHistoryPage() {
  const configuredProviderLabel = useConfiguredProviderLabel()
  const [skillMapOverview, setSkillMapOverview] = useState<SkillMapOverview | null>(null)
  const [skillMapOverviewError, setSkillMapOverviewError] = useState('')

  useEffect(() => {
    const loadSkillMapOverview = async () => {
      setSkillMapOverviewError('')
      try {
        const response = await fetch(apiUrl('/api/skill-map-overview'))
        if (!response.ok) throw new Error('Unable to load skill map overview')
        const payload = (await response.json()) as SkillMapOverview
        setSkillMapOverview(payload)
      } catch {
        setSkillMapOverview(null)
        setSkillMapOverviewError('Daily work history is unavailable right now.')
      }
    }

    void loadSkillMapOverview()
  }, [])

  return (
    <div className="app">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} />
      <DailyWorkHistory
        activity={skillMapOverview?.ghostRepActivity}
        algorithmOrder={skillMapOverview?.algorithms ?? []}
      />
      {skillMapOverviewError && <p className="coach-error">{skillMapOverviewError}</p>}
    </div>
  )
}
