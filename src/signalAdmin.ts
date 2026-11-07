import { apiUrl } from './api'

export type SignalPrimitive = 'choice' | 'score' | 'noul'
export type SignalRole = 'dimension' | 'modifier' | 'diagnostic'
export type SignalAxis = 'fidelity' | 'executable' | 'fluency'
export type SignalAppliesWhen = 'always' | 'correct' | 'incorrect'
export type SignalSource = 'jev' | 'deterministic'

// Choice: label -> description; Score: ordered levels; Noul: optional outcome descriptions.
export type SignalCriteria = Record<string, string | null> | string[] | null

export type SignalDraft = {
  key: string
  label: string
  // For admins only; never sent to Jev.
  description: string
  scope: string
  source: SignalSource
  primitive: SignalPrimitive | null
  implementation: string | null
  instructions: string
  criteria: SignalCriteria
  scoreMap: Record<string, number>
  role: SignalRole
  axis: SignalAxis | null
  appliesWhen: SignalAppliesWhen
  needsCorrectness: boolean
  weight: number
  displayOrder: number
}

export type AdminSignal = SignalDraft & {
  modality: string
  status: 'active' | 'archived'
  version: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  jevQuestion: Record<string, unknown> | null
  effectiveShare: number
}

export type CorrectnessDirective = {
  modality: string
  instructions: string
  criteria: Record<string, string>
  correctnessWeight: number
  version: number
  updatedAt: string
  labels: string[]
  weightShare: number
}

export type SignalAdminCatalog = {
  modality: string
  stateFields: string[]
  directive: CorrectnessDirective
  signals: AdminSignal[]
  algorithms: { slug: string; name: string }[]
  implementations: { name: string; label: string; description: string }[]
}

export type SignalRevision = {
  id: number
  subject: string
  action: 'seed' | 'create' | 'update' | 'archive' | 'restore'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  createdAt: string
}

export type McqSample = {
  id: string
  question: string
  choices: { id: string; text: string }[]
  correctChoiceId: string
}

export type SignalTryResult = {
  state: Record<string, unknown>
  answeredCorrectly: boolean
  applies: boolean
  question: Record<string, unknown> | null
  answer: Record<string, unknown> | null
  result: { status: string; raw: unknown; score: number | null; confidence: number | null; note: string }
  model?: string
  requestId?: string
}

export class SignalAdminError extends Error {
  status: number
  code: string
  fieldErrors: Record<string, string>

  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    let detail: { code?: string; message?: string; errors?: Record<string, string> } = {}
    try {
      const body = (await response.json()) as { detail?: unknown }
      detail = typeof body.detail === 'object' && body.detail ? body.detail as typeof detail : { message: String(body.detail ?? '') }
    } catch {
      // Non-JSON error body.
    }
    throw new SignalAdminError(
      response.status,
      detail.code ?? 'error',
      detail.message || `Request failed (${response.status})`,
      detail.errors ?? {},
    )
  }
  return (await response.json()) as T
}

export const fetchSignalAdminCatalog = (signal?: AbortSignal) =>
  request<SignalAdminCatalog>('/api/admin/signals', { signal })

export const createSignal = (draft: SignalDraft) =>
  request<AdminSignal>('/api/admin/signals', { method: 'POST', body: JSON.stringify(draft) })

export const updateSignal = (key: string, draft: SignalDraft, version: number) =>
  request<AdminSignal>(
    `/api/admin/signals/${encodeURIComponent(key)}`,
    { method: 'PUT', body: JSON.stringify({ ...draft, version }) },
  )

export const setSignalArchived = (key: string, archived: boolean, version: number) =>
  request<AdminSignal>(
    `/api/admin/signals/${encodeURIComponent(key)}/${archived ? 'archive' : 'restore'}`,
    { method: 'POST', body: JSON.stringify({ version }) },
  )

export const updateDirective = (
  directive: Pick<CorrectnessDirective, 'instructions' | 'criteria' | 'correctnessWeight' | 'version'>,
) => request<CorrectnessDirective>('/api/admin/signals/directive/mcq', { method: 'PUT', body: JSON.stringify(directive) })

export const fetchSignalRevisions = (subject: string) =>
  request<SignalRevision[]>(`/api/admin/signals/revisions/${encodeURIComponent(subject)}`)

export const fetchMcqSamples = () => request<McqSample[]>('/api/admin/signals/samples')

export const trySignal = (draft: SignalDraft, problemId: string, choiceId: string) =>
  request<SignalTryResult>(
    '/api/admin/signals/try',
    { method: 'POST', body: JSON.stringify({ draft, problemId, choiceId }) },
  )

export const emptySignalDraft = (): SignalDraft => ({
  key: '',
  label: '',
  description: '',
  scope: 'general',
  source: 'jev',
  primitive: 'noul',
  implementation: null,
  instructions: '',
  criteria: null,
  scoreMap: {},
  role: 'dimension',
  axis: null,
  appliesWhen: 'always',
  needsCorrectness: false,
  weight: 0.1,
  displayOrder: 0,
})

export const draftFromSignal = (signal: AdminSignal): SignalDraft => ({
  key: signal.key,
  label: signal.label,
  description: signal.description ?? '',
  scope: signal.scope,
  source: signal.source,
  primitive: signal.primitive,
  implementation: signal.implementation,
  instructions: signal.instructions,
  criteria: signal.criteria,
  scoreMap: signal.scoreMap ?? {},
  role: signal.role,
  axis: signal.axis,
  appliesWhen: signal.appliesWhen,
  needsCorrectness: signal.needsCorrectness,
  weight: signal.weight,
  displayOrder: signal.displayOrder,
})

/** The question this draft sends to Jev (mirrors the backend's JevSignal.question). */
export const jevQuestionFor = (draft: SignalDraft): Record<string, unknown> | null => {
  if (draft.source !== 'jev' || !draft.primitive) return null
  if (draft.primitive === 'choice') {
    return { type: 'choice', instructions: draft.instructions, criteria: draft.criteria ?? {} }
  }
  if (draft.primitive === 'score') {
    return { type: 'score', instructions: draft.instructions, criteria: Array.isArray(draft.criteria) ? draft.criteria : [] }
  }
  const outcomes = !Array.isArray(draft.criteria) && draft.criteria ? draft.criteria : {}
  const described = Object.fromEntries(
    (['true', 'false'] as const).filter((key) => outcomes[key]).map((key) => [key, outcomes[key]]),
  )
  return Object.keys(described).length
    ? { type: 'noul', instructions: draft.instructions, criteria: described }
    : { type: 'noul', instructions: draft.instructions }
}
