import { vi } from 'vitest'

type Route = {
  method?: string
  match: string | RegExp
  status?: number
  body?: unknown
  /** Build the body from the request; wins over ``body``. */
  respond?: (url: string, init?: RequestInit) => unknown
  /** A raw text body (e.g. server-sent events) instead of JSON. */
  text?: string
}

export type FetchMock = ReturnType<typeof vi.fn> & { calls: { url: string; init?: RequestInit }[] }

/** Stub ``fetch`` with a list of routes; unmatched requests fail loudly with 404. */
export function mockFetch(routes: Route[]): FetchMock {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ url, init })
    const route = routes.find((candidate) =>
      (candidate.method ?? 'GET').toUpperCase() === method
      && (typeof candidate.match === 'string' ? url.includes(candidate.match) : candidate.match.test(url)),
    )
    if (!route) {
      return new Response(JSON.stringify({ detail: `unmocked ${method} ${url}` }), { status: 404 })
    }
    if (route.text !== undefined) return new Response(route.text, { status: route.status ?? 200 })
    const payload = route.respond ? route.respond(url, init) : route.body
    return new Response(JSON.stringify(payload ?? {}), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as FetchMock
  fn.calls = calls
  vi.stubGlobal('fetch', fn)
  return fn
}
