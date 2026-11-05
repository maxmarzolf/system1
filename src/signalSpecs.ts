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

export type PluginSignal = {
  key: string
  label: string
  source: 'jev' | 'deterministic'
  role: 'dimension' | 'modifier' | 'diagnostic'
  axis: 'fidelity' | 'executable' | 'fluency' | null
  appliesWhen: 'always' | 'correct' | 'incorrect'
  needsCorrectness: boolean
  weight: number
  primitive?: 'choice' | 'score' | 'noul'
  instructions?: unknown
  criteria?: Record<string, unknown> | unknown[]
  scoreMap?: Record<string, number>
  description?: string
}

export type ModalitySignalSpec = {
  algorithm: string
  modality: string
  version: number
  hash: string
  correctnessWeight: number
  signals: PluginSignal[]
}

export type SignalSpecCatalog = {
  default: SignalSpec
  algorithms: AlgorithmSignalSpec[]
  modalitySpecs: Record<string, { default: ModalitySignalSpec; overrides: Record<string, ModalitySignalSpec> }>
}

export type JevPreview = {
  stateFields: string[]
  correctness: { id: string; type: 'choice'; instructions: string; criteria: Record<string, string> }
  spec: ModalitySignalSpec
}

export type SignalSpecPreview = {
  jev: JevPreview | null
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
  modality?: 'mcq'
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
