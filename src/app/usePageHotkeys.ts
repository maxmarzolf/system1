import { useLocation, useNavigate } from 'react-router-dom'
import { useDoubleTapArrows } from '@/shared/lib/useDoubleTapArrows'
import { NAV_PAGES, navPageIndex } from './navPages'

const PAGE_KEYS = ['ArrowLeft', 'ArrowRight'] as const

/** Cmd/Ctrl + a double-tapped ← or → moves to the neighbouring page in navbar order. */
export function usePageHotkeys() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useDoubleTapArrows(PAGE_KEYS, (key) => {
    const index = navPageIndex(pathname)
    if (index < 0) return
    const target = NAV_PAGES[index + (key === 'ArrowLeft' ? -1 : 1)]
    if (target) navigate(target.path)
  })
}
