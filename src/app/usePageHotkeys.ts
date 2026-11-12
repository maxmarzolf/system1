import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isEditableTarget } from '@/shared/lib/useDoubleTapArrows'
import { NAV_PAGES, navPageIndex } from './navPages'

/** Cmd/Ctrl + A/D cycles through pages; Cmd/Ctrl + Enter opens Total Recall from elsewhere. */
export function usePageHotkeys() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.shiftKey || (!event.metaKey && !event.ctrlKey)) return
      if (event.key === 'Enter') {
        if (navPageIndex(pathname) === 0) return
        event.preventDefault()
        event.stopPropagation()
        navigate('/practice', { state: { startTotalRecall: true } })
        return
      }
      if (isEditableTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key !== 'a' && key !== 'd') return
      const index = navPageIndex(pathname)
      if (index < 0) return
      const direction = key === 'a' ? 'left' : 'right'
      const offset = direction === 'left' ? -1 : 1
      const target = NAV_PAGES[(index + offset + NAV_PAGES.length) % NAV_PAGES.length]
      event.preventDefault()
      event.stopPropagation()
      navigate(target.path, { state: { pageSweep: { from: pathname, direction } } })
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [navigate, pathname])
}
