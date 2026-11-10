import { describe, expect, it } from 'vitest'
import { api, ApiError, apiErrorFrom, errorMessage, unwrap } from './client'
import { mockFetch } from '@/test/fetch'

describe('apiErrorFrom', () => {
  it('reads a plain string detail', () => {
    const error = apiErrorFrom(404, { detail: 'Not found' })
    expect(error).toBeInstanceOf(ApiError)
    expect([error.status, error.code, error.message]).toEqual([404, 'error', 'Not found'])
  })

  it('reads a domain error with field errors', () => {
    const error = apiErrorFrom(422, { detail: { code: 'invalid_signal', message: 'Fix the fields', errors: { key: 'taken' } } })
    expect([error.code, error.message]).toEqual(['invalid_signal', 'Fix the fields'])
    expect(error.fieldErrors).toEqual({ key: 'taken' })
  })

  it('reads FastAPI validation errors', () => {
    const error = apiErrorFrom(422, {
      detail: [
        { loc: ['body', 'cardId'], msg: 'String should have at least 1 character' },
        { loc: ['body'], msg: 'Field required' },
      ],
    })
    expect(error.code).toBe('validation_error')
    expect(error.fieldErrors).toEqual({ cardId: 'String should have at least 1 character', request: 'Field required' })
    expect(error.message).toBe('Invalid request: cardId: String should have at least 1 character; request: Field required')
  })

  it('falls back when the body says nothing useful', () => {
    expect(apiErrorFrom(500, {}, 'Server sad').message).toBe('Server sad')
    expect(apiErrorFrom(500, { detail: { code: 'x' } }).message).toBe('Request failed (500)')
    expect(apiErrorFrom(422, { detail: [] }).message).toBe('Request failed (422)')
    expect(apiErrorFrom(500, { detail: [{ msg: 'x' }] }).message).toBe('Request failed (500)')
    expect(apiErrorFrom(503, null).message).toBe('Request failed (503)')
    expect(apiErrorFrom(400, { detail: '  ' }).message).toBe('Request failed (400)')
  })
})

describe('unwrap', () => {
  it('returns data from a typed call and throws ApiError on failure', async () => {
    mockFetch([
      { match: '/api/health', body: { ok: true } },
      { match: '/api/coach/provider-default', status: 503, body: { detail: { code: 'down', message: 'Provider down' } } },
    ])
    expect(unwrap(await api.GET('/api/health'))).toEqual({ ok: true })
    await expect(async () => unwrap(await api.GET('/api/coach/provider-default'))).rejects.toMatchObject({
      status: 503,
      code: 'down',
      message: 'Provider down',
    })
  })
})

describe('errorMessage', () => {
  it('prefers the thrown message', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom')
    expect(errorMessage(new Error(' '), 'fallback')).toBe('fallback')
    expect(errorMessage('offline', 'fallback')).toBe('fallback')
  })
})
