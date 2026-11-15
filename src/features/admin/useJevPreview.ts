import { useEffect, useState } from 'react'
import type { Modality } from '@/shared/modality'
import { previewSignal, type SignalDraft } from './api'

export type JevPreview =
  | { status: 'loading' }
  | { status: 'ready'; question: Record<string, unknown> | null }
  | { status: 'invalid' }

/**
 * The Jev question a draft would send, as the server builds it (so it can never drift from what
 * grading sends). Debounced while typing; an invalid draft has no preview until it's fixed.
 */
export function useJevPreview(modality: Modality, draft: SignalDraft, delayMs = 300): JevPreview {
  const [preview, setPreview] = useState<JevPreview>({ status: 'loading' })
  const serialized = JSON.stringify(draft)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      previewSignal(modality, JSON.parse(serialized) as SignalDraft, controller.signal)
        .then((question) => setPreview({ status: 'ready', question }))
        .catch(() => {
          if (!controller.signal.aborted) setPreview({ status: 'invalid' })
        })
    }, delayMs)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [modality, serialized, delayMs])

  return preview
}
