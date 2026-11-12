import { useEffect, useEffectEvent, type RefObject } from 'react'
import { matchesHotkey } from '@/shared/lib/hotkeys'
import { INLINE_FEEDBACK_ENABLED } from '../lib/types'

/**
 * The practice card's keyboard shortcuts: Mod+Shift+Enter runs the card's action (start or submit
 * Recall, Ghost and MCQ, which have no button). Mod+Enter presses the visible button or advances
 * a submitted Recall/Ghost flow stage. The remaining keys toggle recall support.
 * Card navigation and the flow stage hotkeys live with the session and flow hooks.
 */
export function usePracticeHotkeys({
  primaryButtonRef,
  onSubmitKey,
  onHiddenPrimaryKey,
  recallActive,
  flowActive,
  onToggleAiCompletion,
  onToggleGhostReps,
  onToggleInline,
}: {
  primaryButtonRef: RefObject<HTMLButtonElement | null>
  /** Mod+Shift+Enter: run the card's primary action, button or not. */
  onSubmitKey: () => void
  /** Mod+Enter: handle a keyboard-only Flow Next when there is no button. */
  onHiddenPrimaryKey: () => boolean
  /** Recall is on screen; the support toggles only apply to it. */
  recallActive: boolean
  /** Ghost Reps and Inline are fixed by the flow while one runs. */
  flowActive: boolean
  onToggleAiCompletion: () => void
  onToggleGhostReps: () => void
  onToggleInline: () => void
}) {
  const onSubmit = useEffectEvent(() => onSubmitKey())
  const onHiddenPrimary = useEffectEvent(() => onHiddenPrimaryKey())
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || !matchesHotkey(event, 'submit-card')) return
      event.preventDefault()
      event.stopPropagation()
      onSubmit()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.shiftKey || !matchesHotkey(event, 'primary-card-action')) return
      const button = primaryButtonRef.current
      if (button) {
        if (button.disabled) return
        event.preventDefault()
        event.stopPropagation()
        button.click()
        return
      }
      if (!onHiddenPrimary()) return
      event.preventDefault()
      event.stopPropagation()
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
