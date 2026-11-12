/** Loose-record access and formatting shared by the submission detail views. */

export type LooseRecord = Record<string, unknown>

export const asRecord = (value: unknown): LooseRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}

export const asRecords = (value: unknown): LooseRecord[] =>
  Array.isArray(value) ? value.filter((item): item is LooseRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []

export const formatLatency = (value: unknown) =>
  typeof value === 'number' ? (value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`) : null
