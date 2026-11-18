import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSkillMapOverview } from '@/api/queries'
import DailyWorkHistory, {
  type DailyWorkActivity,
  type DailyWorkAlgorithm,
} from './DailyWorkHistory'
import { viewerTimeZone } from '@/shared/lib/dailyWork'
import CompetencySection from './competency/CompetencySection'
import { SNAP_PAUSED, pauseJourneySnap as pauseSnap, resumeSnapOnScrollInput } from './snapPause'
import TopNav from '@/app/TopNav'

// three.js is large; load the score terrain only when this page renders it.
const CompetencyTerrain = lazy(() => import('./terrain/CompetencyTerrain'))

type SkillMapOverview = {
  algorithms: DailyWorkAlgorithm[]
  ghostRepActivity: DailyWorkActivity
}

const INTERACTIVE_SELECTOR = 'a, button, input, textarea, select, summary, [contenteditable="true"], [role="button"], [role="link"], [role="option"], [role="menuitem"], [role="tab"], [role="gridcell"]'

// The activity grid shows a year, like a contribution graph.
const ACTIVITY_DAYS = 365

const latestActiveDate =(activity: DailyWorkActivity) =>
  [...activity.days].reverse().find(day => day.segments.some(segment => segment.count > 0))?.date ?? null

export default function JourneyPage() {
  const overviewQuery = useSkillMapOverview<SkillMapOverview>(ACTIVITY_DAYS, viewerTimeZone())
  const skillMapOverview = overviewQuery.error ? null : overviewQuery.data ?? null
  const skillMapOverviewError = overviewQuery.error ? 'Daily work history is unavailable right now.' : ''
  const loading = overviewQuery.isFetching
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // Algorithm slugs the submissions are filtered to (or, with no day, whose days are highlighted).
  const [selectedAlgorithms, setSelectedAlgorithms] = useState<string[]>([])

  // Choosing a day starts fresh: all of that day's submissions. Clicking it again clears just the
  // day, so any chosen algorithms carry on across the year.
  const selectDate = (date: string) => {
    pauseSnap()
    if (date === selectedDate) {
      setSelectedDate(null)
      return
    }
    setSelectedDate(date)
    setSelectedAlgorithms([])
  }
  const toggleAlgorithm = (slug: string) => {
    pauseSnap()
    setSelectedAlgorithms(current => (current.includes(slug) ? current.filter(item => item !== slug) : [...current, slug]))
  }
  const clearAlgorithms = () => {
    pauseSnap()
    setSelectedAlgorithms([])
  }
  // A practised day in an expanded competency row: that day's submissions for that algorithm.
  const openDay = (date: string, slug: string) => {
    pauseSnap()
    setSelectedDate(date)
    setSelectedAlgorithms([slug])
    requestAnimationFrame(() => document.querySelector('.submission-detail')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  // Sections snap into view instead of free-scrolling (styles keyed off this class).
  useEffect(() => {
    document.documentElement.classList.add('journey-snap')
    return () => document.documentElement.classList.remove('journey-snap', SNAP_PAUSED)
  }, [])

  // A selection resizes the submission list, which would re-snap the page; see snapPause.
  useEffect(resumeSnapOnScrollInput, [])

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

  // Enter starts practice, unless it is pressing a focused control (a day, a filter, a field).
  const navigate = useNavigate()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Enter'
        || event.repeat
        || event.isComposing
        || event.defaultPrevented
        || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
      ) return
      if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return
      event.preventDefault()
      navigate('/practice')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

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
      <TopNav pinned solid={navSolid} />
      <Suspense
        fallback={(
          <section className="signal-hologram" aria-label="Competency terrain">
            <p className="section-meta signal-hologram-loading">Mapping competency…</p>
          </section>
        )}
      >
        <CompetencyTerrain />
      </Suspense>
      <CompetencySection onSelect={openDay} />
      <DailyWorkHistory
        activity={skillMapOverview?.ghostRepActivity}
        algorithmOrder={skillMapOverview?.algorithms ?? []}
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        selectedAlgorithms={selectedAlgorithms}
        onToggleAlgorithm={toggleAlgorithm}
        onClearAlgorithms={clearAlgorithms}
        loading={loading}
      />
      {skillMapOverviewError && <p className="coach-error">{skillMapOverviewError}</p>}
    </div>
  )
}
