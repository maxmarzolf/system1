import { Link } from 'react-router-dom'
import { type ReactNode, type RefObject } from 'react'
import { useTheme } from './theme'

type TopNavProps = {
  llmProviderLabel?: string
  llmProviderMenu?: ReactNode
  llmProviderMenuOpen?: boolean
  onToggleLlmProviderMenu?: () => void
  llmProviderMenuRef?: RefObject<HTMLDivElement | null>
  sessionCounterText?: string
  practiceHistoryHref?: string
  rightExtras?: ReactNode
}

export default function TopNav({
  llmProviderLabel = 'ChatGPT',
  llmProviderMenu,
  llmProviderMenuOpen = false,
  onToggleLlmProviderMenu,
  llmProviderMenuRef,
  sessionCounterText,
  practiceHistoryHref = '/practice-history',
  rightExtras,
}: TopNavProps) {
  const { theme, setTheme } = useTheme()
  const lightModeEnabled = theme === 'light-high-contrast'
  const themeLabel = theme === 'light-high-contrast' ? 'Light High Contrast' : 'Dark High Contrast'
  const toggleTheme = () => setTheme(lightModeEnabled ? 'dark-high-contrast' : 'light-high-contrast')

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-brand">System 1 Trainer</Link>
        <span className="navbar-divider" />
        <div className="navbar-group llm-provider-group" ref={llmProviderMenuRef}>
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
          {llmProviderMenu}
        </div>
      </div>
      <div className="navbar-right">
        {sessionCounterText && <span className="navbar-counter">{sessionCounterText}</span>}
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
        <Link to="/coach-tuning" className="navbar-dashboard">Tune Coach</Link>
        <Link to="/submission-tuning" className="navbar-dashboard">Tune Submission</Link>
        <Link to={practiceHistoryHref} className="navbar-dashboard">History</Link>
        <Link to="/dashboard" className="navbar-dashboard">Dashboard</Link>
        {rightExtras}
      </div>
    </nav>
  )
}
