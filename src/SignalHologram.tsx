import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { apiUrl } from './api'
import { formatCalendarDate, viewerTimeZone } from './dailyWork'
import { useTheme } from './theme'

type SignalPoint = {
  submission: number
  createdAt: string
  date: string
  signal: string
  score: number
  title: string
  modality: string
  algorithm: string
}

type SignalHistory = {
  signals: { key: string; label: string; count: number }[]
  points: SignalPoint[]
}

type Tooltip = { x: number; y: number; point: SignalPoint; label: string }

// World units: X spreads signals, the floor's depth is time, height is score.
const SIGNAL_SPACING = 1.15
const TIME_DEPTH = 9
const SCORE_HEIGHT = 4.5
const TIME_TICKS = 5
const POINT_SIZE = 0.32
// Landscape resolution and smoothing.
const LANDSCAPE_ROWS = 48 // samples along time, front to back
const LANDSCAPE_SUBDIVISIONS = 6 // samples between neighbouring signals
const TIME_BANDWIDTH = 0.07 // smoothing kernel width, as a fraction of the whole time span
const PRIOR_WEIGHT = 0.2 // pull toward a signal's mean loss where it has no nearby answers

const cssColor = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  try {
    return new THREE.Color(value || fallback)
  } catch {
    return new THREE.Color(fallback)
  }
}

/** A soft round glow used for every point. */
const glowTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Camera-facing text, glowing like the rest of the hologram. */
const textSprite = (text: string, color: THREE.Color, worldHeight = 0.3, weight = 500) => {
  const fontSize = 48
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const font = `${weight} ${fontSize}px Menlo, Monaco, 'Courier New', monospace`
  context.font = font
  const width = Math.ceil(context.measureText(text).width) + 24
  canvas.width = width
  canvas.height = fontSize + 24
  context.font = font
  context.textBaseline = 'middle'
  context.shadowColor = `#${color.getHexString()}`
  context.shadowBlur = 14
  context.fillStyle = `#${color.getHexString()}`
  context.fillText(text, 12, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set((canvas.width / canvas.height) * worldHeight, worldHeight, 1)
  return sprite
}

const webglAvailable = () => {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

const lossOf = (score: number) => 100 - score

/**
 * Loss (100 - score) for each signal at each time row, Gaussian-smoothed over time.
 * Rows with no nearby answers relax toward that signal's mean loss.
 */
function signalLossRows(history: SignalHistory, tMin: number, tMax: number): number[][] {
  const fractionOf = (time: number) => (tMax === tMin ? 0.5 : (time - tMin) / (tMax - tMin))
  return history.signals.map((signal) => {
    const samples = history.points
      .filter((point) => point.signal === signal.key)
      .map((point) => ({ at: fractionOf(Date.parse(point.createdAt)), loss: lossOf(point.score) }))
    const mean = samples.reduce((total, sample) => total + sample.loss, 0) / Math.max(samples.length, 1)
    return Array.from({ length: LANDSCAPE_ROWS }, (_, row) => {
      const at = row / (LANDSCAPE_ROWS - 1)
      let weights = PRIOR_WEIGHT
      let total = PRIOR_WEIGHT * mean
      for (const sample of samples) {
        const weight = Math.exp(-((at - sample.at) ** 2) / (2 * TIME_BANDWIDTH ** 2))
        weights += weight
        total += weight * sample.loss
      }
      return total / weights
    })
  })
}

const compact = (label: string) => (label.length > 18 ? `${label.slice(0, 17)}…` : label)

function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      ;(material as THREE.MeshBasicMaterial).map?.dispose()
      material.dispose()
    }
  })
}

/**
 * Build the hologram for ``history`` inside ``container`` and start rendering.
 * Colors come from the theme's CSS variables at call time. Returns a cleanup.
 */
