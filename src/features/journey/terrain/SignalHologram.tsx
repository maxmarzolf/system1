import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { errorMessage } from '@/api/client'
import { useSignalHistory } from '@/api/queries'
import { formatCalendarDate } from '@/shared/lib/dailyWork'
import SignalHologramHeader from './SignalHologramHeader'
import { LANDSCAPE_ROWS, shortfallOf, signalShortfallRows, timeFraction, timeRange } from './signalTerrain'
import { Link } from 'react-router-dom'
import { useTheme } from '@/app/theme'

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
const LANDSCAPE_SUBDIVISIONS = 6 // samples between neighbouring signals
// Reveal: the terrain rises from flat while the camera eases in; dots and labels follow.
const REVEAL_MS = 1600
const REVEAL_MS_REDUCED = 400 // reduced motion: a plain fade
const REVEAL_DOLLY = 0.35 // the camera starts this much farther out
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const phase = (t: number, start: number, end: number) => Math.min(Math.max((t - start) / (end - start), 0), 1)

const cssColor = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  try {
    return new THREE.Color(value || fallback)
  } catch {
    return new THREE.Color(fallback)
  }
}

const LABEL_FONT = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace"

/** A crisp round dot used for every point (no halo). */
const dotTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.arc(32, 32, 26, 0, Math.PI * 2)
  context.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Camera-facing monospace text. */
