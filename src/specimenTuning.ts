export type SpecimenTypeHints = 'omit' | 'include'
export type SpecimenComments = 'omit' | 'brief'
export type SpecimenVariableNames = 'readable' | 'concise' | 'descriptive'

export type SpecimenTuning = {
  typeHints: SpecimenTypeHints
  comments: SpecimenComments
  variableNames: SpecimenVariableNames
}

export const SPECIMEN_TUNING_STORAGE_KEY = 'system1-specimen-tuning-v1'

export const defaultSpecimenTuning: SpecimenTuning = {
  typeHints: 'omit',
  comments: 'omit',
  variableNames: 'readable',
}

const SPECIMEN_TYPE_HINTS: readonly SpecimenTypeHints[] = ['omit', 'include']
const SPECIMEN_COMMENTS: readonly SpecimenComments[] = ['omit', 'brief']
const SPECIMEN_VARIABLE_NAMES: readonly SpecimenVariableNames[] = ['readable', 'concise', 'descriptive']

const isSpecimenTypeHints = (value: unknown): value is SpecimenTypeHints =>
  typeof value === 'string' && SPECIMEN_TYPE_HINTS.includes(value as SpecimenTypeHints)

const isSpecimenComments = (value: unknown): value is SpecimenComments =>
  typeof value === 'string' && SPECIMEN_COMMENTS.includes(value as SpecimenComments)

const isSpecimenVariableNames = (value: unknown): value is SpecimenVariableNames =>
  typeof value === 'string' && SPECIMEN_VARIABLE_NAMES.includes(value as SpecimenVariableNames)

export const loadStoredSpecimenTuning = (): SpecimenTuning => {
  if (typeof window === 'undefined') return defaultSpecimenTuning

  try {
    const raw = window.localStorage.getItem(SPECIMEN_TUNING_STORAGE_KEY)
    if (!raw) return defaultSpecimenTuning

    const parsed = JSON.parse(raw) as Partial<SpecimenTuning>
    return {
      ...defaultSpecimenTuning,
      ...parsed,
      typeHints: isSpecimenTypeHints(parsed.typeHints) ? parsed.typeHints : defaultSpecimenTuning.typeHints,
      comments: isSpecimenComments(parsed.comments) ? parsed.comments : defaultSpecimenTuning.comments,
      variableNames: isSpecimenVariableNames(parsed.variableNames)
        ? parsed.variableNames
        : defaultSpecimenTuning.variableNames,
    }
  } catch {
    return defaultSpecimenTuning
  }
}

export const saveStoredSpecimenTuning = (tuning: SpecimenTuning) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SPECIMEN_TUNING_STORAGE_KEY, JSON.stringify(tuning))
}
