import { Link, NavLink } from 'react-router-dom'
import { type ReactNode, type RefObject } from 'react'
import { useTheme } from './theme'

type TopNavProps = {
  llmProviderLabel?: string
  llmProviderMenu?: ReactNode
  llmProviderMenuOpen?: boolean
  onToggleLlmProviderMenu?: () => void
  llmProviderMenuRef?: RefObject<HTMLDivElement | null>
  practiceHistoryHref?: string
  rightExtras?: ReactNode
  /** Keep the bar fixed to the top of the window while the page scrolls. */
  pinned?: boolean
  /** Give the pinned bar a mostly opaque, full-width background. */
  solid?: boolean
}

export default function TopNav({
  llmProviderLabel = 'Auto (OpenAI)',
  llmProviderMenu,
  llmProviderMenuOpen = false,
  onToggleLlmProviderMenu,
  llmProviderMenuRef,
  practiceHistoryHref = '/practice-history',
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
        <span className="navbar-divider" />
        <div className="navbar-group llm-provider-group" ref={llmProviderMenuRef}>
          {onToggleLlmProviderMenu || llmProviderMenu ? (
            <button
              type="button"
              className={llmProviderMenuOpen ? 'navbar-picker active' : 'navbar-picker'}
              aria-haspopup="listbox"
              aria-expanded={llmProviderMenuOpen}
              aria-label="Coach model"
              onClick={onToggleLlmProviderMenu}
              disabled={!onToggleLlmProviderMenu}
            >
              {llmProviderLabel}
            </button>
          ) : (
            <span className="navbar-picker" aria-label="Coach model auto selection">
              {llmProviderLabel}
            </span>
          )}
          {llmProviderMenu}
        </div>
      </div>
      <div className="navbar-right">
        <NavLink to="/dashboard" className="navbar-dashboard">Dashboard</NavLink>
        <NavLink to={practiceHistoryHref} className="navbar-dashboard">Journey</NavLink>
        <NavLink to="/tune" className="navbar-dashboard">Tune</NavLink>
        <NavLink to="/admin" className="navbar-dashboard">Admin</NavLink>
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
