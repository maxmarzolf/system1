import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type SkillMapNode = {
  pattern: string
  methods: string[]
}

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiUrl = (path: string) => `${API_BASE_URL}${path}`

export default function DashboardPage() {
  const [skillMap, setSkillMap] = useState<SkillMapNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadSkillMap = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(apiUrl('/api/skill-map'))
        if (!response.ok) {
          throw new Error('Failed to load skill map')
        }
        const payload = (await response.json()) as SkillMapNode[]
        setSkillMap(payload)
      } catch {
        setSkillMap([])
        setError('Unable to load skill map right now.')
      } finally {
        setLoading(false)
      }
    }

    void loadSkillMap()
  }, [])

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
        {error && <p className="skill-map-intro">{error}</p>}
        <div className="skill-map-grid">
          {loading && !error && <p className="skill-map-intro">Loading skill map...</p>}
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
