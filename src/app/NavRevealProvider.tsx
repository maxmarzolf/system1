import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { NavRevealContext } from './navRevealContext'

/** Keep the links visible briefly after a route change, across page component remounts. */
export function NavRevealProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [seenPath, setSeenPath] = useState(pathname)
  const [routeChange, setRouteChange] = useState(0)
  const [revealed, setRevealed] = useState(false)

  if (pathname !== seenPath) {
    setSeenPath(pathname)
    setRouteChange((count) => count + 1)
    setRevealed(true)
  }

  useEffect(() => {
    if (routeChange === 0) return
    const timeout = window.setTimeout(() => setRevealed(false), 2400)
    return () => window.clearTimeout(timeout)
  }, [routeChange])

  return <NavRevealContext.Provider value={revealed}>{children}</NavRevealContext.Provider>
}