function mountHologram(
  container: HTMLDivElement,
  history: SignalHistory,
  light: boolean,
  setTooltip: (tooltip: Tooltip | null) => void,
): () => void {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    return () => {}
  }
  const blending = light ? THREE.NormalBlending : THREE.AdditiveBlending
  const accent = cssColor('--hc-accent', '#6fc3df')
  const partial = cssColor('--hc-warning', '#cca700')
  const failing = cssColor('--hc-error', '#f48771')
  // Valleys (low loss) glow in the accent color, rising through warning to error at the peaks.
  const lossColor = (loss: number) => {
    const t = Math.min(Math.max(loss / 100, 0), 1)
    return t < 0.5 ? accent.clone().lerp(partial, t / 0.5) : partial.clone().lerp(failing, (t - 0.5) / 0.5)
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.className = 'signal-hologram-canvas'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
  const signals = history.signals
  const signalIndex = new Map(signals.map((signal, index) => [signal.key, index]))
  const signalLabels = new Map(signals.map((signal) => [signal.key, signal.label]))
  const width = Math.max(signals.length - 1, 1) * SIGNAL_SPACING
  const times = history.points.map((point) => Date.parse(point.createdAt))
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const xOf = (key: string) => (signalIndex.get(key) ?? 0) * SIGNAL_SPACING - width / 2
  // Newest answers sit at the front, nearest the viewer.
  const zOf = (time: number) => (tMax === tMin ? 0 : ((time - tMin) / (tMax - tMin) - 0.5) * TIME_DEPTH)
  const yOf = (loss: number) => (loss / 100) * SCORE_HEIGHT
  const line = (positions: number[], opacity: number, color = accent) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending, depthWrite: false }),
    )
  }

  const hologram = new THREE.Group()
  scene.add(hologram)

  // Projector floor: a faint plate with signal columns and time rows.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 2.2, TIME_DEPTH + 1.4),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: light ? 0.06 : 0.05, blending, depthWrite: false }),
  )
  floor.rotation.x = -Math.PI / 2
  hologram.add(floor)
  const grid: number[] = []
  for (const signal of signals) {
    const x = xOf(signal.key)
    grid.push(x, 0, -TIME_DEPTH / 2, x, 0, TIME_DEPTH / 2)
  }
  for (let tick = 0; tick < TIME_TICKS; tick += 1) {
    const z = (tick / (TIME_TICKS - 1) - 0.5) * TIME_DEPTH
    grid.push(-width / 2 - 0.6, 0, z, width / 2 + 0.6, 0, z)
  }
  hologram.add(line(grid, light ? 0.35 : 0.22))

  // Loss wall at the back: 0 / 50 / 100 guides.
  const wall: number[] = []
  for (const loss of [0, 50, 100]) {
    wall.push(-width / 2 - 0.6, yOf(loss), -TIME_DEPTH / 2, width / 2 + 0.6, yOf(loss), -TIME_DEPTH / 2)
    const label = textSprite(String(loss), accent, 0.34)
    label.position.set(-width / 2 - 1.05, yOf(loss), -TIME_DEPTH / 2)
    hologram.add(label)
  }
  wall.push(-width / 2 - 0.6, 0, -TIME_DEPTH / 2, -width / 2 - 0.6, SCORE_HEIGHT, -TIME_DEPTH / 2)
  hologram.add(line(wall, light ? 0.3 : 0.16))

  // The landscape: one surface over signals (x) and time (depth), height = smoothed loss.
  const lossRows = signalLossRows(history, tMin, tMax)
  const columnCount = Math.max(signals.length - 1, 1) * LANDSCAPE_SUBDIVISIONS + 1
  const columnLoss = (column: number, row: number) => {
    const at = signals.length > 1 ? column / LANDSCAPE_SUBDIVISIONS : 0
    const left = Math.min(Math.floor(at), signals.length - 1)
    const right = Math.min(left + 1, signals.length - 1)
    const blend = (1 - Math.cos((at - left) * Math.PI)) / 2 // cosine ease between neighbouring signals
    return lossRows[left][row] * (1 - blend) + lossRows[right][row] * blend
  }
  const vertexAt = (column: number, row: number) => {
    const loss = columnLoss(column, row)
    return {
      x: (column / (columnCount - 1)) * width - width / 2,
      y: yOf(loss),
      z: (row / (LANDSCAPE_ROWS - 1) - 0.5) * TIME_DEPTH,
      color: lossColor(loss),
    }
  }
  const surfacePositions: number[] = []
  const surfaceColors: number[] = []
  for (let row = 0; row < LANDSCAPE_ROWS; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const vertex = vertexAt(column, row)
      surfacePositions.push(vertex.x, vertex.y, vertex.z)
      surfaceColors.push(vertex.color.r, vertex.color.g, vertex.color.b)
    }
  }
  const surfaceIndex: number[] = []
  for (let row = 0; row + 1 < LANDSCAPE_ROWS; row += 1) {
    for (let column = 0; column + 1 < columnCount; column += 1) {
      const a = row * columnCount + column
      const c = a + columnCount
      surfaceIndex.push(a, c, a + 1, a + 1, c, c + 1)
    }
  }
  const surfaceGeometry = new THREE.BufferGeometry()
  surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(surfacePositions, 3))
  surfaceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(surfaceColors, 3))
  surfaceGeometry.setIndex(surfaceIndex)
  hologram.add(new THREE.Mesh(
    surfaceGeometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: light ? 0.32 : 0.24,
      side: THREE.DoubleSide,
      blending,
      depthWrite: false,
    }),
  ))

  // Wireframe over the surface (every other time row; each signal and the half-steps between),
  // plus its shadow on the floor like a contour map.
  const wirePositions: number[] = []
  const wireColors: number[] = []
  const shadow: number[] = []
  const addWire = (from: ReturnType<typeof vertexAt>, to: ReturnType<typeof vertexAt>) => {
    wirePositions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    wireColors.push(from.color.r, from.color.g, from.color.b, to.color.r, to.color.g, to.color.b)
    shadow.push(from.x, 0.001, from.z, to.x, 0.001, to.z)
  }
  const halfStep = Math.max(LANDSCAPE_SUBDIVISIONS / 2, 1)
  for (let row = 0; row < LANDSCAPE_ROWS; row += 2) {
    for (let column = 0; column + 1 < columnCount; column += 1) addWire(vertexAt(column, row), vertexAt(column + 1, row))
  }
  for (let column = 0; column < columnCount; column += halfStep) {
    for (let row = 0; row + 1 < LANDSCAPE_ROWS; row += 1) addWire(vertexAt(column, row), vertexAt(column, row + 1))
  }
  const wireGeometry = new THREE.BufferGeometry()
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3))
  wireGeometry.setAttribute('color', new THREE.Float32BufferAttribute(wireColors, 3))
  hologram.add(new THREE.LineSegments(
    wireGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: light ? 0.8 : 0.7, blending, depthWrite: false }),
  ))
  hologram.add(line(shadow, light ? 0.14 : 0.09))

  // Each actual answer, as a marker at its own loss.
  const positions: number[] = []
  const colors: number[] = []
  for (const point of history.points) {
    const loss = lossOf(point.score)
    const color = lossColor(loss)
    positions.push(xOf(point.signal), yOf(loss), zOf(Date.parse(point.createdAt)))
    colors.push(color.r, color.g, color.b)
  }
  const pointGeometry = new THREE.BufferGeometry()
  pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  pointGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const glow = glowTexture()
  const pointMaterial = new THREE.PointsMaterial({
    size: POINT_SIZE,
    map: glow,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending,
    sizeAttenuation: true,
  })
  const pointCloud = new THREE.Points(pointGeometry, pointMaterial)
  hologram.add(pointCloud)

  // Labels: signals along the front, dates down the side, axis names.
  for (const signal of signals) {
    const label = textSprite(compact(signal.label), accent, 0.34)
    label.position.set(xOf(signal.key), -0.05, TIME_DEPTH / 2 + 0.55)
    hologram.add(label)
  }
  for (let tick = 0; tick < TIME_TICKS; tick += 1) {
    const fraction = tick / (TIME_TICKS - 1)
    const date = new Date(tMin + fraction * (tMax - tMin))
    const localDate = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
    const label = textSprite(formatCalendarDate(localDate), accent, 0.32)
    label.position.set(-width / 2 - 1.25, 0, (fraction - 0.5) * TIME_DEPTH)
    hologram.add(label)
  }
  const axisColor = accent.clone().lerp(new THREE.Color(light ? 0x000000 : 0xffffff), 0.35)
  const xTitle = textSprite('X · SIGNALS', axisColor, 0.42, 700)
  xTitle.position.set(0, -0.05, TIME_DEPTH / 2 + 1.45)
  const yTitle = textSprite('Y · TIME', axisColor, 0.42, 700)
  yTitle.position.set(-width / 2 - 2.7, 0, 0)
  const zTitle = textSprite('Z · LOSS', axisColor, 0.42, 700)
  zTitle.position.set(-width / 2 - 0.6, SCORE_HEIGHT + 0.55, -TIME_DEPTH / 2)
  hologram.add(xTitle, yTitle, zTitle)

  const target = new THREE.Vector3(0, SCORE_HEIGHT * 0.22, 0.6)
  camera.position.set(width * 0.5 + 4, SCORE_HEIGHT * 1.5, TIME_DEPTH * 0.78 + 3.5)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(target)
  controls.enableDamping = true
  controls.minDistance = 4
  controls.maxDistance = 40
  controls.maxPolarAngle = Math.PI * 0.49
  controls.autoRotate = !reduceMotion
  controls.autoRotateSpeed = 0.5
  const stopRotating = () => {
    controls.autoRotate = false
  }
  controls.addEventListener('start', stopRotating)

  const resize = () => {
    const { clientWidth, clientHeight } = container
    if (!clientWidth || !clientHeight) return
    renderer.setSize(clientWidth, clientHeight, false)
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
  }
  resize()
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)

  // Hover: find the nearest point under the pointer.
  const raycaster = new THREE.Raycaster()
  raycaster.params.Points = { threshold: 0.18 }
  const pointer = new THREE.Vector2()
  const onPointerMove = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObject(pointCloud)[0]
    if (hit?.index === undefined) {
      setTooltip(null)
      return
    }
    const point = history.points[hit.index]
    setTooltip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      point,
      label: signalLabels.get(point.signal) ?? point.signal,
    })
  }
  const onPointerLeave = () => setTooltip(null)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)

  // Only animate while the card is on screen.
  let visible = true
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
  })
  visibilityObserver.observe(container)
  let frame = 0
  const clock = new THREE.Clock()
  const animate = () => {
    frame = requestAnimationFrame(animate)
    if (!visible) return
    const elapsed = clock.getElapsedTime()
    if (!reduceMotion) pointMaterial.size = POINT_SIZE * (1 + 0.08 * Math.sin(elapsed * 2.2))
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  return () => {
    cancelAnimationFrame(frame)
    resizeObserver.disconnect()
    visibilityObserver.disconnect()
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
    controls.removeEventListener('start', stopRotating)
    controls.dispose()
    disposeScene(scene)
    renderer.dispose()
    renderer.domElement.remove()
    setTooltip(null)
  }
}

