import { api, ApiError, unwrap } from '@/api/client'

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

/** Admin calls fail with an ApiError; 422s carry per-field messages in `fieldErrors`. */
export { ApiError as SignalAdminError }

export const fetchSignalAdminCatalog = async (signal?: AbortSignal) =>
  unwrap(await api.GET('/api/admin/signals', { signal })) as unknown as SignalAdminCatalog

export const createSignal = async (draft: SignalDraft) =>
  unwrap(await api.POST('/api/admin/signals', { body: draft })) as unknown as AdminSignal

export const updateSignal = async (key: string, draft: SignalDraft, version: number) =>
  unwrap(
    await api.PUT('/api/admin/signals/{key}', { params: { path: { key } }, body: { ...draft, version } }),
  ) as unknown as AdminSignal

export const setSignalArchived = async (key: string, archived: boolean, version: number) => {
  const options = { params: { path: { key } }, body: { version } }
  const result = archived
    ? await api.POST('/api/admin/signals/{key}/archive', options)
    : await api.POST('/api/admin/signals/{key}/restore', options)
  return unwrap(result) as unknown as AdminSignal
}

export const updateDirective = async (
  directive: Pick<CorrectnessDirective, 'instructions' | 'criteria' | 'correctnessWeight' | 'version'>,
) => unwrap(await api.PUT('/api/admin/signals/directive/mcq', { body: directive })) as unknown as CorrectnessDirective

export const fetchSignalRevisions = async (subject: string) =>
  unwrap(
    await api.GET('/api/admin/signals/revisions/{subject}', { params: { path: { subject } } }),
  ) as unknown as SignalRevision[]

export const fetchMcqSamples = async () =>
  unwrap(await api.GET('/api/admin/signals/samples')) as unknown as McqSample[]

export const trySignal = async (draft: SignalDraft, problemId: string, choiceId: string) =>
  unwrap(await api.POST('/api/admin/signals/try', { body: { draft, problemId, choiceId } })) as unknown as SignalTryResult

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