const textSprite = (text: string, color: THREE.Color, worldHeight = 0.2, weight = 400) => {
  const fontSize = 48
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const font = `${weight} ${fontSize}px ${LABEL_FONT}`
  context.font = font
  const width = Math.ceil(context.measureText(text).width) + 24
  canvas.width = width
  canvas.height = fontSize + 24
  context.font = font
  context.textBaseline = 'middle'
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
  const blending = THREE.NormalBlending
  const accent = cssColor('--hc-accent', '#6fc3df')
  const partial = cssColor('--hc-warning', '#cca700')
  const failing = cssColor('--hc-error', '#f48771')
  // Valleys (low shortfall) glow in the accent color, rising through warning to error at the peaks.
  const shortfallColor = (shortfall: number) => {
    const t = Math.min(Math.max(shortfall / 100, 0), 1)
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
  const range = timeRange(history.points)
  const { tMin, tMax } = range
  const xOf = (key: string) => (signalIndex.get(key) ?? 0) * SIGNAL_SPACING - width / 2
  // Newest answers sit at the front, nearest the viewer.
  const zOf = (time: number) => (timeFraction(time, range) - 0.5) * TIME_DEPTH
  const yOf = (shortfall: number) => (shortfall / 100) * SCORE_HEIGHT

  const hologram = new THREE.Group()
  scene.add(hologram)

  // The landscape: one surface over signals (x) and time (depth), height = smoothed shortfall.
  const shortfallRows = signalShortfallRows(history, range)
  const columnCount = Math.max(signals.length - 1, 1) * LANDSCAPE_SUBDIVISIONS + 1
  const columnShortfall = (column: number, row: number) => {
    const at = signals.length > 1 ? column / LANDSCAPE_SUBDIVISIONS : 0
    const left = Math.min(Math.floor(at), signals.length - 1)
    const right = Math.min(left + 1, signals.length - 1)
    const blend = (1 - Math.cos((at - left) * Math.PI)) / 2 // cosine ease between neighbouring signals
    return shortfallRows[left][row] * (1 - blend) + shortfallRows[right][row] * blend
  }
  const vertexAt = (column: number, row: number) => {
    const shortfall = columnShortfall(column, row)
    return {
      x: (column / (columnCount - 1)) * width - width / 2,
      y: yOf(shortfall),
      z: (row / (LANDSCAPE_ROWS - 1) - 0.5) * TIME_DEPTH,
      color: shortfallColor(shortfall),
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
  const surfaceOpacity = light ? 0.32 : 0.24
  const surfaceMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending,
    depthWrite: false,
  })
  hologram.add(new THREE.Mesh(surfaceGeometry, surfaceMaterial))

  // Wireframe over the surface: every other time row, and each signal plus the half-steps between.
  const wirePositions: number[] = []
  const wireColors: number[] = []
  const addWire = (from: ReturnType<typeof vertexAt>, to: ReturnType<typeof vertexAt>) => {
    wirePositions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    wireColors.push(from.color.r, from.color.g, from.color.b, to.color.r, to.color.g, to.color.b)
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
  const wireOpacity = light ? 0.8 : 0.7
  const wireMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending, depthWrite: false })
  hologram.add(new THREE.LineSegments(wireGeometry, wireMaterial))

  // Each actual answer, as a marker at its own shortfall.
  const positions: number[] = []
  const colors: number[] = []
  for (const point of history.points) {
    const shortfall = shortfallOf(point.score)
    const color = shortfallColor(shortfall)
    positions.push(xOf(point.signal), yOf(shortfall), zOf(Date.parse(point.createdAt)))
    colors.push(color.r, color.g, color.b)
  }
  const pointGeometry = new THREE.BufferGeometry()
  pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  pointGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const dot = dotTexture()
  const pointMaterial = new THREE.PointsMaterial({
    size: POINT_SIZE,
    map: dot,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending,
    sizeAttenuation: true,
  })
  const pointCloud = new THREE.Points(pointGeometry, pointMaterial)
  hologram.add(pointCloud)

  // Labels: signals along the front, dates down the side. They sit outside the rising group
  // so they never squash during the reveal.
  const labels: THREE.Sprite[] = []
  for (const signal of signals) {
    const label = textSprite(compact(signal.label), accent, 0.22)
    label.position.set(xOf(signal.key), -0.05, TIME_DEPTH / 2 + 0.55)
    labels.push(label)
  }
  for (let tick = 0; tick < TIME_TICKS; tick += 1) {
    const fraction = tick / (TIME_TICKS - 1)
    const date = new Date(tMin + fraction * (tMax - tMin))
    const localDate = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
    const label = textSprite(formatCalendarDate(localDate), accent, 0.2)
    label.position.set(-width / 2 - 1.25, 0, (fraction - 0.5) * TIME_DEPTH)
    labels.push(label)
  }
  for (const label of labels) {
    ;(label.material as THREE.SpriteMaterial).opacity = 0
    scene.add(label)
  }
  hologram.scale.y = 0.001

  const target = new THREE.Vector3(0, SCORE_HEIGHT * 0.22, 0.6)
  // Default view direction; the distance is fitted to the window in resize().
  const viewDirection = new THREE.Vector3(width * 0.5 + 4, SCORE_HEIGHT * 1.5, TIME_DEPTH * 0.78 + 3.5).sub(target).normalize()
  const sceneRadius = Math.hypot(width / 2 + 1.5, SCORE_HEIGHT / 2, TIME_DEPTH / 2 + 1)
  let userMoved = false
  const controls = new OrbitControls(camera, renderer.domElement)
  const stopRotating = () => {
    controls.autoRotate = false
    userMoved = true
  }
  controls.target.copy(target)
  controls.enableDamping = true
  controls.minDistance = 4
  controls.maxDistance = 40
  controls.maxPolarAngle = Math.PI * 0.49
  let revealed = false
  const resumeRotation = () => !reduceMotion && !userMoved && revealed
  controls.autoRotate = false // starts once the reveal settles
  controls.autoRotateSpeed = 0.5
  // The canvas fills the window, so plain wheel/trackpad scrolling must keep scrolling the page:
  // zoom only on pinch (sent as ctrl+wheel) or Ctrl/Cmd + scroll, and let vertical swipes scroll on touch.
  controls.enableZoom = false
  renderer.domElement.style.touchAction = 'pan-y'
  const offset = new THREE.Vector3()
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    stopRotating()
    offset.subVectors(camera.position, controls.target)
    const distance = THREE.MathUtils.clamp(offset.length() * Math.exp(event.deltaY * 0.0025), controls.minDistance, controls.maxDistance)
    camera.position.copy(controls.target).add(offset.setLength(distance))
  }
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
  controls.addEventListener('start', stopRotating)

  let fittedDistance = 20
  let dolly = reduceMotion ? 0 : REVEAL_DOLLY
  const placeCamera = () => camera.position.copy(target).addScaledVector(viewDirection, fittedDistance * (1 + dolly))
  const resize = () => {
    const { clientWidth, clientHeight } = container
    if (!clientWidth || !clientHeight) return
    renderer.setSize(clientWidth, clientHeight, false)
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
    if (!userMoved) {
      // Frame the whole landscape in whichever of the window's dimensions is tighter.
      const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2)
      const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect)
      fittedDistance = (sceneRadius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov))) * 0.8
      placeCamera()
    }
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
      // Resume spinning once off a dot, unless the user has taken over the camera.
      controls.autoRotate = resumeRotation()
      return
    }
    // Hold still while a dot's details are showing.
    controls.autoRotate = false
    const point = history.points[hit.index]
    setTooltip({
      x: event.clientX,
      y: event.clientY,
      point,
      label: signalLabels.get(point.signal) ?? point.signal,
    })
  }
  const onPointerLeave = () => {
    setTooltip(null)
    controls.autoRotate = resumeRotation()
  }
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
  // Compile the shaders now, while everything is still transparent, so the first visible frames
  // don't hitch (three.js otherwise compiles lazily on the first render).
  renderer.compile(scene, camera)
  const revealMs = reduceMotion ? REVEAL_MS_REDUCED : REVEAL_MS
  let revealStart = -1
  const reveal = (now: number) => {
    if (revealStart < 0) revealStart = now
    const t = Math.min((now - revealStart) / revealMs, 1)
    const fade = reduceMotion ? t : easeOutCubic(phase(t, 0, 0.45))
    surfaceMaterial.opacity = surfaceOpacity * fade
    wireMaterial.opacity = wireOpacity * fade
    pointMaterial.opacity = reduceMotion ? t : easeOutCubic(phase(t, 0.55, 1))
    for (const label of labels) (label.material as THREE.SpriteMaterial).opacity = reduceMotion ? t : easeOutCubic(phase(t, 0.35, 0.9))
    hologram.scale.y = reduceMotion ? 1 : Math.max(easeOutCubic(phase(t, 0.1, 0.85)), 0.001)
    if (!userMoved) {
      dolly = reduceMotion ? 0 : REVEAL_DOLLY * (1 - easeOutCubic(t))
      placeCamera()
    }
    if (t >= 1) {
      revealed = true
      controls.autoRotate = resumeRotation()
    }
  }
  const animate = (now: number = performance.now()) => {
    frame = requestAnimationFrame(animate)
    if (!visible) return
    if (!revealed) reveal(now)
    const elapsed = clock.getElapsedTime()
    if (!reduceMotion && revealed) pointMaterial.size = POINT_SIZE * (1 + 0.08 * Math.sin(elapsed * 2.2))
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
    renderer.domElement.removeEventListener('wheel', onWheel)
    controls.dispose()
    disposeScene(scene)
    renderer.dispose()
    renderer.domElement.remove()
    setTooltip(null)
  }
}

