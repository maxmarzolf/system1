import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { navPageIndex } from './navPages'

type Sweep = { id: number; direction: 'left' | 'right' }

/**
 * A faint band of light that sweeps across the window when the page changes, travelling
 * the way the navbar moved (rightward when the new page sits to the right).
 */
export default function PageSweep() {
  const { pathname } = useLocation()
  const [seenPath, setSeenPath] = useState(pathname)
  const [sweep, setSweep] = useState<Sweep | null>(null)

  if (pathname !== seenPath) {
    const from = navPageIndex(seenPath)
    const to = navPageIndex(pathname)
    setSeenPath(pathname)
    if (from >= 0 && to >= 0) setSweep((previous) => ({ id: (previous?.id ?? 0) + 1, direction: to > from ? 'right' : 'left' }))
  }

  if (!sweep) return null
  return (
    <div
      key={sweep.id}
      className={`page-sweep page-sweep-${sweep.direction}`}
      aria-hidden="true"
      data-testid="page-sweep"
      onAnimationEnd={() => setSweep(null)}
    />
  )
}
