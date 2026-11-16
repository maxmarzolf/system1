/**
 * Read queries shared by pages. Each hook caches by its key, so two components asking for the
 * same data make one request. The hooks pass `queryClient` explicitly, so they also work in a
 * component rendered without a provider (tests, isolated widgets).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { viewerTimeZone } from '@/shared/lib/dailyWork'
import { api, queryClient, unwrap } from './client'

export const queryKeys = {
  skillMap: ['skill-map'] as const,
  skillMapOverview: (historyDays: number | null, tz: string | null) => ['skill-map-overview', historyDays, tz] as const,
  catalogPlaylists: ['catalog', 'playlists'] as const,
  historySubmissions: (date: string | null, algorithms: string[], tz: string) => ['history', 'submissions', date, algorithms, tz] as const,
  competencyTerrain: (tz: string) => ['history', 'competency', tz] as const,
  practiceSettings: ['catalog', 'practice-settings'] as const,
}

export type McqFlowMode = 'random' | 'progressive'
export type PlaylistOrder = 'curated' | 'google-15' | 'solution-length' | 'family' | 'difficulty' | 'mastery'

/** What the practice screen asks for, set on /admin (server-side). */
export type PracticeSettings = {
  mcqQuestionCount: number
  mcqFlowMode: McqFlowMode
  playlistOrder: PlaylistOrder
}

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = { mcqQuestionCount: 5, mcqFlowMode: 'random', playlistOrder: 'mastery' }

export function usePracticeSettings() {
  return useQuery(
    {
      queryKey: queryKeys.practiceSettings,
      queryFn: async ({ signal }) =>
        unwrap(await api.GET('/api/catalog/practice-settings', { signal })) as unknown as PracticeSettings,
      staleTime: 60_000,
    },
    queryClient,
  )
}

/** Readiness and daily activity. `historyDays`/`tz` are omitted from the request when null. */
export function useSkillMapOverview<T>(historyDays: number | null = null, tz: string | null = null) {
  return useQuery(
    {
      queryKey: queryKeys.skillMapOverview(historyDays, tz),
      queryFn: async ({ signal }) => {
        const query = {
          ...(historyDays !== null ? { historyDays } : {}),
          ...(tz !== null ? { tz } : {}),
        }
        return unwrap(await api.GET('/api/skill-map-overview', { params: { query }, signal })) as unknown as T
      },
      // Keep showing the previous window while a new range loads.
      placeholderData: (previous) => previous,
    },
    queryClient,
  )
}

export function useCatalogPlaylists<T>() {
  return useQuery(
    {
      queryKey: queryKeys.catalogPlaylists,
      queryFn: async ({ signal }) => unwrap(await api.GET('/api/catalog/playlists', { signal })) as unknown as T,
      staleTime: 5 * 60_000,
    },
    queryClient,
  )
}

/** Algorithms and their skills (the taxonomy). */
export function useSkillMap<T>() {
  return useQuery(
    {
      queryKey: queryKeys.skillMap,
      queryFn: async ({ signal }) => unwrap(await api.GET('/api/skill-map', { signal })) as unknown as T,
      staleTime: 5 * 60_000,
    },
    queryClient,
  )
}

/** Submissions on a day, for some algorithms across the last year, or both (Journey). */
export function useHistorySubmissions(date: string | null, algorithms: string[]) {
  const tz = viewerTimeZone()
  return useQuery(
    {
      queryKey: queryKeys.historySubmissions(date, algorithms, tz),
      queryFn: async ({ signal }) => {
        const query = { tz, ...(date ? { date } : {}), ...(algorithms.length ? { algorithm: algorithms } : {}) }
        const result = await api.GET('/api/history/submissions', { params: { query }, signal })
        return unwrap(result, `Unable to load submissions (${result.response.status})`)
      },
      enabled: Boolean(date) || algorithms.length > 0,
      // Keep the last results on screen while the next selection loads, so the list never collapses.
      placeholderData: keepPreviousData,
    },
    queryClient,
  )
}

/** Competency per algorithm per day, computed by the backend (Journey's terrain). */
export function useCompetencyTerrain() {
  const tz = viewerTimeZone()
  return useQuery(
    {
      queryKey: queryKeys.competencyTerrain(tz),
      queryFn: async ({ signal }) => {
        const result = await api.GET('/api/history/competency', { params: { query: { tz } }, signal })
        return unwrap(result, `Competency terrain unavailable (${result.response.status})`)
      },
    },
    queryClient,
  )
}
