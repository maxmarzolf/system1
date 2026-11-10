import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SignalHologram from './SignalHologram'
import { ThemeProvider, useTheme } from '@/app/theme'
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
let visibilityCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null

beforeEach(() => {
  renderers.length = 0
  intersections = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === '2d' ? context2d : {}) as never)
  vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockImplementation(() => intersections as never)
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof visibilityCallback) {
      visibilityCallback = callback
    }
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

const history = {
  signals: [
    { key: 'conceptRecognition', label: 'Concept recognition across many words', count: 2 },
    { key: 'completionTime', label: 'Speed', count: 1 },
  ],
  points: [
    { submission: 1, createdAt: '2026-03-01T10:00:00Z', date: '2026-03-01', signal: 'conceptRecognition', score: 40, title: 'Heap', modality: 'mcq', algorithm: 'Heap' },
    { submission: 2, createdAt: '2026-03-03T10:00:00Z', date: '2026-03-03', signal: 'conceptRecognition', score: 90, title: '', modality: 'mcq', algorithm: 'Heap' },
    { submission: 2, createdAt: '2026-03-03T10:00:00Z', date: '2026-03-03', signal: 'completionTime', score: 75, title: '', modality: 'mcq', algorithm: 'Heap' },
  ],
}

const runFrames = () => {
  const frames = (requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([callback]) => callback)
  ;(requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mockClear()
  act(() => frames.forEach((callback: FrameRequestCallback) => callback(0)))
}

function ThemeFlip() {
  const { setTheme } = useTheme()
  return <button type="button" onClick={() => setTheme('light-high-contrast')}>light</button>
}

const renderTerrain = () =>
  render(
    <ThemeProvider>
      <MemoryRouter>
        <SignalHologram />
        <ThemeFlip />
      </MemoryRouter>
    </ThemeProvider>,
  )

describe('SignalHologram', () => {
  it('summarizes the history and builds the scene', async () => {
    mockFetch([{ match: '/api/history/signals', body: history }])
    const { unmount } = renderTerrain()
    expect(screen.getByText('Mapping signal scores…')).toBeInTheDocument()
    await screen.findByText(/3 scores across 2 signals/)
    expect(screen.getByRole('link', { name: '/build' })).toHaveAttribute('href', '/practice?panel=flow')
    runFrames()
    expect(renderers).toHaveLength(1)
    expect(renderers[0].rendered).toBe(1) // drawn once on mount
    runFrames()
    expect(renderers[0].rendered).toBe(2)
    visibilityCallback?.([{ isIntersecting: false }])
    runFrames()
    expect(renderers[0].rendered).toBe(2) // paused while off screen
    unmount()
    expect(renderers[0].disposed).toBe(true)
  })

  it('shows a tooltip for the dot under the pointer and pauses on it', async () => {
    mockFetch([{ match: '/api/history/signals', body: history }])
    renderTerrain()
    await screen.findByText(/3 scores across 2 signals/)
    runFrames()
    const canvas = renderers[0].domElement
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect)

    intersections = [{ index: 0 }]
    fireEvent.pointerMove(canvas, { clientX: 790, clientY: 5 })
    const tooltip = await screen.findByRole('status')
    expect(tooltip).toHaveTextContent('Concept recognition across many words')
    expect(tooltip).toHaveTextContent('score 40.0 / 100')
    expect(tooltip).toHaveTextContent('Heap')

    intersections = []
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 10 })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())

    intersections = [{ index: 2 }]
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 300 })
    expect(await screen.findByRole('status')).toHaveTextContent('Speed')
    fireEvent.pointerLeave(canvas)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('zooms only with Ctrl or Command held', async () => {
    mockFetch([{ match: '/api/history/signals', body: history }])
    renderTerrain()
    await screen.findByText(/3 scores/)
    runFrames()
    const canvas = renderers[0].domElement
    const plain = new WheelEvent('wheel', { deltaY: 100, cancelable: true })
    canvas.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false)
    const zoom = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true })
    canvas.dispatchEvent(zoom)
    expect(zoom.defaultPrevented).toBe(true)
  })

  it('rebuilds with the new theme colors', async () => {
    mockFetch([{ match: '/api/history/signals', body: history }])
    renderTerrain()
    await screen.findByText(/3 scores/)
    runFrames()
    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    runFrames()
    expect(renderers).toHaveLength(2)
    expect(renderers[0].disposed).toBe(true)
  })

  it('handles empty history, errors, missing WebGL and a single point in time', async () => {
    mockFetch([{ match: '/api/history/signals', body: { signals: [], points: [] } }])
    const empty = renderTerrain()
    await screen.findByText(/No scored signals yet/)
    empty.unmount()

    mockFetch([{ match: '/api/history/signals', status: 503 }])
    const failed = renderTerrain()
    expect(await screen.findByRole('alert')).toHaveTextContent('Signal history unavailable (503)')
    failed.unmount()

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject('offline')))
    const offline = renderTerrain()
    expect(await screen.findByRole('alert')).toHaveTextContent('Signal history unavailable')
    offline.unmount()

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    mockFetch([{ match: '/api/history/signals', body: history }])
    const noWebgl = renderTerrain()
    await screen.findByText(/needs WebGL/)
    noWebgl.unmount()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === '2d' ? context2d : {}) as never)

    const single = { signals: [history.signals[0]], points: [history.points[0]] }
    mockFetch([{ match: '/api/history/signals', body: single }])
    renderTerrain()
    await screen.findByText(/1 scores across 1 signals/)
    runFrames()
    expect(renderers.length).toBeGreaterThan(0)
  })

  it('gives up quietly when the renderer cannot start', async () => {
    vi.mocked(THREE.WebGLRenderer).mockImplementationOnce(() => {
      throw new Error('context lost')
    })
    mockFetch([{ match: '/api/history/signals', body: history }])
    renderTerrain()
    await screen.findByText(/3 scores/)
    runFrames()
    expect(renderers).toHaveLength(0)
  })
})