export default function SignalHologram() {
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [history, setHistory] = useState<SignalHistory | null>(null)
  const [error, setError] = useState('')
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [webgl] = useState(webglAvailable)

  useEffect(() => {
    const controller = new AbortController()
    fetch(apiUrl(`/api/history/signals?tz=${encodeURIComponent(viewerTimeZone())}`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Signal history unavailable (${response.status})`)
        setHistory((await response.json()) as SignalHistory)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Signal history unavailable')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !history?.points.length || !webgl) return
    // Wait a frame: the theme's CSS variables update in an effect that runs after this one.
    let unmount: (() => void) | undefined
    const frame = requestAnimationFrame(() => {
      unmount = mountHologram(container, history, theme === 'light-high-contrast', setTooltip)
    })
    return () => {
      cancelAnimationFrame(frame)
      unmount?.()
    }
  }, [history, theme, webgl])

  const points = history?.points ?? []
  const first = points[0]?.date
  const last = points.at(-1)?.date
  const summary = history
    ? `${points.length} scores across ${history.signals.length} signals${first && last ? `, ${formatCalendarDate(first)} – ${formatCalendarDate(last)}` : ''}`
    : ''

  return (
    <section className="daily-work-history signal-hologram" aria-label="Signal loss landscape">
      <div className="daily-work-history-header">
        <div>
          <p className="dashboard-activity-eyebrow">Signal Loss Landscape</p>
          {summary ? <p className="history-day-summary">{summary} · all time</p> : null}
        </div>
        <div className="signal-hologram-legend" aria-label="Loss colors: low loss to high loss">
          <span>low loss</span>
          <span className="signal-hologram-gradient" aria-hidden="true" />
          <span>high loss</span>
          <span className="signal-hologram-legend-note">loss = 100 − score</span>
        </div>
      </div>
      {error ? <p className="coach-error" role="alert">{error}</p> : null}
      {!history && !error ? <p className="dashboard-mode-meta">Projecting signal history…</p> : null}
      {history && !points.length ? <p className="dashboard-mode-meta">No scored signals yet. Answer a few questions to shape the landscape.</p> : null}
      {points.length && !webgl ? (
        <p className="dashboard-mode-meta">The 3D view needs WebGL, which this browser has turned off.</p>
      ) : null}
      {points.length && webgl ? (
        <div
          ref={containerRef}
          className="signal-hologram-stage"
          role="img"
          aria-label={`3D loss landscape of signals over time (loss is 100 minus score): ${summary}. Drag to rotate, scroll to zoom.`}
        >
          <div className="signal-hologram-scanlines" aria-hidden="true" />
          {tooltip ? (
            <div className="signal-hologram-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="status">
              <strong>{tooltip.label}</strong>
              <span>loss {lossOf(tooltip.point.score).toFixed(1)} · score {tooltip.point.score.toFixed(1)}</span>
              <span>{formatCalendarDate(tooltip.point.date)}</span>
              <span>{tooltip.point.algorithm}</span>
              {tooltip.point.title ? <span className="signal-hologram-tooltip-title">{tooltip.point.title}</span> : null}
            </div>
          ) : null}
          <p className="signal-hologram-hint" aria-hidden="true">Drag to rotate · scroll to zoom · hover a point</p>
        </div>
      ) : null}
    </section>
  )
}
