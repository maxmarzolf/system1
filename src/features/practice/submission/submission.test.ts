import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { mockFetch } from '@/test/fetch'
import { buildAttemptBody, createInteractionId, rejectionReason, submissionFailureMessage, submitAnswer, type SubmissionDraft } from './submission'

const draft = (overrides: Partial<SubmissionDraft> = {}): SubmissionDraft => ({
  modality: 'total-recall',
  card: { id: 'card-1', title: 'Window', tags: ['sliding-window'] },
  question: 'Write it',
  categoryTags: ['sliding-window'],
  answer: 'def f(): return 1',
  reference: 'def f(): return 1',
  elapsedMs: 1200,
  interactionId: 'i-1',
  llmProvider: 'openai',
  ...overrides,
})

describe('buildAttemptBody', () => {
  it('sends code modalities with the answer, the reference and a generated card', () => {
    const body = buildAttemptBody(draft({ modalitySignals: { exact: true }, flowSignals: { runId: 'run-9', stage: 'recall' } }))
    expect(body).toMatchObject({
      cardId: 'card-1',
      userAnswer: 'def f(): return 1',
      correctAnswer: 'def f(): return 1',
      generatedCardId: 'card-1',
      generatedCard: { id: 'card-1', prompt: 'Write it' },
      selectedChoiceId: undefined,
      sessionId: 'run-9',
      liveCoachUsed: false,
      modality: 'total-recall',
      signals: { flow: { runId: 'run-9', stage: 'recall' }, modality: { exact: true, kind: 'total-recall' } },
    })
  })

  it('sends MCQ as the selected choice and the stored problem, with no code fields', () => {
    const body = buildAttemptBody(draft({ modality: 'mcq', answer: 'B', multipleChoiceProblemId: 'mcq-1', sessionId: 's-1', flowSignals: null }))
    expect(body).toMatchObject({ selectedChoiceId: 'B', multipleChoiceProblemId: 'mcq-1', sessionId: 's-1', modality: 'mcq' })
    expect(body.userAnswer).toBeUndefined()
    expect(body.correctAnswer).toBeUndefined()
    expect(body.generatedCard).toBeUndefined()
    expect(body.signals).toEqual({ modality: { kind: 'mcq' } })
  })

  it('carries the stored exercise id for microdrills and ladder rungs', () => {
    expect(buildAttemptBody(draft({ modality: 'ladder', exerciseId: 'ex-1' }))).toMatchObject({ exerciseId: 'ex-1', modality: 'ladder' })
  })
})

describe('submitAnswer', () => {
  it('posts the body and returns the graded result', async () => {
    const fetch = mockFetch([{ method: 'POST', match: '/api/attempts', body: { saved: true, successful: true, evaluation: { verdict: 'sound' } } }])
    await expect(submitAnswer(draft())).resolves.toMatchObject({ saved: true, successful: true })
    expect(JSON.parse(String(fetch.calls[0].init?.body))).toMatchObject({ cardId: 'card-1', modality: 'total-recall' })
  })

  it('surfaces a rejection with the server reason', async () => {
    mockFetch([{ method: 'POST', match: '/api/attempts', status: 422, body: { detail: 'Unknown exercise' } }])
    const error = await submitAnswer(draft()).catch((caught: unknown) => caught)
    expect(rejectionReason(error)).toBe('Unknown exercise')
    expect(submissionFailureMessage(error)).toBe('Your answer could not be graded: Unknown exercise')
  })

  it('reports an unreachable server as a network error', async () => {
    globalThis.fetch = (async () => { throw new TypeError('offline') }) as typeof fetch
    const error = await submitAnswer(draft()).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(rejectionReason(error)).toBe('')
    expect(submissionFailureMessage(error)).toBe('Your answer could not be graded. Submit again before continuing.')
  })
})

describe('createInteractionId', () => {
  it('mints unique ids, with or without crypto.randomUUID', () => {
    expect(createInteractionId()).not.toBe(createInteractionId())
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      expect(createInteractionId()).toMatch(/^interaction-\d+-/)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
