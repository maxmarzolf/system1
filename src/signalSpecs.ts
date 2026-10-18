import { apiUrl } from './api'

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

export type SignalSpecPreview = {
  source: 'problem' | 'skill-tag' | 'default'
  primaryPatternTag: string
  spec: SignalSpec
  assessorPayload: {
    signalGuidance: Record<string, string>
    systemPrompt: string
  }
}

export type SignalSpecPreviewRequest = {
  cardId: string
  generatedCardId?: string
  categoryTags: string[]
}

export async function fetchSignalSpecCatalog(signal?: AbortSignal): Promise<SignalSpecCatalog> {
  const response = await fetch(apiUrl('/api/catalog/signal-specs'), { signal })
  if (!response.ok) throw new Error(`Signal specs unavailable (${response.status})`)
  return (await response.json()) as SignalSpecCatalog
}

export async function fetchSignalSpecPreview(
  request: SignalSpecPreviewRequest,
  signal?: AbortSignal,
): Promise<SignalSpecPreview> {
  const response = await fetch(apiUrl('/api/catalog/signal-specs/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })
  if (!response.ok) throw new Error(`Signal spec preview unavailable (${response.status})`)
  return (await response.json()) as SignalSpecPreview
}
