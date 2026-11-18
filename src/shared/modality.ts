/**
 * The practice modalities, one vocabulary for the whole app. The ids match the backend's
 * (submissions, signals, evaluations); labels and order are how the UI names and lists them.
 */
export const MODALITIES = ['mcq', 'total-recall', 'ghost-rep', 'microdrill', 'ladder'] as const

export type Modality = (typeof MODALITIES)[number]

export const MODALITY_LABELS: Record<Modality, string> = {
  mcq: 'MCQ',
  'total-recall': 'Total Recall',
  'ghost-rep': 'Ghost',
  microdrill: 'Microdrill',
  ladder: 'Ladder',
}

export const isModality = (value: unknown): value is Modality =>
  typeof value === 'string' && (MODALITIES as readonly string[]).includes(value)

/** A label for any modality id, including ones this build doesn't know (older records). */
export const modalityLabel = (value: string) => (isModality(value) ? MODALITY_LABELS[value] : value)
