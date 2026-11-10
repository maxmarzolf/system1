import { describe, expect, it } from 'vitest'
import { fetchSignalSpecCatalog } from './signalSpecs'
import { mockFetch } from '@/test/fetch'

describe('signal specs', () => {
  it('fetches the catalog and reports failures', async () => {
    mockFetch([{ match: '/api/catalog/signal-specs', body: { default: {}, algorithms: [] } }])
    await expect(fetchSignalSpecCatalog()).resolves.toEqual({ default: {}, algorithms: [] })
    mockFetch([{ match: '/api/catalog/signal-specs', status: 500 }])
    await expect(fetchSignalSpecCatalog()).rejects.toThrow('Signal specs unavailable (500)')
  })
})
