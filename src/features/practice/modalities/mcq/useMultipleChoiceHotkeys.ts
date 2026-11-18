import { useEffect, useEffectEvent } from 'react'
import { isEditableTarget } from '@/shared/lib/useDoubleTapArrows'

const CHOICE_KEYS = [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4']]

/** The answer position (0–3) a key picks: A or 1 is the first answer, D or 4 the fourth. */
export const choiceIndexForKey = (key: string) => CHOICE_KEYS.findIndex((keys) => keys.includes(key.toLowerCase()))

/**
 * A–D or 1–4 picks the first to fourth MCQ answer. Only mounted while an MCQ is on screen and
 * open for an answer, so the keys never reach Recall, Ghost or the editors.
 */
export function useMultipleChoiceHotkeys({ enabled, choiceIds, onChoose }: {
  enabled: boolean
  /** The answers' ids, in the order they are shown. */
  choiceIds: string[]
  onChoose: (choiceId: string) => void
}) {
  const choose = useEffectEvent((event: KeyboardEvent) => {
    const id = choiceIds[choiceIndexForKey(event.key)]
    if (!id) return
    event.preventDefault()
    onChoose(id)
  })

  useEffect(() => {
    if (!enabled) return
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (isEditableTarget(event.target)) return
      choose(event)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}
