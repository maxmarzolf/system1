import { useEffect, useEffectEvent, useRef } from 'react'

/** Two presses of the same Cmd/Ctrl + arrow within this window count as a double tap. */
export const DOUBLE_TAP_WINDOW_MS = 350

type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

/** The event came from somewhere the user types: a field, a select, or an editor. */
export const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement
  && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null)

/**
 * Calls `onDoubleTap` when Cmd/Ctrl + one of `keys` is pressed twice in quick succession.
 * Outside text fields every Cmd/Ctrl + arrow in `keys` is swallowed, so the browser's own
 * shortcut (Back/Forward, scroll to top/bottom) never fires; inside one the first press still
 * moves the caret.
 */
export function useDoubleTapArrows(keys: readonly ArrowKey[], onDoubleTap: (key: ArrowKey) => void, enabled = true) {
  const lastPress = useRef<{ key: string; pressedAt: number } | null>(null)
  const fire = useEffectEvent((key: ArrowKey) => onDoubleTap(key))
  const keyList = keys.join(',')

  useEffect(() => {
    if (!enabled) return
    const watched = new Set(keyList.split(','))
    const handler = (event: KeyboardEvent) => {
      if (
        event.repeat
        || event.isComposing
        || !watched.has(event.key)
        || (!event.metaKey && !event.ctrlKey)
        || event.altKey
        || event.shiftKey
      ) return
      if (!isEditableTarget(event.target)) event.preventDefault()
      const now = performance.now()
      const previous = lastPress.current
      const doubleTapped = previous?.key === event.key && now - previous.pressedAt <= DOUBLE_TAP_WINDOW_MS
      lastPress.current = doubleTapped ? null : { key: event.key, pressedAt: now }
      if (!doubleTapped) return
      event.preventDefault()
      fire(event.key as ArrowKey)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [enabled, keyList])
}
