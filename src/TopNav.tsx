import { Link } from 'react-router-dom'
import type { ReactNode, RefObject } from 'react'

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
  const navButtonClass = (active: boolean) => (active ? 'nav-tab active' : 'nav-tab')

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
        <Link to="/coach-tuning" className="navbar-dashboard">Tune Coach</Link>
        <Link to="/submission-tuning" className="navbar-dashboard">Tune Submission</Link>
        <Link to={practiceHistoryHref} className="navbar-dashboard">History</Link>
        <Link to="/dashboard" className="navbar-dashboard">Dashboard</Link>
        {rightExtras}
      </div>
    </nav>
  )
}
