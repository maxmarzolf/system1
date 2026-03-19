import { Link } from 'react-router-dom'
import { skillMap } from './data/skill-map'

export default function DashboardPage() {
  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">LeetCode Flashcard Game</p>
          <p className="subtitle">Layered Skill Map</p>
        </div>
        <div className="meta">
          <Link to="/" className="nav-link">← Back to Practice</Link>
        </div>
      </header>

      <section className="dashboard">
        <h2>Layered Skill Map</h2>
        <p className="skill-map-intro">
          Level 1 is the pattern family you should recognize quickly. Level 2 is the small set of core methods and invariants you want to internalize inside that pattern.
        </p>
        <div className="skill-map-grid">
          {skillMap.map((node) => (
            <article key={node.pattern} className="skill-map-card">
              <div className="skill-map-header">
                <span className="skill-map-level">Level 1</span>
                <h3>{node.pattern}</h3>
              </div>
              <p className="skill-map-subtitle">Level 2: Core methods</p>
              <div className="skill-method-list">
                {node.methods.map((method) => (
                  <span key={method} className="skill-method-chip">{method}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