/** Hover card for a dot: placed beside the pointer, flipped and clamped to stay inside the window. */
function DotTooltip({ tooltip }: { tooltip: Tooltip }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const card = ref.current
    if (!card) return
    const gap = 12
    const margin = 8
    const { width, height } = card.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight
    // Prefer above-right of the pointer; flip below / to the left when there isn't room.
    let left = tooltip.x + gap
    if (left + width > viewportWidth - margin) left = tooltip.x - gap - width
    let top = tooltip.y - gap - height
    if (top < margin) top = tooltip.y + gap
    card.style.left = `${Math.min(Math.max(left, margin), Math.max(viewportWidth - width - margin, margin))}px`
    card.style.top = `${Math.min(Math.max(top, margin), Math.max(viewportHeight - height - margin, margin))}px`
  }, [tooltip])
  return (
    <div ref={ref} className="signal-hologram-tooltip" role="status">
      <strong>{tooltip.label}</strong>
      <span>score {tooltip.point.score.toFixed(1)} / 100</span>
      <span>{formatCalendarDate(tooltip.point.date)}</span>
      <span>{tooltip.point.algorithm}</span>
      {tooltip.point.title ? <span className="signal-hologram-tooltip-title">{tooltip.point.title}</span> : null}
    </div>
  )
}

