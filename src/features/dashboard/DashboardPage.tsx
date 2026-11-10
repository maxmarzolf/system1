import { useNavigate } from 'react-router-dom'
import { useCatalogPlaylists, useSkillMapOverview } from '@/api/queries'
import { practicePlaylists, type PracticePlaylist } from '@/shared/data/playlists'
import { useConfiguredProviderLabel } from '@/shared/lib/llmProviderDefault'
import TopNav from '@/app/TopNav'
import DashboardCard from './DashboardCard'

type DimensionSummary = {
  verdictCounts?: Record<string, number>
}

type SkillMapModeReadiness = {
  readiness: number
  attemptCount: number
  ghostRepCount: number
  unsupportedAttemptCount: number
  workCount: number
  successfulAttempts: number
  successRate: number
  totalCards: number
  practicedCards: number
  untouchedCards: number
  staleCards: number
  lastSubmittedAt: string
  daysSinceLastSubmit: number | null
  stale: boolean
  dimensionSummary: DimensionSummary
}

type SkillMapAlgorithmReadiness = {
  algorithm: string
  slug: string
  skills: string[]
  overallReadiness: number
  overallAttemptCount: number
  ghostRepCount: number
  unsupportedAttemptCount: number
  workCount: number
  totalCards: number
  practicedCards: number
  untouchedCards: number
  staleCards: number
  dimensionSummary: DimensionSummary
  modes: Record<TemplateMode, SkillMapModeReadiness>
}

type SkillMapOverviewResponse = {
  algorithms: SkillMapAlgorithmReadiness[]
}

type PlaylistCatalogResponse = {
  playlists?: PracticePlaylist[]
}

type TemplateMode = 'algorithm'

const readinessTone = (readiness: number) => {
  if (readiness >= 80) return 'success'
  if (readiness >= 50) return 'warning'
  return 'error'
}

const isRetiredArraysHashMaps = (slug: string, title: string) =>
  slug === 'arrays-hash-maps' || title === 'Arrays / Hash Maps'

export default function DashboardPage() {
  const navigate = useNavigate()
  const overviewQuery = useSkillMapOverview<SkillMapOverviewResponse>()
  const overview = overviewQuery.error ? null : overviewQuery.data ?? null
  const loading = overviewQuery.isPending
  const error = overviewQuery.error ? 'Unable to load readiness tracking right now.' : ''
  // The local catalog stays the fallback when the API is unavailable or empty.
  const servedPlaylists = useCatalogPlaylists<PlaylistCatalogResponse>().data?.playlists
  const catalogPlaylists = Array.isArray(servedPlaylists) && servedPlaylists.length > 0 ? servedPlaylists : null
  const configuredProviderLabel = useConfiguredProviderLabel()

  const skillMapPlaylists = [...(catalogPlaylists ?? []), ...practicePlaylists]
    .filter((playlist, index, playlists) =>
      playlists.findIndex((candidate) => candidate.slug === playlist.slug) === index
    )
    .filter((playlist) => playlist.showOnSkillMap && !isRetiredArraysHashMaps(playlist.slug, playlist.title))
  const skillMapPlaylistSlugs = new Set(skillMapPlaylists.map((playlist) => playlist.slug))
  const algorithms = (overview?.algorithms ?? []).filter((node) =>
    !isRetiredArraysHashMaps(node.slug, node.algorithm) && !skillMapPlaylistSlugs.has(node.slug)
  )
  const dashboardCards = [
    ...skillMapPlaylists.map((playlist) => ({ kind: 'playlist' as const, title: playlist.title, playlist })),
    ...algorithms.map((node) => ({ kind: 'algorithm' as const, title: node.algorithm, node })),
  ].sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }))
  const launch = (params: Record<string, string>) => navigate(`/?${new URLSearchParams(params).toString()}`)
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return (
    <div className="app app-dashboard">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} pinned solid />

      <section className="dashboard">
        {error && <p className="skill-map-intro">{error}</p>}
        {loading && !error && <p className="skill-map-intro">Loading readiness overview...</p>}

        <div className="skill-map-grid">
          {dashboardCards.map((card) => {
            if (card.kind === 'playlist') {
              const { playlist } = card
              const tiers = new Set(playlist.questions.flatMap((question) => question.methods.filter((method) => method.startsWith('Tier ')))).size
              const patterns = new Set(playlist.questions.map((question) => question.coreShape)).size
              return (
                <DashboardCard
                  key={playlist.slug}
                  title={playlist.title}
                  badge="Playlist"
                  badgeTone="success"
                  stats={[count(playlist.questions.length, 'problem', 'problems'), tiers > 0 ? `${tiers} tiers` : 'Static', count(patterns, 'pattern', 'patterns')]}
                  slug={playlist.slug}
                  actionLabel="Start playlist"
                  onAction={() => launch({ playlist: playlist.slug })}
                />
              )
            }
            const { node } = card
            const isMeta = node.slug === 'meta'
            return (
              <DashboardCard
                key={node.slug}
                title={node.algorithm}
                badge={`${node.overallReadiness}%`}
                badgeTone={readinessTone(node.overallReadiness)}
                stats={[`${node.totalCards} ${isMeta ? 'meta questions' : 'core algorithms'}`, `${node.staleCards} stale`, `${node.ghostRepCount} Ghost Reps`]}
                slug={node.slug}
                actionLabel={isMeta ? 'Start playlist' : 'Start practice'}
                onAction={() => launch({ focusPattern: node.slug })}
              />
            )
          })}
        </div>

      </section>
    </div>
  )
}
