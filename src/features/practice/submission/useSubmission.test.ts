import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type { SubmitResponse } from '@/shared/evaluation/evaluation'
import { useSubmission } from './useSubmission'

const response = (fields: Partial<SubmitResponse> = {}) => ({ saved: true, successful: true, evaluation: { verdict: 'sound' }, ...fields }) as unknown as SubmitResponse

describe('useSubmission', () => {
  it('goes idle → saving → graded and keeps the result', async () => {
    let resolve: (value: SubmitResponse) => void = () => undefined
    const send = vi.fn((answer: string) => new Promise<SubmitResponse>((done) => { resolve = done; void answer }))
    const { result } = renderHook(() => useSubmission(send))
    expect(result.current.status).toBe('idle')
    let pending: Promise<SubmitResponse | null> = Promise.resolve(null)
    act(() => { pending = result.current.submit('code') })
    expect(result.current.saving).toBe(true)
    // A second submit while saving is ignored.
    await act(async () => { expect(await result.current.submit('again')).toBeNull() })
    expect(send).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(response()); await pending })
    expect(result.current.graded).toBe(true)
    expect(result.current.result?.successful).toBe(true)
    act(() => result.current.reset())
    expect(result.current).toMatchObject({ status: 'idle', result: null, error: '' })
  })

  it('fails with the shared wording when nothing was saved', async () => {
    const { result } = renderHook(() => useSubmission(async () => null))
    await act(async () => { await result.current.submit() })
    expect(result.current.status).toBe('failed')
    expect(result.current.error).toBe('Your answer could not be graded. Submit again before continuing.')
  })

  it('fails with the server reason on a rejection', async () => {
    const { result } = renderHook(() => useSubmission(async () => { throw new ApiError(409, 'conflict', 'Already graded') }))
    await act(async () => { await result.current.submit() })
    expect(result.current.error).toBe('Your answer could not be graded: Already graded')
  })

  it('treats an unsaved response as a failure', async () => {
    const { result } = renderHook(() => useSubmission(async () => response({ saved: false })))
    await act(async () => { await result.current.submit() })
    expect(result.current.status).toBe('failed')
    expect(result.current.result).toBeNull()
  })
})