export default function SignalHologram() {
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const signalHistory = useSignalHistory<SignalHistory>()
  const history = signalHistory.error ? null : signalHistory.data ?? null
  const error = signalHistory.error ? errorMessage(signalHistory.error, 'Signal history unavailable') : ''
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [webgl] = useState(webglAvailable)

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

  // Stretch the stage to the whole browser window: from the window's top and left edges,
  // as wide and as tall as the window.
  useLayoutEffect(() => {
    const section = sectionRef.current
    const stage = containerRef.current
    if (!section || !stage) return
    const place = () => {
      const rect = section.getBoundingClientRect()
      const pageTop = rect.top + window.scrollY
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = window.innerHeight
      stage.style.top = `${-pageTop}px`
      stage.style.left = `${-rect.left}px`
      stage.style.width = `${viewportWidth}px`
      stage.style.height = `${viewportHeight}px`
      // Exactly as tall as the snap area (window minus the snap offset): a taller section lets the
      // browser scroll freely inside it instead of snapping. The bottom margin then pushes the next
      // section far enough down that, snapped, the stage and its /do and /build buttons are off screen.
      section.style.minHeight = `${Math.floor(viewportHeight - pageTop)}px`
      section.style.marginBottom = `${Math.ceil(pageTop)}px`
      // Journey snaps every section to where this first one starts, so the top snap point is
      // exactly the unscrolled page (measured, since the nav's size and margin vary by page).
      document.documentElement.style.setProperty('--journey-snap-padding', `${pageTop}px`)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(document.documentElement)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      section.style.minHeight = ''
      section.style.marginBottom = ''
      document.documentElement.style.removeProperty('--journey-snap-padding')
    }
  }, [history, webgl])

  const points = history?.points ?? []
  const first = points[0]?.date
  const last = points.at(-1)?.date
  const summary = history
    ? `${points.length} scores across ${history.signals.length} signals${first && last ? `, ${formatCalendarDate(first)} – ${formatCalendarDate(last)}` : ''}`
    : ''

  return (
    <section ref={sectionRef} className="signal-hologram" aria-label="Signal score terrain">
      <SignalHologramHeader summary={summary} />
      {error ? <p className="coach-error" role="alert">{error}</p> : null}
      {!history && !error ? <p className="dashboard-mode-meta signal-hologram-loading">Mapping signal scores…</p> : null}
      {history && !points.length ? <p className="dashboard-mode-meta">No scored signals yet. Answer a few questions to shape the terrain.</p> : null}
      {points.length && !webgl ? (
        <p className="dashboard-mode-meta">The 3D view needs WebGL, which this browser has turned off.</p>
      ) : null}
      {points.length && webgl ? (
        <div
          ref={containerRef}
          className="signal-hologram-stage"
          role="img"
          aria-label={`3D terrain of signal scores over time; height is 100 minus the score, so peaks are weak spots: ${summary}. Drag to rotate; pinch or hold Ctrl or Command and scroll to zoom.`}
        >
          {/* Portaled to <body> so it draws above the pinned nav and the page header. */}
          {tooltip ? createPortal(<DotTooltip tooltip={tooltip} />, document.body) : null}
          {/* Inside the full-window stage, so these sit at the bottom of the screen. */}
          <nav className="signal-hologram-actions" aria-label="Start working">
            <Link to="/practice" className="signal-hologram-action">/do</Link>
            <Link to="/practice?panel=flow" className="signal-hologram-action">/build</Link>
          </nav>
          <p className="signal-hologram-hint" aria-hidden="true">Drag to rotate · pinch or ⌘/Ctrl + scroll to zoom · hover a dot</p>
        </div>
      ) : null}
    </section>
  )
}
