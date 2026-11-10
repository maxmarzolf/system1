import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'

/**
 * A per-browser setting kept in localStorage. Storage can be empty, corrupt or blocked
 * (private windows, cleared site data), so `load` always falls back to the defaults and
 * `save` never throws.
 */
export type StoredSetting<T> = {
  key: string
  defaults: T
  load: () => T
  save: (value: T) => void
}

/**
 * `normalize` turns whatever was stored into a valid setting (fill gaps from the defaults,
 * reject unknown values); `serialize` shapes what is written (defaults to the value itself).
 */
export function storedSetting<T>(
  key: string,
  defaults: T,
  normalize: (stored: Partial<T>) => T,
  serialize: (value: T) => unknown = (value) => value,
): StoredSetting<T> {
  return {
    key,
    defaults,
    load: () => {
      if (typeof window === 'undefined') return defaults
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return defaults
        const parsed: unknown = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? normalize(parsed as Partial<T>) : defaults
      } catch {
        return defaults
      }
    },
    save: (value) => {
      if (typeof window === 'undefined') return
      try {
        window.localStorage.setItem(key, JSON.stringify(serialize(value)))
      } catch {
        // Storage is unavailable; the setting lasts until the page reloads.
      }
    },
  }
}

/** React state backed by a stored setting: loads once, saves on every change. */
export function useStoredSetting<T>(setting: StoredSetting<T>): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(setting.load)
  useEffect(() => {
    setting.save(value)
  }, [setting, value])
  return [value, setValue]
}
