import { storedSetting } from './storedSetting'

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

const validOrder = (order: unknown) => (isGooglePlaylistOrder(order) ? order : defaultGooglePlaylistTuning.order)

export const googlePlaylistTuningSetting = storedSetting<GooglePlaylistTuning>(
  GOOGLE_PLAYLIST_TUNING_STORAGE_KEY,
  defaultGooglePlaylistTuning,
  (parsed) => ({ ...defaultGooglePlaylistTuning, order: validOrder(parsed.order) }),
  (tuning) => ({ ...tuning, order: validOrder(tuning.order) }),
)

export const loadStoredGooglePlaylistTuning = googlePlaylistTuningSetting.load
export const saveStoredGooglePlaylistTuning = googlePlaylistTuningSetting.save
