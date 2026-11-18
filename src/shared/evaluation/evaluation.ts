/**
 * The stored evaluation every graded answer gets (backend: ``app/contracts/evaluation.py``),
 * read the same way everywhere. Types come from the generated API schema; the readers below
 * tolerate older records, which may lack the newer fields.
 */
import type { components } from '@/api/schema'

export type Evaluation = components['schemas']['Evaluation']
export type SubmitResponse = components['schemas']['AttemptSubmitResponse']

export type Verdict = 'sound' | 'close' | 'needs-work'
/** Who decided correctness (backend ``verdict.decide``). */
export type CorrectnessSource = 'jev' | 'deterministic' | 'deterministic-override' | 'deterministic-fallback'

export type SignalOutcome = {
  key: string
  label: string
  role: string
  status: string
  score: number | null
  raw: unknown
  note: string
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export const VERDICT_LABELS: Record<Verdict, string> = { sound: 'Sound', close: 'Close', 'needs-work': 'Needs work' }

export const CORRECTNESS_SOURCE_LABELS: Record<CorrectnessSource, string> = {
  jev: 'Graded by Jev',
  deterministic: 'Checked exactly (no Jev call)',
  'deterministic-override': 'Overridden by a code check',
  'deterministic-fallback': 'Jev unavailable: checked exactly instead',
}

export const FLAG_LABELS: Record<string, string> = {
  deterministic_override: 'Code check overrode Jev',
  jev_unavailable: 'Jev unavailable',
  answer_key_disagreement: 'Jev disagreed with the answer key',
  low_correctness_confidence: 'Low confidence',
  reference_from_client: 'Graded against the browser’s copy',
  feedback_unavailable: 'Written feedback unavailable',
}

export function verdictOf(evaluation: Evaluation | null | undefined): Verdict | null {
  const verdict = evaluation?.verdict
  return verdict === 'sound' || verdict === 'close' || verdict === 'needs-work' ? verdict : null
}

export function overallScore(evaluation: Evaluation | Record<string, unknown> | null | undefined): number | null {
  const overall = record(record(evaluation).score).overall
  return typeof overall === 'number' ? overall : null
}

export function correctnessSource(evaluation: Evaluation | null | undefined): CorrectnessSource | null {
  const source = record(evaluation?.correctness).source
  return typeof source === 'string' && source in CORRECTNESS_SOURCE_LABELS ? (source as CorrectnessSource) : null
}

/** Reasons a code answer was marked incorrect whatever Jev said (empty, not valid Python, no return). */
export function overrideReasons(evaluation: Evaluation | null | undefined): string[] {
  const overrides = record(evaluation?.correctness).overrides
  return Array.isArray(overrides) ? overrides.map((item) => String(record(item).message ?? record(item).key ?? '')).filter(Boolean) : []
}

export function flagsOf(evaluation: Evaluation | null | undefined): string[] {
  const flags = record(evaluation?.provenance).flags
  return Array.isArray(flags) ? flags.map(String) : []
}

/** Every signal's outcome, scored ones first. */
export function signalOutcomes(evaluation: Evaluation | null | undefined): SignalOutcome[] {
  return Object.entries(record(evaluation?.signalResults))
    .map(([key, raw]) => {
      const value = record(raw)
      return {
        key,
        label: String(value.label || key),
        role: String(value.role ?? ''),
        status: String(value.status ?? ''),
        score: typeof value.score === 'number' ? value.score : null,
        raw: value.raw ?? null,
        note: String(value.note ?? ''),
      }
    })
    .sort((a, b) => Number(a.status !== 'scored') - Number(b.status !== 'scored'))
}

/** The written feedback (present only when the feedback step ran). */
export function feedbackText(evaluation: Evaluation | null | undefined, field: string): string {
  const value = record(evaluation?.feedback)[field]
  return typeof value === 'string' ? value.trim() : ''
}
