/**
 * Journey snaps whole sections into view (mandatory scroll snapping), and the browser re-snaps
 * whenever a section's height changes. Anything that resizes a section on click (filtering the
 * submissions, expanding a competency row) pauses snapping; the next scroll input resumes it.
 */
export const SNAP_PAUSED = 'journey-snap-paused'

const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '])

export const pauseJourneySnap = () => document.documentElement.classList.add(SNAP_PAUSED)

/** Resume snapping on the next wheel, touch or scrolling key; returns the cleanup. */
export function resumeSnapOnScrollInput(): () => void {
  const resume = () => document.documentElement.classList.remove(SNAP_PAUSED)
  const onKey = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key)) resume()
  }
  window.addEventListener('wheel', resume, { passive: true })
  window.addEventListener('touchstart', resume, { passive: true })
  window.addEventListener('keydown', onKey)
  return () => {
    window.removeEventListener('wheel', resume)
    window.removeEventListener('touchstart', resume)
    window.removeEventListener('keydown', onKey)
  }
}
