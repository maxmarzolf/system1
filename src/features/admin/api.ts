import { api, ApiError, unwrap } from '@/api/client'
import type { Modality } from '@/shared/modality'
import type { PracticeSettings } from '@/api/queries'

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

export type CorrectnessSource = 'jev' | 'deterministic'

export type CorrectnessDirective = {
  modality: string
  instructions: string
  criteria: Record<string, string>
  correctnessWeight: number
  /** Who decides correctness: Jev, or the modality's own deterministic check (ghost reps). */
  correctnessSource: CorrectnessSource
  version: number
  updatedAt: string
  labels: string[]
  weightShare: number
}

export type SignalAdminCatalog = {
  modality: Modality
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

/** A stored item a draft can be tried against: an MCQ, a catalog problem, or a generated exercise. */
export type SignalSample = {
  id: string
  title: string
  prompt: string
  reference: string
  choices: { id: string; text: string }[]
  correctChoiceId: string | null
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

const path = (modality: Modality) => ({ params: { path: { modality } } })

export const fetchSignalAdminCatalog = async (modality: Modality, signal?: AbortSignal) =>
  unwrap(await api.GET('/api/admin/signals/{modality}', { ...path(modality), signal })) as unknown as SignalAdminCatalog

export const createSignal = async (modality: Modality, draft: SignalDraft) =>
  unwrap(await api.POST('/api/admin/signals/{modality}', { ...path(modality), body: draft })) as unknown as AdminSignal

export const updateSignal = async (modality: Modality, key: string, draft: SignalDraft, version: number) =>
  unwrap(
    await api.PUT('/api/admin/signals/{modality}/{key}', { params: { path: { modality, key } }, body: { ...draft, version } }),
  ) as unknown as AdminSignal

export const setSignalArchived = async (modality: Modality, key: string, archived: boolean, version: number) => {
  const options = { params: { path: { modality, key } }, body: { version } }
  const result = archived
    ? await api.POST('/api/admin/signals/{modality}/{key}/archive', options)
    : await api.POST('/api/admin/signals/{modality}/{key}/restore', options)
  return unwrap(result) as unknown as AdminSignal
}

export const updateDirective = async (
  modality: Modality,
  directive: Pick<CorrectnessDirective, 'instructions' | 'criteria' | 'correctnessWeight' | 'correctnessSource' | 'version'>,
) => unwrap(await api.PUT('/api/admin/signals/{modality}/directive', { ...path(modality), body: directive })) as unknown as CorrectnessDirective

/** ``subject`` is a signal key, or ``directive`` for the correctness question. */
export const fetchSignalRevisions = async (modality: Modality, subject: string) =>
  unwrap(
    await api.GET('/api/admin/signals/{modality}/revisions/{subject}', { params: { path: { modality, subject } } }),
  ) as unknown as SignalRevision[]

/** The Jev question a draft would send, built by the server (``null`` for deterministic signals). */
export const previewSignal = async (modality: Modality, draft: SignalDraft, signal?: AbortSignal) =>
  (unwrap(await api.POST('/api/admin/signals/{modality}/preview', { ...path(modality), body: { draft }, signal })) as unknown as {
    question: Record<string, unknown> | null
  }).question

export const fetchSignalSamples = async (modality: Modality) =>
  unwrap(await api.GET('/api/admin/signals/{modality}/samples', path(modality))) as unknown as SignalSample[]

/** MCQ: ``answer`` is a choice id. Code: the code to grade; ghost reps also take the target ``reference``. */
export const trySignal = async (modality: Modality, draft: SignalDraft, sampleId: string, answer: string, reference = '') =>
  unwrap(
    await api.POST('/api/admin/signals/{modality}/try', { ...path(modality), body: { draft, sampleId, answer, reference } }),
  ) as unknown as SignalTryResult

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


// ─── Server-side settings (grading, generation, practice) ───

export type GradingSettings = {
  feedbackModalities: Modality[]
  nearMissThreshold: number
  lowConfidenceThreshold: number
  competencyDecayPerDay: number
  competencyFreeFallDays: number
}

export type GenerationSettings = {
  specimen: { typeHints: 'omit' | 'include'; comments: 'omit' | 'brief'; variableNames: 'readable' | 'concise' | 'descriptive' }
  mcqModels: { claude: string; openai: string; gemma: string }
}

export type SettingsSection<T> = { value: T; version: number }

export type AdminSettings = {
  grading: SettingsSection<GradingSettings>
  generation: SettingsSection<GenerationSettings>
  practice: SettingsSection<PracticeSettings>
}

export type SettingsKey = keyof AdminSettings

export const fetchAdminSettings = async () => unwrap(await api.GET('/api/admin/settings')) as unknown as AdminSettings

export const saveSettingsSection = async <K extends SettingsKey>(section: K, value: AdminSettings[K]['value'], version: number) =>
  unwrap(
    await api.PUT('/api/admin/settings/{section}', { params: { path: { section } }, body: { value, version } }),
  ) as unknown as AdminSettings[K]

