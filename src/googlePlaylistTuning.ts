export type GooglePlaylistOrder = 'curated' | 'google-15' | 'solution-length' | 'family' | 'difficulty' | 'mastery'

export type GooglePlaylistTuning = {
  order: GooglePlaylistOrder
}

export const GOOGLE_PLAYLIST_TUNING_STORAGE_KEY = 'system1-google-playlist-tuning-v1'

export const defaultGooglePlaylistTuning: GooglePlaylistTuning = {
  order: 'mastery',
}

const GOOGLE_PLAYLIST_ORDERS: readonly GooglePlaylistOrder[] = [
  'curated',
  'google-15',
  'solution-length',
  'family',
  'difficulty',
  'mastery',
]

const isGooglePlaylistOrder = (value: unknown): value is GooglePlaylistOrder =>
  typeof value === 'string' && GOOGLE_PLAYLIST_ORDERS.includes(value as GooglePlaylistOrder)

export const loadStoredGooglePlaylistTuning = (): GooglePlaylistTuning => {
  if (typeof window === 'undefined') return defaultGooglePlaylistTuning

  try {
    const raw = window.localStorage.getItem(GOOGLE_PLAYLIST_TUNING_STORAGE_KEY)
    if (!raw) return defaultGooglePlaylistTuning

    const parsed = JSON.parse(raw) as Partial<GooglePlaylistTuning>
    return {
      ...defaultGooglePlaylistTuning,
      order: isGooglePlaylistOrder(parsed.order) ? parsed.order : defaultGooglePlaylistTuning.order,
    }
  } catch {
    return defaultGooglePlaylistTuning
  }
}

export const saveStoredGooglePlaylistTuning = (tuning: GooglePlaylistTuning) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    GOOGLE_PLAYLIST_TUNING_STORAGE_KEY,
    JSON.stringify({
      ...tuning,
      order: isGooglePlaylistOrder(tuning.order) ? tuning.order : defaultGooglePlaylistTuning.order,
    }),
  )
}
