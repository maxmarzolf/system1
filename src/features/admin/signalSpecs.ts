import { api, unwrap } from '@/api/client'

export type SignalDefinition = {
  key: string
  label: string
  kind: 'score' | 'boolean'
  role: 'dimension' | 'modifier'
  weight: number
  guidance: string
  variationStrategy: string
  axis: 'fidelity' | 'executable' | 'fluency' | null
}

export type SignalSpec = {
  algorithm: string
  version: number
  signals: SignalDefinition[]
  structuralElements: string[]
}

export type AlgorithmSignalSpec = {
  slug: string
  name: string
  usesDefault: boolean
  seeded: boolean
  spec: SignalSpec
}

export type SignalSpecCatalog = {
  default: SignalSpec
  algorithms: AlgorithmSignalSpec[]
}

export async function fetchSignalSpecCatalog(signal?: AbortSignal): Promise<SignalSpecCatalog> {
  const result = await api.GET('/api/catalog/signal-specs', { signal })
  return unwrap(result, `Signal specs unavailable (${result.response.status})`) as unknown as SignalSpecCatalog
}
