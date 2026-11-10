/** The top-level pages, in navbar order (left to right). Cmd/Ctrl + double-tapped arrows walk this list. */
export const NAV_PAGES = [
  { label: 'Practice', path: '/practice' },
  { label: 'Journey', path: '/' },
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Tune', path: '/tune' },
  { label: 'Evolve', path: '/evolve' },
  { label: 'Admin', path: '/admin' },
] as const

/** Two presses of the same Cmd/Ctrl + arrow within this window count as a double tap. */
export const PAGE_MOVE_DOUBLE_TAP_WINDOW_MS = 350

/** The navbar position of a pathname, or -1 for a page that is not in the navbar. */
export const navPageIndex = (pathname: string) => {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return NAV_PAGES.findIndex((page) => page.path === normalized)
}
