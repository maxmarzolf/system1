import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/api/client'
import { providerDisplayLabel, useConfiguredProviderLabel } from './llmProviderDefault'
import { mockFetch } from '@/test/fetch'

describe('provider default', () => {
  it('maps provider names to labels', () => {
    expect(providerDisplayLabel('claude')).toBe('Claude')
    expect(providerDisplayLabel('gemma')).toBe('Gemma')
    expect(providerDisplayLabel('openai')).toBe('OpenAI')
  })

  it('loads the configured provider and tolerates failures', async () => {
    mockFetch([{ match: '/api/coach/provider-default', body: { provider: 'claude' } }])
    const loaded = renderHook(() => useConfiguredProviderLabel())
    await waitFor(() => expect(loaded.result.current).toBe('Claude'))
    // A second component reuses the cached label instead of asking again.
    expect(renderHook(() => useConfiguredProviderLabel()).result.current).toBe('Claude')
    cleanup()
    queryClient.clear()

    mockFetch([{ match: '/api/coach/provider-default', status: 500 }])
    const failed = renderHook(() => useConfiguredProviderLabel())
    await waitFor(() => expect(failed.result.current).toBe('OpenAI'))

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const offline = renderHook(() => useConfiguredProviderLabel())
    offline.unmount()
    expect(offline.result.current).toBe('OpenAI')
  })
})
