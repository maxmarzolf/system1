import type { AdminSignal, SignalAdminCatalog, SignalAppliesWhen, SignalDraft, SignalPrimitive, SignalRole } from './api'

export type FieldErrors = Record<string, string>

export const PRIMITIVE_LABELS: Record<SignalPrimitive, string> = {
  choice: 'Choice — pick one label',
  score: 'Score — ordered levels',
  noul: 'Noul — yes probability',
}
export const ROLE_LABELS: Record<SignalRole, string> = {
  dimension: 'Dimension (scored)',
  modifier: 'Modifier (scored)',
  diagnostic: 'Diagnostic (recorded, not scored)',
}
export const APPLIES_LABELS: Record<SignalAppliesWhen, string> = {
  always: 'Always',
  correct: 'Correct answers only',
  incorrect: 'Incorrect answers only',
}

export const formatShare = (share: number) => `${Math.round(share * 1000) / 10}%`

export const describeResponse = (draft: SignalDraft) => {
  if (draft.source === 'deterministic') return `computed: ${draft.implementation ?? '—'}`
  if (draft.primitive === 'score') return `Score 0–${Math.max((Array.isArray(draft.criteria) ? draft.criteria.length : 1) - 1, 0)}`
  if (draft.primitive === 'choice') {
    const labels = draft.criteria && !Array.isArray(draft.criteria) ? Object.keys(draft.criteria) : []
    return `Choice (${labels.length} labels)`
  }
  return 'Noul'
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong'
}

export type ChoiceRow = { label: string; description: string; score: string }

/** The collapsed card's middle line: what Jev is asked, or what the code computes. */
export const signalSummaryText = (signal: AdminSignal, catalog: SignalAdminCatalog) => {
  if (signal.source === 'deterministic') {
    const implementation = catalog.implementations.find((item) => item.name === signal.implementation)
    return `Computed in code${implementation?.description ? `: ${implementation.description}` : '.'}`
  }
  return signal.instructions || 'No instructions yet.'
}
