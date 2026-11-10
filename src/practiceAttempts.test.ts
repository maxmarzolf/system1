import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api/client'
import { useMultipleChoiceAttempt } from './practice/hooks/useMultipleChoiceAttempt'
import { useRecallAttempt, type RecallAttemptOptions } from './practice/hooks/useRecallAttempt'
import type { MultipleChoiceCard, SubmissionSaveResponse } from './practice/types'

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

describe('useRecallAttempt', () => {
  const baseOptions = (overrides: Partial<RecallAttemptOptions> = {}): RecallAttemptOptions => ({
    blocked: false,
    active: true,
    flowFocus: null,
    ghostStage: false,
    ghostScaffold: '',
    supportLayer: 'none',
    inlineEnabled: false,
    target: 'a = 1',
    templateMode: 'algorithm',
    historyKey: 'card',
    providerLabel: 'Claude',
    save: async () => saved(true),
    flowVersion: { current: 0 },
    onSubmitted: () => {},
    ...overrides,
  })
  const type = (attempt: { current: ReturnType<typeof useRecallAttempt> }, text: string) =>
    act(() => attempt.current.change(text, { cursorLineNumber: text.split('\n').length }))

  it('walks preview, typing and submitted, and keeps the attempt history', async () => {
    const onSubmitted = vi.fn()
    const save = vi.fn(async (payload: unknown) => (void payload, saved(false)))
    const { result } = renderHook(() => useRecallAttempt(baseOptions({ save, onSubmitted })))
    expect(result.current.phase).toBe('preview')
    act(() => result.current.start())
    expect(result.current.phase).toBe('typing')
    type(result, 'a = 2')
    await act(() => result.current.submit())
    expect(save.mock.calls[0][0]).toMatchObject({ userAnswer: 'a = 2', correctAnswer: 'a = 1', modality: 'total-recall', signals: { modality: { exact: false, missedLineCount: 1 } } })
    expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ sound: false, closeEnough: false, isGhostRep: false }))
    expect(result.current).toMatchObject({ phase: 'submitted', closeEnough: false })
    expect(result.current.history).toHaveLength(1)

    act(() => result.current.revise())
    expect(result.current.phase).toBe('typing')
    expect(result.current.input).toBe('a = 2')
  })

  it('names a rejected attempt and a provider outage', async () => {
    const { result, rerender } = renderHook(({ options }) => useRecallAttempt(options), { initialProps: { options: baseOptions({ save: rejected }) } })
    act(() => result.current.start())
    type(result, 'a = 1')
    await act(() => result.current.submit())
    expect(result.current.error).toBe('This attempt was rejected: Answer too long')

    rerender({ options: baseOptions({ save: async () => saved(true, { feedbackUnavailable: { message: 'Quota exceeded' } } as never) }) })
    act(() => result.current.repeat())
    type(result, 'a = 1')
    await act(() => result.current.submit())
    expect(result.current.failure).toEqual({ providerLabel: 'Claude', message: 'Quota exceeded' })
    act(() => result.current.dismissFailure())
    expect(result.current.failure).toBeNull()
  })

  it('in a flow, keeps typing when a rep is not saved and ignores a response after the flow moved on', async () => {
    const flowFocus = { sequenceStage: 'recall' as const, focusSummary: '', missedLines: [] }
    const flowVersion = { current: 0 }
    const onSubmitted = vi.fn()
    const { result, rerender } = renderHook(({ options }) => useRecallAttempt(options), {
      initialProps: { options: baseOptions({ flowFocus, flowVersion, onSubmitted, save: async () => ({ ...saved(true), saved: false }) }) },
    })
    act(() => result.current.start())
    type(result, 'a = 1')
    await act(() => result.current.submit())
    expect(result.current).toMatchObject({ phase: 'typing', error: 'Your rep could not be saved. Submit again to continue.' })

    let release: (value: SubmissionSaveResponse) => void = () => {}
    rerender({ options: baseOptions({ flowFocus, flowVersion, onSubmitted, save: () => new Promise((resolve) => { release = resolve }) }) })
    let pending: Promise<void> = Promise.resolve()
    act(() => { pending = result.current.submit() })
    flowVersion.current += 1
    await act(async () => {
      release(saved(true))
      await pending
    })
    expect(onSubmitted).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('typing')
  })

  it('starts a ghost stage from its scaffold and tracks Inline progress', () => {
    const missedLines = [{ lineNumber: 2, expected: 'b = 2', actual: '', status: 'missing' }]
    const flowFocus = { sequenceStage: 'recall' as const, focusSummary: '', missedLines } as never
    const ghost = renderHook(() => useRecallAttempt(baseOptions({ flowFocus, ghostStage: true, ghostScaffold: 'a = 1\n' })))
    act(() => ghost.result.current.start())
    expect(ghost.result.current.input).toBe('a = 1\n')
    expect(ghost.result.current.onEnterKey({ value: 'a = 1\n', cursorLineNumber: 1 })).toBe(true)

    const inline = renderHook(() => useRecallAttempt(baseOptions({ inlineEnabled: true })))
    act(() => inline.result.current.start())
    type(inline.result, 'a = 1\nb = 2\n')
    expect(inline.result.current.inlineTaskProgress).toBe(2)
    expect(inline.result.current.onEnterKey({ value: '', cursorLineNumber: 1 })).toBe(false)
  })

  it('does nothing while blocked', async () => {
    const save = vi.fn(async () => saved(true))
    const { result } = renderHook(() => useRecallAttempt(baseOptions({ blocked: true, save })))
    act(() => result.current.start())
    await act(() => result.current.submit())
    expect(result.current.phase).toBe('preview')
    expect(save).not.toHaveBeenCalled()
  })
})
