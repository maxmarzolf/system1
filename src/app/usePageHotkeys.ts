import { useEffect, useEffectEvent, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { NAV_PAGES, PAGE_MOVE_DOUBLE_TAP_WINDOW_MS, navPageIndex } from './navPages'

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement
  && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null)

/**
 * Cmd/Ctrl + a double-tapped ← or → moves to the neighbouring page in navbar order.
 * Outside text fields every Cmd/Ctrl + arrow is swallowed so the browser's Back/Forward
 * shortcut never fires; inside one the first press still moves the caret.
 */
export function usePageHotkeys() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const lastPress = useRef<{ key: string; pressedAt: number } | null>(null)

  const move = useEffectEvent((key: string) => {
    const index = navPageIndex(pathname)
    if (index < 0) return
    const target = NAV_PAGES[index + (key === 'ArrowLeft' ? -1 : 1)]
    if (target) navigate(target.path)
  })

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.repeat
        || event.isComposing
        || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
        || (!event.metaKey && !event.ctrlKey)
        || event.altKey
        || event.shiftKey
      ) return
      if (!isEditable(event.target)) event.preventDefault()
      const now = performance.now()
      const previous = lastPress.current
      const doubleTapped = previous?.key === event.key && now - previous.pressedAt <= PAGE_MOVE_DOUBLE_TAP_WINDOW_MS
      lastPress.current = doubleTapped ? null : { key: event.key, pressedAt: now }
      if (!doubleTapped) return
      event.preventDefault()
      move(event.key)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])
}
