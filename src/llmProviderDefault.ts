import { useEffect, useState } from 'react'
import { apiUrl } from './api'

type CoachProviderDefaultResponse = {
  provider: string
}

export const providerDisplayLabel = (provider: string): string => {
  if (provider === 'claude') return 'Claude'
  if (provider === 'gemma') return 'Gemma'
  return 'OpenAI'
}

export const useConfiguredProviderLabel = () => {
  const [configuredProviderLabel, setConfiguredProviderLabel] = useState('OpenAI')

  useEffect(() => {
    let cancelled = false

    const loadProviderDefault = async () => {
      try {
        const response = await fetch(apiUrl('/api/coach/provider-default'))
        if (!response.ok) return
        const payload = (await response.json()) as CoachProviderDefaultResponse
        if (cancelled) return
        setConfiguredProviderLabel(providerDisplayLabel(payload.provider))
      } catch {
        // Keep fallback label when endpoint is unavailable.
      }
    }

    void loadProviderDefault()
    return () => {
      cancelled = true
    }
  }, [])

  return configuredProviderLabel
}
