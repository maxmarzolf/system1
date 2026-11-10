import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/app/theme'
import JourneyPage from './JourneyPage'
import { mockFetch } from '@/test/fetch'

// A WebGL renderer that draws nothing: the scene, camera, controls and raycasting are real three.js.
const renderers: FakeRenderer[] = []
class FakeRenderer {
  domElement = document.createElement('canvas')
  rendered = 0
  disposed = false
  constructor() {
    renderers.push(this)
  }
  setPixelRatio() {}
  setClearColor() {}
  compile() {}
  setSize() {}
  render() {
    this.rendered += 1
  }
  dispose() {
    this.disposed = true
  }
}

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  return { ...actual, WebGLRenderer: vi.fn(() => new FakeRenderer()) }
})

const context2d = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  measureText: (text: string) => ({ width: text.length * 10 }),
}

let intersections: { index?: number }[] = []

beforeEach(() => {
  renderers.length = 0
  intersections = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === '2d' ? context2d : {}) as never)
  vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockImplementation(() => intersections as never)
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  })
  // Run animation frames on demand, never on their own.
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})

afterEach(() => {
  document.documentElement.classList.remove('journey-snap')
})

const overview = {
  algorithms: [{ algorithm: 'Heap', slug: 'heap' }],
  ghostRepActivity: {
    windowEnd: '2026-03-03',
    days: [
      { date: '2026-03-02', segments: [{ slug: 'heap', count: 1 }] },
      { date: '2026-03-03', segments: [] },
    ],
  },
}

const renderJourney = () =>
  render(
    <ThemeProvider>
      <MemoryRouter>
        <JourneyPage />
      </MemoryRouter>
    </ThemeProvider>,
  )

describe('JourneyPage', () => {
  const routes = (overrides: Record<string, unknown> = {}) =>
    mockFetch([
      { match: '/api/coach/provider-default', body: { provider: 'openai' } },
      { match: '/api/history/signals', body: { signals: [], points: [] } },
      { match: '/api/history/day', respond: (url) => ({ date: new URL(url, 'http://x').searchParams.get('date'), submissions: [] }) },
      { match: '/api/skill-map-overview', body: overview, ...overrides },
    ])

  it('loads a month, selects the latest active day, and toggles filters', async () => {
    const fetch = routes()
    renderJourney()
    expect(document.documentElement).toHaveClass('journey-snap')
    await screen.findByText('No submissions recorded on this day.')
    expect(fetch.calls.find((call) => call.url.includes('skill-map-overview'))?.url).toContain('historyDays=30')
    expect(fetch.calls.find((call) => call.url.includes('/api/history/day'))?.url).toContain('date=2026-03-02')

    const heap = screen.getByRole('button', { name: 'Heap' })
    await userEvent.click(heap)
    expect(heap).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(heap)
    expect(heap).toHaveAttribute('aria-pressed', 'false')

    const selectedDay = screen.getByRole('button', { name: /is selected/ })
    await userEvent.click(selectedDay)
    await screen.findByText(/Select a date on the grid/)

    await userEvent.click(screen.getByRole('button', { name: 'Week' }))
    await waitFor(() => expect(fetch.calls.some((call) => call.url.includes('historyDays=7'))).toBe(true))
  })

  it('reports an unavailable history', async () => {
    routes({ status: 500 })
    renderJourney()
    expect(await screen.findByText('Daily work history is unavailable right now.')).toBeInTheDocument()
  })

  it('turns the nav solid once scrolling settles below the top', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    routes()
    const { container } = renderJourney()
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 })
    fireEvent.scroll(window)
    act(() => vi.advanceTimersByTime(200))
    expect(container.querySelector('nav')).toHaveClass('navbar-solid')
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    vi.useRealTimers()
  })

  it('moves one section per wheel gesture from a snapped position', async () => {
    routes()
    renderJourney()
    await screen.findByText('No submissions recorded on this day.')
    const sections = [...document.querySelectorAll<HTMLElement>('.app-history > section')]
    sections.forEach((section, index) => {
      vi.spyOn(section, 'getBoundingClientRect').mockImplementation(() => ({
        top: index * 1000 - window.scrollY,
        bottom: index * 1000 + 900 - window.scrollY,
      }) as DOMRect)
    })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    let now = 100_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    const wheel = (init: WheelEventInit) => {
      const event = new WheelEvent('wheel', { cancelable: true, ...init })
      window.dispatchEvent(event)
      return event
    }

    expect(wheel({ deltaY: 40, ctrlKey: true }).defaultPrevented).toBe(false) // terrain zoom
    expect(wheel({ deltaX: 50, deltaY: 5 }).defaultPrevented).toBe(false) // sideways
    expect(wheel({ deltaY: -40 }).defaultPrevented).toBe(false) // nothing above the first section

    now = 101_000
    expect(wheel({ deltaY: 40 }).defaultPrevented).toBe(true)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'smooth' })
    now = 101_050
    expect(wheel({ deltaY: 40 }).defaultPrevented).toBe(true) // swallowed while animating
    window.dispatchEvent(new Event('scrollend'))
    now = 101_100
    expect(wheel({ deltaY: 40 }).defaultPrevented).toBe(true) // momentum of the same swipe

    now = 105_000
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 })
    expect(wheel({ deltaY: 40 }).defaultPrevented).toBe(false) // between snap points

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100 })
    now = 109_000
    expect(wheel({ deltaY: 40 }).defaultPrevented).toBe(false) // long section: more to read
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })
})
