import { useCallback, useRef, useState } from 'react'
import type { SubmitResponse } from '@/shared/evaluation/evaluation'
import { submissionFailureMessage } from './submission'

export type SubmissionStatus = 'idle' | 'saving' | 'graded' | 'failed'

/**
 * One submission's state, the same for every modality: idle → saving → graded, or failed with
 * the shared wording. ``send`` posts the answer (and may record it in a flow); a second submit
 * while one is saving is ignored.
 */
export function useSubmission<Args extends unknown[]>(send: (...args: Args) => Promise<SubmitResponse | null>) {
  const [status, setStatus] = useState<SubmissionStatus>('idle')
  const [result, setResult] = useState<SubmitResponse | null>(null)
  const [error, setError] = useState('')
  const saving = useRef(false)

  const submit = async (...args: Args): Promise<SubmitResponse | null> => {
    if (saving.current) return null
    saving.current = true
    setStatus('saving')
    setError('')
    try {
      const saved = await send(...args)
      if (!saved?.saved) throw new Error('not saved')
      setResult(saved)
      setStatus('graded')
      return saved
    } catch (caught) {
      setError(submissionFailureMessage(caught))
      setStatus('failed')
      return null
    } finally {
      saving.current = false
    }
  }

  const reset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setError('')
  }, [])

  return { status, result, error, saving: status === 'saving', graded: status === 'graded', submit, reset }
}

export type Submission<Args extends unknown[] = unknown[]> = ReturnType<typeof useSubmission<Args>>
