/**
 * The one way the frontend talks to the backend.
 *
 * - `api` is an openapi-fetch client typed from `schema.d.ts` (generated from the backend's
 *   OpenAPI document by `npm run gen:api`), so paths, params and responses are checked at build time.
 * - `unwrap` turns a failed response into an `ApiError`, whatever shape the backend used for it.
 * - `queryClient` caches and deduplicates reads (TanStack Query).
 */
import { QueryClient } from '@tanstack/react-query'
import createClient from 'openapi-fetch'
import type { paths } from './schema'

const configuredBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

/** Absolute, so `Request` accepts it outside the browser too (tests). */
export const API_BASE_URL = configuredBaseUrl || window.location.origin

export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  // Resolve `fetch` per call, so tests can stub it after the client is created.
  fetch: (request) => globalThis.fetch(request),
})

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
})

/** A failed API call. `message` is always fit to show; `fieldErrors` maps a field to its problem. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: Record<string, string>
  readonly detail: unknown

  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}, detail: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.detail = detail
  }
}

type ValidationIssue = { loc?: unknown[]; msg?: string }

const fieldName = (loc: unknown[] | undefined) =>
  (loc ?? []).filter((part) => part !== 'body' && part !== 'query' && part !== 'path').join('.')

/**
 * Build an ApiError from an error body. The backend answers with one of:
 * - `{detail: "text"}` (plain HTTP errors);
 * - `{detail: {code, message, errors?, ...}}` (domain errors, LLM provider outages);
 * - `{detail: [{loc, msg}, ...]}` (FastAPI request validation; read only on a 422).
 */
export function apiErrorFrom(status: number, body: unknown, fallback = `Request failed (${status})`): ApiError {
  const detail = body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : body
  if (typeof detail === 'string' && detail.trim()) {
    return new ApiError(status, 'error', detail, {}, detail)
  }
  if (Array.isArray(detail) && status === 422) {
    const issues = detail as ValidationIssue[]
    const fieldErrors = Object.fromEntries(
      issues.filter((issue) => issue?.msg).map((issue) => [fieldName(issue.loc) || 'request', String(issue.msg)]),
    )
    const message = Object.entries(fieldErrors).map(([field, msg]) => `${field}: ${msg}`).join('; ')
    return new ApiError(status, 'validation_error', message ? `Invalid request: ${message}` : fallback, fieldErrors, detail)
  }
  if (detail && typeof detail === 'object') {
    const shaped = detail as { code?: unknown; message?: unknown; errors?: unknown }
    const fieldErrors = shaped.errors && typeof shaped.errors === 'object' ? shaped.errors as Record<string, string> : {}
    const message = typeof shaped.message === 'string' && shaped.message.trim() ? shaped.message : fallback
    return new ApiError(status, typeof shaped.code === 'string' ? shaped.code : 'error', message, fieldErrors, detail)
  }
  return new ApiError(status, 'error', fallback, {}, detail)
}

type FetchResult<T> = { data?: T; error?: unknown; response: Response }

/** The response data, or throw an ApiError. `fallback` is the message when the body says nothing useful. */
export function unwrap<T>(result: FetchResult<T>, fallback?: string): T {
  if (result.error !== undefined || !result.response.ok) {
    throw apiErrorFrom(result.response.status, result.error, fallback)
  }
  return result.data as T
}

/** A message for any thrown value, preferring the server's own words. */
export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback
