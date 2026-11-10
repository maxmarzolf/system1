/**
 * Read queries shared by pages. Each hook caches by its key, so two components asking for the
 * same data make one request. The hooks pass `queryClient` explicitly, so they also work in a
 * component rendered without a provider (tests, isolated widgets).
 */
import { useQuery } from '@tanstack/react-query'
import { viewerTimeZone } from '@/shared/lib/dailyWork'
import { api, queryClient, unwrap } from './client'

export const queryKeys = {
  skillMap: ['skill-map'] as const,
  skillMapOverview: (historyDays: number | null, tz: string | null) => ['skill-map-overview', historyDays, tz] as const,
  catalogPlaylists: ['catalog', 'playlists'] as const,
  historyDay: (date: string, tz: string) => ['history', 'day', date, tz] as const,
  signalHistory: (tz: string) => ['history', 'signals', tz] as const,
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

export function useHistoryDay<T>(date: string | null) {
  const tz = viewerTimeZone()
  return useQuery(
    {
      queryKey: queryKeys.historyDay(date ?? '', tz),
      queryFn: async ({ signal }) => {
        const result = await api.GET('/api/history/day', { params: { query: { date: date ?? '', tz } }, signal })
        return unwrap(result, `Unable to load this day (${result.response.status})`) as unknown as T
      },
      enabled: Boolean(date),
    },
    queryClient,
  )
}

export function useSignalHistory<T>() {
  const tz = viewerTimeZone()
  return useQuery(
    {
      queryKey: queryKeys.signalHistory(tz),
      queryFn: async ({ signal }) => {
        const result = await api.GET('/api/history/signals', { params: { query: { tz } }, signal })
        return unwrap(result, `Signal history unavailable (${result.response.status})`) as unknown as T
      },
    },
    queryClient,
  )
}
