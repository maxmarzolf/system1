import { Link } from 'react-router-dom'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useTheme, type AppTheme } from './theme'

type TopNavProps = {
  activeLabel: string
  sessionOrderType?: 'shuffled' | 'original'
  onSessionOrderTypeChange?: (next: 'shuffled' | 'original') => void
  llmProviderLabel?: string
  llmProviderMenu?: ReactNode
  llmProviderMenuOpen?: boolean
  onToggleLlmProviderMenu?: () => void
  llmProviderMenuRef?: RefObject<HTMLDivElement | null>
  liveEnabled?: boolean
  onToggleLive?: () => void
  sessionCounterText?: string
  practiceHistoryHref?: string
  rightExtras?: ReactNode
}

export default function TopNav({
  activeLabel,
  sessionOrderType = 'original',
  onSessionOrderTypeChange,
  llmProviderLabel = 'ChatGPT',
  llmProviderMenu,
  llmProviderMenuOpen = false,
  onToggleLlmProviderMenu,
  llmProviderMenuRef,
  liveEnabled = false,
  onToggleLive,
  sessionCounterText,
  practiceHistoryHref = '/practice-history',
  rightExtras,
}: TopNavProps) {
  const { theme, setTheme } = useTheme()
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const themeMenuRef = useRef<HTMLDivElement | null>(null)
  const navButtonClass = (active: boolean) => (active ? 'nav-tab active' : 'nav-tab')
  const themeLabel = theme === 'light-high-contrast' ? 'Light High Contrast' : 'Dark High Contrast'

  useEffect(() => {
    if (!themeMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!themeMenuRef.current?.contains(event.target as Node)) {
        setThemeMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [themeMenuOpen])

  const handleThemeSelect = (nextTheme: AppTheme) => {
    setTheme(nextTheme)
    setThemeMenuOpen(false)
  }

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-brand">System 1 Trainer</Link>
        <span className="navbar-divider" />
        <div className="navbar-group">
          <button className="nav-tab active" type="button">
            {activeLabel}
          </button>
        </div>
        <span className="navbar-divider" />
        <div className="navbar-group">
          <button
            type="button"
            className={navButtonClass(sessionOrderType === 'shuffled')}
            onClick={() => onSessionOrderTypeChange?.('shuffled')}
            disabled={!onSessionOrderTypeChange}
          >
            Randomize
          </button>
          <button
            type="button"
            className={navButtonClass(sessionOrderType === 'original')}
            onClick={() => onSessionOrderTypeChange?.('original')}
            disabled={!onSessionOrderTypeChange}
          >
            Original
          </button>
        </div>
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
        <span className="navbar-divider" />
        <div className="navbar-group navbar-group-live">
          <button
            type="button"
            className={liveEnabled ? 'navbar-toggle active' : 'navbar-toggle'}
            onClick={onToggleLive}
            aria-pressed={liveEnabled}
            aria-label={liveEnabled ? 'Turn live feedback off' : 'Turn live feedback on'}
            disabled={!onToggleLive}
          >
            <span className="navbar-toggle-label">Live</span>
            <span className={liveEnabled ? 'navbar-toggle-state on' : 'navbar-toggle-state off'}>
              {liveEnabled ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      </div>
      <div className="navbar-right">
        {sessionCounterText && <span className="navbar-counter">{sessionCounterText}</span>}
        <div className="navbar-theme" ref={themeMenuRef}>
          <button
            type="button"
            className={themeMenuOpen ? 'navbar-icon-button active' : 'navbar-icon-button'}
            aria-haspopup="listbox"
            aria-expanded={themeMenuOpen}
            aria-label={`Theme: ${themeLabel}`}
            onClick={() => setThemeMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="navbar-icon">
              <path
                d="M12 2.75 14.06 4l2.38-.43.44 2.37 1.94 1.44-1.24 2.06 1.24 2.06-1.94 1.44-.44 2.37-2.38-.43L12 19.25 9.94 18l-2.38.43-.44-2.37-1.94-1.44 1.24-2.06-1.24-2.06 1.94-1.44.44-2.37 2.38.43L12 2.75Zm0 5.1A4.15 4.15 0 1 0 12 16.15 4.15 4.15 0 0 0 12 7.85Z"
                fill="currentColor"
              />
            </svg>
          </button>
          {themeMenuOpen && (
            <div className="navbar-theme-menu navbar-picker-menu" role="listbox" aria-label="Theme options">
              <button
                type="button"
                role="option"
                aria-selected={theme === 'dark-high-contrast'}
                className={theme === 'dark-high-contrast' ? 'navbar-picker-option active' : 'navbar-picker-option'}
                onClick={() => handleThemeSelect('dark-high-contrast')}
              >
                <span>Dark High Contrast</span>
                {theme === 'dark-high-contrast' && <span className="navbar-picker-check">Active</span>}
              </button>
              <button
                type="button"
                role="option"
                aria-selected={theme === 'light-high-contrast'}
                className={theme === 'light-high-contrast' ? 'navbar-picker-option active' : 'navbar-picker-option'}
                onClick={() => handleThemeSelect('light-high-contrast')}
              >
                <span>Light High Contrast</span>
                {theme === 'light-high-contrast' && <span className="navbar-picker-check">Active</span>}
              </button>
            </div>
          )}
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
