import { useEffect, useEffectEvent, type RefObject } from 'react'
import { matchesHotkey } from '../../hotkeys'
import { INLINE_FEEDBACK_ENABLED } from '../types'

/**
 * The practice card's keyboard shortcuts: the primary action (it presses the card's primary
 * button, so it always does what the button says) and the recall support toggles.
 * Card navigation and the flow stage hotkeys live with the session and flow hooks.
 */
export function usePracticeHotkeys({
  primaryButtonRef,
  recallActive,
  flowActive,
  onToggleAiCompletion,
  onToggleGhostReps,
  onToggleInline,
}: {
  primaryButtonRef: RefObject<HTMLButtonElement | null>
  /** Recall is on screen; the support toggles only apply to it. */
  recallActive: boolean
  /** Ghost Reps and Inline are fixed by the flow while one runs. */
  flowActive: boolean
  onToggleAiCompletion: () => void
  onToggleGhostReps: () => void
  onToggleInline: () => void
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.shiftKey || !matchesHotkey(event, 'primary-card-action')) return
      const button = primaryButtonRef.current
      if (!button || button.disabled) return
      event.preventDefault()
      event.stopPropagation()
      button.click()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [primaryButtonRef])

  const onSupportKey = useEffectEvent((event: KeyboardEvent) => {
    if (!recallActive) return
    if (matchesHotkey(event, 'toggle-ai-completion')) {
      event.preventDefault()
      onToggleAiCompletion()
      return
    }
    if (flowActive) return
    if (matchesHotkey(event, 'toggle-ghost-reps')) {
      event.preventDefault()
      onToggleGhostReps()
    }
    if (INLINE_FEEDBACK_ENABLED && matchesHotkey(event, 'toggle-inline-feedback')) {
      event.preventDefault()
      onToggleInline()
    }
  })
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onSupportKey(event)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
