import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { NAV_PAGES } from './navPages'
import { useTheme } from './theme'

type TopNavProps = {
  /** The practice screen's current question type (MCQ, Recall, Ghost); other pages leave it out. */
  questionType?: string
  /**
   * How the question type last changed: its text slides up (Cmd + ↑↑) or down (Cmd + ↓↓) into
   * place. A new `id` replays the slide.
   */
  questionTypeMotion?: { direction: 'up' | 'down'; id: number } | null
  practiceHistoryHref?: string
  rightExtras?: ReactNode
  /** Keep the bar fixed to the top of the window while the page scrolls. */
  pinned?: boolean
  /** Give the pinned bar a mostly opaque, full-width background. */
  solid?: boolean
}

export default function TopNav({
  questionType,
  questionTypeMotion = null,
  practiceHistoryHref = '/',
  rightExtras,
  pinned = false,
  solid = false,
}: TopNavProps) {
  const { theme, setTheme } = useTheme()
  const lightModeEnabled = theme === 'light-high-contrast'
  const themeLabel = theme === 'light-high-contrast' ? 'Light High Contrast' : 'Dark High Contrast'
  const toggleTheme = () => setTheme(lightModeEnabled ? 'dark-high-contrast' : 'light-high-contrast')

  return (
    <nav className={['navbar', pinned ? 'navbar-pinned' : '', pinned && solid ? 'navbar-solid' : ''].filter(Boolean).join(' ')}>
      <div className="navbar-left">
        <Link to="/" className="navbar-brand">System 1</Link>
        {questionType ? (
          <>
            <span className="navbar-divider" />
            <span className="navbar-question-type" aria-label="Question type" aria-live="polite">
              <span
                key={questionTypeMotion?.id ?? 0}
                className={questionTypeMotion ? `navbar-question-type-text navbar-question-type-slide-${questionTypeMotion.direction}` : 'navbar-question-type-text'}
              >
                {questionType}
              </span>
            </span>
          </>
        ) : null}
      </div>
      <div className="navbar-right">
        {NAV_PAGES.map((page) => (
          <NavLink
            key={page.path}
            to={page.path === '/' ? practiceHistoryHref : page.path}
            end={page.path === '/'}
            className="navbar-dashboard"
          >
            {page.label}
          </NavLink>
        ))}
        <div className="navbar-theme">
          <button
            type="button"
            className={[
              'navbar-icon-button',
              lightModeEnabled ? 'navbar-icon-button-light-on' : 'navbar-icon-button-light-off',
            ].filter(Boolean).join(' ')}
            aria-label={`Switch theme. Current: ${themeLabel}`}
            aria-pressed={lightModeEnabled}
            onClick={toggleTheme}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="navbar-icon">
              <path
                className="navbar-lightbulb-rays"
                d="M12 1.75v2.1M4.75 4.75l1.48 1.48M19.25 4.75l-1.48 1.48M2.1 12h2.1M19.8 12h2.1"
              />
              <path
                className="navbar-lightbulb-glass"
                d="M12 5.8a5.2 5.2 0 0 0-3.26 9.25c.53.42.86.98.96 1.6h4.6c.1-.62.43-1.18.96-1.6A5.2 5.2 0 0 0 12 5.8Z"
              />
              <path className="navbar-lightbulb-base" d="M9.8 18.15h4.4M10.35 20.15h3.3" />
            </svg>
          </button>
        </div>
        {rightExtras}
      </div>
    </nav>
  )
}
