import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

type TopNavProps = {
  activeLabel: string
  leftExtras?: ReactNode
  rightExtras?: ReactNode
}

export default function TopNav({ activeLabel, leftExtras, rightExtras }: TopNavProps) {
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
        {leftExtras}
      </div>
      <div className="navbar-right">
        {rightExtras}
      </div>
    </nav>
  )
}
