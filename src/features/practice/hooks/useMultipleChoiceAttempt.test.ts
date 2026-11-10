import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { useMultipleChoiceAttempt } from './useMultipleChoiceAttempt'
import type { MultipleChoiceCard, SubmissionSaveResponse } from '../lib/types'

const saved = (successful: boolean, extra: Partial<SubmissionSaveResponse> = {}) =>
  ({ saved: true, successful, attemptId: 1, evaluation: { feedback: {} }, ...extra }) as unknown as SubmissionSaveResponse
const rejected = () => Promise.reject(new ApiError(422, 'validation_error', 'Answer too long'))

describe('useMultipleChoiceAttempt', () => {
  const card = { id: 'q1', choices: [{ id: 'A', text: 'one' }, { id: 'B', text: 'two' }] } as unknown as MultipleChoiceCard

  it('grades the selected choice and remembers the result', async () => {
    const { result } = renderHook(() => useMultipleChoiceAttempt())
    const onGraded = vi.fn()
    await act(() => result.current.submit(card, async () => saved(true), onGraded)) // nothing selected yet
    expect(onGraded).not.toHaveBeenCalled()

    act(() => result.current.resetCard())
    act(() => result.current.select('B'))
    expect(result.current.viewOf(card).selectedChoice?.id).toBe('B')
    const save = vi.fn(async () => saved(true))
    await act(() => result.current.submit(card, save, onGraded))
    expect(save).toHaveBeenCalledWith({ id: 'B', text: 'two' }, expect.any(Number))
    expect(onGraded).toHaveBeenCalledWith(saved(true), expect.any(Number))
    expect(result.current.viewOf(card)).toMatchObject({ submitted: true, submittedChoiceId: 'B', correct: true })

    act(() => result.current.resetAll(false))
    expect(result.current.viewOf(card)).toMatchObject({ submitted: false, selectedChoice: null })
  })

  it("shows the server's reason when an answer cannot be graded", async () => {
    const { result } = renderHook(() => useMultipleChoiceAttempt())
    act(() => result.current.select('A'))
    await act(() => result.current.submit(card, rejected, vi.fn()))
    expect(result.current.submitError).toBe('Your answer could not be graded: Answer too long')
    await act(() => result.current.submit(card, async () => null, vi.fn()))
    expect(result.current.submitError).toBe('Your answer could not be graded. Submit again before continuing.')
    expect(result.current.viewOf(card).submitted).toBe(false)
  })
})
