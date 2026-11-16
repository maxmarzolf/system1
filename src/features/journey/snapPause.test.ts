import { afterEach, describe, expect, it } from 'vitest'
import { SNAP_PAUSED, pauseJourneySnap, resumeSnapOnScrollInput } from './snapPause'

const paused = () => document.documentElement.classList.contains(SNAP_PAUSED)

afterEach(() => document.documentElement.classList.remove(SNAP_PAUSED))

describe('snapPause', () => {
  it('pauses snapping until the next wheel, touch or scrolling key', () => {
    const cleanup = resumeSnapOnScrollInput()
    for (const resume of [
      () => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 })),
      () => window.dispatchEvent(new Event('touchstart')),
      () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' })),
    ]) {
      pauseJourneySnap()
      expect(paused()).toBe(true)
      resume()
      expect(paused()).toBe(false)
    }
    pauseJourneySnap()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })) // not a scrolling key
    expect(paused()).toBe(true)
    cleanup()
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }))
    expect(paused()).toBe(true) // listeners removed
  })
})
