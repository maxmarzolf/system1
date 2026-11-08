import { Suspense, lazy, useEffect, useState } from 'react'
import { useSkillMapOverview } from './api/queries'
import DailyWorkHistory, {
  type DailyWorkActivity,
  type DailyWorkAlgorithm,
} from './DailyWorkHistory'
import { DAILY_WORK_RANGES, type DailyWorkRange, viewerTimeZone } from './dailyWork'
import HistoryDayDetail from './HistoryDayDetail'
import SignalHologramHeader from './SignalHologramHeader'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'

// three.js is large; load the score terrain only when this page renders it.
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
  const historyDays = DAILY_WORK_RANGES.find(option => option.value === range)?.days ?? 30
  const overviewQuery = useSkillMapOverview<SkillMapOverview>(historyDays, viewerTimeZone())
  const skillMapOverview = overviewQuery.error ? null : overviewQuery.data ?? null
  const skillMapOverviewError = overviewQuery.error ? 'Daily work history is unavailable right now.' : ''
  const loading = overviewQuery.isFetching
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // Algorithm slug the day detail shows; '' shows every algorithm.
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('')

  // Clicking the date or algorithm that is already selected clears just that filter.
  const selectDate = (date: string) => setSelectedDate(current => (current === date ? null : date))
  const selectAlgorithm = (slug: string) => setSelectedAlgorithm(current => (current === slug ? '' : slug))

  // Sections snap into view instead of free-scrolling (styles keyed off this class).
  useEffect(() => {
    document.documentElement.classList.add('journey-snap')
    return () => document.documentElement.classList.remove('journey-snap')
  }, [])

  // Wheel scrolling moves a whole section at a time from a snapped position: CSS mandatory snapping
  // alone sends a short trackpad scroll back to the nearest (current) section. A section taller than
  // the window, like a long day detail, still scrolls normally until its end.
  useEffect(() => {
    const ANIMATION_MS = 750
    const MOMENTUM_GAP_MS = 120
    let animatingUntil = 0
    let lastWheel = 0
    const snapTops = () => {
      const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
      return [...document.querySelectorAll<HTMLElement>('.app-history > section')].map(section => ({
        top: Math.max(0, Math.round(section.getBoundingClientRect().top + window.scrollY - padding)),
        bottom: section.getBoundingClientRect().bottom + window.scrollY,
      }))
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.defaultPrevented) return // terrain zoom
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
      const now = performance.now()
      const momentum = now - lastWheel < MOMENTUM_GAP_MS
      lastWheel = now
      // Swallow the rest of a swipe (and its momentum) while and just after a section move.
      if (now < animatingUntil || (momentum && now < animatingUntil + 400)) {
        event.preventDefault()
        return
      }
      const sections = snapTops()
      const current = sections.findIndex(section => Math.abs(section.top - window.scrollY) <= 2)
      if (current < 0) return // between snap points: inside a long section
      const down = event.deltaY > 0
      if (down && sections[current].bottom > window.scrollY + window.innerHeight + 2) return // more to read
      const target = sections[current + (down ? 1 : -1)]
      if (!target) return
      event.preventDefault()
      animatingUntil = now + ANIMATION_MS
      window.scrollTo({ top: target.top, behavior: 'smooth' })
    }
    const onScrollEnd = () => {
      if (performance.now() < animatingUntil) animatingUntil = performance.now()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('scrollend', onScrollEnd)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('scrollend', onScrollEnd)
    }
  }, [])

  // The nav turns solid only once scrolling has settled on a section below the top one.
  const [navSolid, setNavSolid] = useState(false)
  useEffect(() => {
    let settle = 0
    const onScroll = () => {
      window.clearTimeout(settle)
      settle = window.setTimeout(() => setNavSolid(window.scrollY > 1), 120)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  // When a new window loads, keep the selected day while it is in range; otherwise show the most recent day with work.
  const loadedActivity = overviewQuery.isPlaceholderData ? undefined : overviewQuery.data?.ghostRepActivity
  const [activitySeen, setActivitySeen] = useState(loadedActivity)
  if (loadedActivity && loadedActivity !== activitySeen) {
    setActivitySeen(loadedActivity)
    setSelectedDate(current =>
      current && loadedActivity.days.some(day => day.date === current) ? current : latestActiveDate(loadedActivity),
    )
  }

  return (
    <div className="app app-history">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} pinned solid={navSolid} />
      <Suspense
        fallback={(
          <section className="signal-hologram" aria-label="Signal score terrain">
            <SignalHologramHeader summary="" />
            <p className="dashboard-mode-meta signal-hologram-loading">Mapping signal scores…</p>
          </section>
        )}
      >
        <SignalHologram />
      </Suspense>
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
    </div>
  )
}
