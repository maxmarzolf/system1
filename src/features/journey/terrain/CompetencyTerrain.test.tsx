import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CompetencyTerrain from './CompetencyTerrain'
import { ThemeProvider, useTheme } from '@/app/theme'
import { competencyTerrain } from '@/test/competency'
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

// What the pointer hits: dots (Points) and the surface (Mesh) separately.
let intersections: { index?: number }[] = []
let surfaceHits: { point: { x: number; z: number } }[] = []
let visibilityCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null

beforeEach(() => {
  renderers.length = 0
  intersections = []
  surfaceHits = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === '2d' ? context2d : {}) as never)
  vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockImplementation(((object: THREE.Object3D) =>
    (object.type === 'Points' ? intersections : surfaceHits)) as never)
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

const terrain = competencyTerrain()

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
        <CompetencyTerrain />
        <ThemeFlip />
      </MemoryRouter>
    </ThemeProvider>,
  )

describe('CompetencyTerrain', () => {
  it('summarizes the history and builds the scene', async () => {
    mockFetch([{ match: '/api/history/competency', body: terrain }])
    const { unmount } = renderTerrain()
    expect(screen.getByText('Mapping competency…')).toBeInTheDocument()
    const stage = await screen.findByRole('img', { name: /peaks are strong, and days without practice decay 2% per day/ })
    expect(stage).toHaveAccessibleName(expect.stringContaining('Today: Heap 77, Sliding Window with a very long name 90; Mar'))
    expect(screen.getByText(/unpractised days fade 2%\/day/)).toBeInTheDocument()
    runFrames()
    // Algorithm labels carry today's competency.
    expect(context2d.fillText).toHaveBeenCalledWith('Heap 77', expect.any(Number), expect.any(Number))
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

  it('shows a practised day for a dot, and the nearest decayed day elsewhere on the surface', async () => {
    mockFetch([{ match: '/api/history/competency', body: terrain }])
    renderTerrain()
    await screen.findByRole('img', { name: /Today:/ })
    runFrames()
    const canvas = renderers[0].domElement
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect)

    intersections = [{ index: 1 }] // the second dot: sliding window, Mar 3
    fireEvent.pointerMove(canvas, { clientX: 790, clientY: 5 })
    const dot = await screen.findByRole('status')
    expect(dot).toHaveTextContent('Sliding Window with a very long name')
    expect(dot).toHaveTextContent('competency 90.0 / 100')
    expect(dot).toHaveTextContent('2 answers · 9 signals averaged')

    // Off the dots, over heap's column (x = -width/2) at the middle day (z = 0).
    intersections = []
    surfaceHits = [{ point: { x: -0.8, z: 0 } }]
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 300 })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('competency 78.4 / 100'))
    expect(screen.getByRole('status')).toHaveTextContent('Heap')
    expect(screen.getByRole('status')).toHaveTextContent('Not practised: decayed from')

    // Over a day before sliding window was first practised: nothing to show.
    surfaceHits = [{ point: { x: 0.8, z: -4.5 } }]
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 10 })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())

    surfaceHits = []
    intersections = [{ index: 0 }]
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 300 })
    expect(await screen.findByRole('status')).toHaveTextContent('competency 80.0 / 100')
    fireEvent.pointerLeave(canvas)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('zooms only with Ctrl or Command held', async () => {
    mockFetch([{ match: '/api/history/competency', body: terrain }])
    renderTerrain()
    await screen.findByRole('img', { name: /Today:/ })
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
    mockFetch([{ match: '/api/history/competency', body: terrain }])
    renderTerrain()
    await screen.findByRole('img', { name: /Today:/ })
    runFrames()
    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    runFrames()
    expect(renderers).toHaveLength(2)
    expect(renderers[0].disposed).toBe(true)
  })

  it('handles an empty terrain, errors, missing WebGL and a single algorithm on a single day', async () => {
    mockFetch([{ match: '/api/history/competency', body: { ...competencyTerrain(), algorithms: [], unpractised: [], days: [], cells: [] } }])
    const empty = renderTerrain()
    await screen.findByText(/No graded answers yet/)
    empty.unmount()

    mockFetch([{ match: '/api/history/competency', status: 503 }])
    const failed = renderTerrain()
    expect(await screen.findByRole('alert')).toHaveTextContent('Competency terrain unavailable (503)')
    failed.unmount()

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject('offline')))
    const offline = renderTerrain()
    expect(await screen.findByRole('alert')).toHaveTextContent('Competency terrain unavailable')
    offline.unmount()

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    mockFetch([{ match: '/api/history/competency', body: terrain }])
    const noWebgl = renderTerrain()
    await screen.findByText(/needs WebGL/)
    noWebgl.unmount()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === '2d' ? context2d : {}) as never)

    const single = { ...terrain, algorithms: [terrain.algorithms[0]], days: ['2026-03-01'], cells: [terrain.cells[0]] }
    mockFetch([{ match: '/api/history/competency', body: single }])
    renderTerrain()
    await screen.findByRole('img', { name: /Today: Heap 77; Mar/ })
    runFrames()
    expect(renderers.length).toBeGreaterThan(0)
  })

  it('gives up quietly when the renderer cannot start', async () => {
    vi.mocked(THREE.WebGLRenderer).mockImplementationOnce(() => {
      throw new Error('context lost')
    })
    mockFetch([{ match: '/api/history/competency', body: terrain }])
    renderTerrain()
    await screen.findByRole('img', { name: /Today:/ })
    runFrames()
    expect(renderers).toHaveLength(0)
  })
})

