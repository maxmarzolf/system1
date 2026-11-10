import { useQuery } from '@tanstack/react-query'
import { api, queryClient, unwrap } from '@/api/client'

export const providerDisplayLabel = (provider: string): string => {
  if (provider === 'claude') return 'Claude'
  if (provider === 'gemma') return 'Gemma'
  return 'OpenAI'
}

/** The coach provider configured on the server, as a display label (OpenAI until it loads, or if it can't). */
export const useConfiguredProviderLabel = () => {
  const { data } = useQuery(
    {
      queryKey: ['coach', 'provider-default'],
      queryFn: async () => unwrap(await api.GET('/api/coach/provider-default')),
      staleTime: Infinity,
    },
    queryClient,
  )
  return data?.provider ? providerDisplayLabel(String(data.provider)) : 'OpenAI'
}
