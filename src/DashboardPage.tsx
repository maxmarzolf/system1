import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from './api'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'

type DimensionSummary = {
  verdictCounts?: Record<string, number>
}

type SkillMapModeReadiness = {
  readiness: number
  attemptCount: number
  ghostRepCount: number
  unsupportedAttemptCount: number
  workCount: number
  successfulAttempts: number
  avgAccuracy: number
  totalCards: number
  practicedCards: number
  untouchedCards: number
  staleCards: number
  lastSubmittedAt: string
  daysSinceLastSubmit: number | null
  stale: boolean
  dimensionSummary: DimensionSummary
}

type SkillMapPatternReadiness = {
  pattern: string
  slug: string
  methods: string[]
  overallReadiness: number
  overallAttemptCount: number
  ghostRepCount: number
  unsupportedAttemptCount: number
  workCount: number
  totalCards: number
  practicedCards: number
  untouchedCards: number
  staleCards: number
  dimensionSummary: DimensionSummary
  modes: Record<TemplateMode, SkillMapModeReadiness>
}

type SkillMapOverviewResponse = {
  patterns: SkillMapPatternReadiness[]
}

type TemplateMode = 'algorithm'

const readinessTone = (readiness: number) => {
  if (readiness >= 80) return 'success'
  if (readiness >= 50) return 'warning'
  return 'error'
}

const normalizePatternKey = (slug: string, pattern: string) =>
  (slug || pattern)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function SkillAlgorithmIllustration({ slug, pattern }: { slug: string; pattern: string }) {
  const patternKey = normalizePatternKey(slug, pattern)

  if (patternKey === 'sliding-window') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <rect className="skill-svg-highlight" x="48" y="25" width="63" height="34" rx="4" />
          <g className="skill-svg-grid">
            {[16, 48, 80, 112, 144].map((x) => (
              <rect key={x} x={x - 13} y="31" width="26" height="22" rx="2" />
            ))}
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M42 66h75" />
          <path className="skill-svg-line skill-svg-accent" d="m113 61 7 5-7 5" />
          <path className="skill-svg-line" d="M48 20v42M111 20v42" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'two-pointers') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            {[24, 52, 80, 108, 136].map((x) => (
              <rect key={x} x={x - 11} y="32" width="22" height="20" rx="2" />
            ))}
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M24 22v29M136 22v29" />
          <path className="skill-svg-line skill-svg-accent" d="M28 21h37" />
          <path className="skill-svg-line skill-svg-accent" d="m61 16 7 5-7 5" />
          <path className="skill-svg-line skill-svg-accent" d="M132 21H95" />
          <path className="skill-svg-line skill-svg-accent" d="m99 16-7 5 7 5" />
          <path className="skill-svg-line" d="M24 62h112" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'binary-search') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M20 24h120" />
          <path className="skill-svg-line skill-svg-muted" d="M42 43h76" />
          <path className="skill-svg-line skill-svg-muted" d="M61 62h38" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="80" cy="24" r="5" />
          <circle className="skill-svg-node" cx="80" cy="43" r="4" />
          <circle className="skill-svg-node" cx="80" cy="62" r="3.5" />
          <path className="skill-svg-line skill-svg-accent" d="M80 18v50" />
          <path className="skill-svg-line" d="M20 18v12M140 18v12M42 37v12M118 37v12M61 56v12M99 56v12" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'dfs-bfs') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M80 18 45 43M80 18l35 25M45 43 30 66M45 43l30 23M115 43l-20 23M115 43l25 23" />
          <path className="skill-svg-line skill-svg-accent" d="M80 18 45 43 30 66" />
          <g>
            <circle className="skill-svg-node skill-svg-accent-fill" cx="80" cy="18" r="7" />
            <circle className="skill-svg-node skill-svg-accent-fill" cx="45" cy="43" r="6" />
            <circle className="skill-svg-node skill-svg-accent-fill" cx="30" cy="66" r="5" />
            <circle className="skill-svg-node" cx="115" cy="43" r="6" />
            <circle className="skill-svg-node" cx="75" cy="66" r="5" />
            <circle className="skill-svg-node" cx="95" cy="66" r="5" />
            <circle className="skill-svg-node" cx="140" cy="66" r="5" />
          </g>
        </svg>
      </div>
    )
  }

  if (patternKey === 'backtracking') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M80 14 48 35M80 14l32 21M48 35 30 58M48 35l28 23M112 35 92 58M112 35l28 23" />
          <path className="skill-svg-line skill-svg-accent" d="M80 14 48 35 76 58" />
          <path className="skill-svg-line skill-svg-dashed" d="M76 58 48 35 112 35" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="80" cy="14" r="6" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="48" cy="35" r="5.5" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="76" cy="58" r="5" />
          <circle className="skill-svg-node" cx="112" cy="35" r="5.5" />
          <circle className="skill-svg-node" cx="30" cy="58" r="5" />
          <circle className="skill-svg-node" cx="92" cy="58" r="5" />
          <circle className="skill-svg-node" cx="140" cy="58" r="5" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'heap-priority-queue') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M80 15 50 39M80 15l30 24M50 39 34 63M50 39l25 24M110 39 88 63M110 39l28 24" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="80" cy="15" r="8" />
          <circle className="skill-svg-node" cx="50" cy="39" r="7" />
          <circle className="skill-svg-node" cx="110" cy="39" r="7" />
          <circle className="skill-svg-node" cx="34" cy="63" r="5.5" />
          <circle className="skill-svg-node" cx="75" cy="63" r="5.5" />
          <circle className="skill-svg-node" cx="88" cy="63" r="5.5" />
          <circle className="skill-svg-node" cx="138" cy="63" r="5.5" />
          <path className="skill-svg-line skill-svg-accent" d="M80 4v-1M70 8l-7-7M90 8l7-7" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'union-find') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line skill-svg-accent" d="M34 61 55 41M75 61 55 41M55 41V21" />
          <path className="skill-svg-line" d="M105 61 126 41M146 61 126 41" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="55" cy="21" r="7" />
          <circle className="skill-svg-node" cx="55" cy="41" r="6" />
          <circle className="skill-svg-node" cx="34" cy="61" r="6" />
          <circle className="skill-svg-node" cx="75" cy="61" r="6" />
          <circle className="skill-svg-node" cx="126" cy="41" r="7" />
          <circle className="skill-svg-node" cx="105" cy="61" r="6" />
          <circle className="skill-svg-node" cx="146" cy="61" r="6" />
          <path className="skill-svg-line skill-svg-dashed skill-svg-accent" d="M75 61c14-18 30-20 51-20" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'dynamic-programming') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            {[0, 1, 2, 3].map((row) =>
              [0, 1, 2, 3, 4].map((col) => (
                <rect
                  key={`${row}-${col}`}
                  className={row + col <= 4 ? 'skill-svg-cell-filled' : ''}
                  x={38 + col * 18}
                  y={13 + row * 15}
                  width="15"
                  height="12"
                  rx="2"
                />
              )),
            )}
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M45 19h36v15h18v15h18v15" />
          <path className="skill-svg-line skill-svg-accent" d="m113 59 5 5-6 4" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'graph-traversal') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M35 28 70 18l42 14 13 34-45 5-45-18 35-35M70 18l10 53M112 32 80 71M35 53l77-21" />
          <path className="skill-svg-line skill-svg-accent" d="M35 28 70 18 112 32 125 66" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="35" cy="28" r="6" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="70" cy="18" r="6" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="112" cy="32" r="6" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="125" cy="66" r="6" />
          <circle className="skill-svg-node" cx="35" cy="53" r="6" />
          <circle className="skill-svg-node" cx="80" cy="71" r="6" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'intervals') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line skill-svg-muted" d="M20 66h120" />
          <rect className="skill-svg-block" x="24" y="20" width="52" height="10" rx="3" />
          <rect className="skill-svg-block skill-svg-accent-fill" x="56" y="35" width="54" height="10" rx="3" />
          <rect className="skill-svg-block" x="106" y="50" width="32" height="10" rx="3" />
          <path className="skill-svg-line skill-svg-accent" d="M24 72h86" />
          <path className="skill-svg-line skill-svg-accent" d="M24 65v13M110 65v13" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'prefix-sums') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            <rect x="24" y="54" width="16" height="12" rx="2" />
            <rect x="48" y="46" width="16" height="20" rx="2" />
            <rect x="72" y="38" width="16" height="28" rx="2" />
            <rect x="96" y="30" width="16" height="36" rx="2" />
            <rect x="120" y="22" width="16" height="44" rx="2" />
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M24 54h16v-8h24v-8h24v-8h24v-8h24" />
          <path className="skill-svg-line skill-svg-muted" d="M20 66h120" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'monotonic-stack') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            <rect x="45" y="56" width="38" height="10" rx="2" />
            <rect x="45" y="43" width="30" height="10" rx="2" />
            <rect x="45" y="30" width="22" height="10" rx="2" />
            <rect x="45" y="17" width="14" height="10" rx="2" />
          </g>
          <rect className="skill-svg-block skill-svg-accent-fill" x="103" y="31" width="24" height="14" rx="2" />
          <path className="skill-svg-line skill-svg-accent" d="M101 38H75" />
          <path className="skill-svg-line skill-svg-accent" d="m79 33-7 5 7 5" />
          <path className="skill-svg-line skill-svg-dashed" d="M67 30c14-7 14-16-8-12" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'greedy-sorting') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            <rect x="16" y="48" width="12" height="20" rx="2" />
            <rect x="34" y="25" width="12" height="43" rx="2" />
            <rect x="52" y="39" width="12" height="29" rx="2" />
            <rect x="96" y="50" width="12" height="18" rx="2" />
            <rect className="skill-svg-cell-filled" x="114" y="36" width="12" height="32" rx="2" />
            <rect className="skill-svg-cell-filled" x="132" y="20" width="12" height="48" rx="2" />
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M67 43h22" />
          <path className="skill-svg-line skill-svg-accent" d="m84 37 7 6-7 6" />
          <path className="skill-svg-line skill-svg-muted" d="M12 69h136" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="120" cy="15" r="3" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'trees') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M80 16 45 39m35-23 35 23M45 39 27 66m18-27 24 27m46-27-24 27m24-27 18 27" />
          <path className="skill-svg-line skill-svg-accent" d="M80 16 115 39 91 66" />
          <circle className="skill-svg-node" cx="80" cy="16" r="8" />
          <circle className="skill-svg-node" cx="45" cy="39" r="7" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="115" cy="39" r="7" />
          <circle className="skill-svg-node" cx="27" cy="66" r="6" />
          <circle className="skill-svg-node" cx="69" cy="66" r="6" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="91" cy="66" r="6" />
          <circle className="skill-svg-node" cx="133" cy="66" r="6" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'stacks-queues') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M22 22v48h45V22" />
          <g className="skill-svg-grid">
            <rect x="28" y="53" width="33" height="11" rx="2" />
            <rect x="28" y="39" width="33" height="11" rx="2" />
            <rect className="skill-svg-cell-filled" x="28" y="25" width="33" height="11" rx="2" />
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M44 16V8m0 0-5 6m5-6 5 6" />
          <g className="skill-svg-grid">
            <rect className="skill-svg-cell-filled" x="88" y="38" width="18" height="18" rx="3" />
            <rect x="109" y="38" width="18" height="18" rx="3" />
            <rect x="130" y="38" width="18" height="18" rx="3" />
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M78 47h8m-4-5 5 5-5 5M135 28h13v8" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'matrix-grid') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <g className="skill-svg-grid">
            {[0, 1, 2, 3].map((row) =>
              [0, 1, 2, 3, 4, 5].map((col) => (
                <rect
                  key={`${row}-${col}`}
                  className={[[0, 0], [0, 1], [1, 1], [2, 1], [2, 2], [2, 3], [3, 3], [3, 4], [3, 5]].some(([r, c]) => r === row && c === col) ? 'skill-svg-cell-filled' : ''}
                  x={25 + col * 19}
                  y={10 + row * 18}
                  width="16"
                  height="15"
                  rx="2"
                />
              )),
            )}
          </g>
          <path className="skill-svg-line skill-svg-accent" d="M33 17h19v18 18h19 19v18h19 19" />
          <path className="skill-svg-line skill-svg-accent" d="m124 66 6 5-6 5" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'linked-lists') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          {[26, 64, 102].map((x, index) => (
            <g key={x}>
              <rect className={index === 1 ? 'skill-svg-block skill-svg-accent-fill' : 'skill-svg-block'} x={x - 14} y="31" width="28" height="24" rx="4" />
              <circle className={index === 1 ? 'skill-svg-node skill-svg-accent-fill' : 'skill-svg-node'} cx={x} cy="43" r="3" />
            </g>
          ))}
          <path className="skill-svg-line skill-svg-accent" d="M40 43h10m-4-5 6 5-6 5m32-5h10m-4-5 6 5-6 5m32-5h17" />
          <path className="skill-svg-line" d="m133 36 10 14m0-14-10 14" />
          <path className="skill-svg-line skill-svg-dashed" d="M64 27c0-15 38-15 38 0" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'trie') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M80 14 46 36m34-22 34 22M46 36 28 62m18-26 22 26m46-26-18 26m18-26 22 26" />
          <path className="skill-svg-line skill-svg-accent" d="M80 14 114 36 136 62" />
          <g className="skill-svg-labels">
            <text x="80" y="18">•</text>
            <text x="46" y="40">c</text>
            <text className="skill-svg-label-accent" x="114" y="40">t</text>
            <text x="28" y="66">a</text>
            <text x="68" y="66">o</text>
            <text x="96" y="66">e</text>
            <text className="skill-svg-label-accent" x="136" y="66">o</text>
          </g>
          <circle className="skill-svg-node skill-svg-accent-fill" cx="143" cy="58" r="2.5" />
        </svg>
      </div>
    )
  }

  if (patternKey === 'topological-sort') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <path className="skill-svg-line" d="M24 22h28m-5-5 7 5-7 5M54 22l25 20m-6-1 8 2-4-7M81 43h27m-5-5 7 5-7 5M110 43l24 20m-6 0 8 2-3-7" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="22" cy="22" r="7" />
          <circle className="skill-svg-node" cx="55" cy="22" r="7" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="81" cy="43" r="7" />
          <circle className="skill-svg-node" cx="110" cy="43" r="7" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="136" cy="65" r="7" />
          <path className="skill-svg-line skill-svg-accent" d="M19 75h120" />
          <g className="skill-svg-order-marks">
            <circle cx="22" cy="75" r="3" /><circle cx="81" cy="75" r="3" /><circle cx="136" cy="75" r="3" />
          </g>
        </svg>
      </div>
    )
  }

  if (patternKey === 'meta') {
    return (
      <div className="skill-map-illustration" aria-hidden="true">
        <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
          <rect className="skill-svg-block" x="31" y="14" width="78" height="50" rx="6" transform="rotate(-7 70 39)" />
          <rect className="skill-svg-block" x="45" y="18" width="78" height="50" rx="6" transform="rotate(5 84 43)" />
          <rect className="skill-svg-block skill-svg-accent-fill" x="41" y="21" width="78" height="50" rx="6" />
          <path className="skill-svg-line skill-svg-muted" d="M54 35h31M54 45h42M54 55h24" />
          <circle className="skill-svg-node skill-svg-accent-fill" cx="102" cy="53" r="11" />
          <path className="skill-svg-play" d="m99 47 9 6-9 6Z" />
          <path className="skill-svg-line skill-svg-accent" d="M126 20v10m-5-5h10M132 41l5 5m0-5-5 5" />
        </svg>
      </div>
    )
  }

  return (
    <div className="skill-map-illustration" aria-hidden="true">
      <svg className="skill-map-illustration-svg" viewBox="0 0 160 86">
        <path className="skill-svg-line" d="M36 24h88M36 43h88M36 62h88" />
        <circle className="skill-svg-node skill-svg-accent-fill" cx="55" cy="24" r="5" />
        <circle className="skill-svg-node" cx="89" cy="43" r="5" />
        <circle className="skill-svg-node" cx="70" cy="62" r="5" />
      </svg>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<SkillMapOverviewResponse | null>(null)
  const configuredProviderLabel = useConfiguredProviderLabel()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadOverview = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(apiUrl('/api/skill-map-overview'))
        if (!response.ok) {
          throw new Error('Failed to load skill map overview')
        }
        const payload = (await response.json()) as SkillMapOverviewResponse
        setOverview(payload)
      } catch {
        setOverview(null)
        setError('Unable to load readiness tracking right now.')
      } finally {
        setLoading(false)
      }
    }

    void loadOverview()
  }, [])

  const patterns = overview?.patterns ?? []
  const launchFocusedPractice = (patternSlug: string) => {
    const nextParams = new URLSearchParams({
      focusPattern: patternSlug,
    })
    navigate(`/?${nextParams.toString()}`)
  }

  return (
    <div className="app app-dashboard">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} />

      <section className="dashboard">
        {error && <p className="skill-map-intro">{error}</p>}

        <div className="skill-map-grid">
          {loading && !error && <p className="skill-map-intro">Loading readiness overview...</p>}
          {patterns.map((node) => {
            const isMeta = node.slug === 'meta'
            return (
              <article key={node.slug} className="skill-map-card">
                <div className="skill-map-header">
                  <h3>{node.pattern}</h3>
                  <span className={`coach-status-value coach-status-value-${readinessTone(node.overallReadiness)}`}>
                    {node.overallReadiness}%
                  </span>
                </div>
                <div className="dashboard-summary skill-map-card-stats">
                  <span className="coach-metric-chip">{node.totalCards} {isMeta ? 'meta questions' : 'core algorithms'}</span>
                  <span className="coach-metric-chip">{node.staleCards} stale</span>
                  <span className="coach-metric-chip">{node.ghostRepCount} Ghost Reps</span>
                </div>
                <SkillAlgorithmIllustration slug={node.slug} pattern={node.pattern} />
                <div className="dashboard-mode-tabs">
                  <button
                    type="button"
                    className="dashboard-mode-tab dashboard-mode-tab-actionable"
                    onClick={() => launchFocusedPractice(node.slug)}
                  >
                    <span className="dashboard-mode-tab-label">{isMeta ? 'Start playlist' : 'Start practice'}</span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>

      </section>
    </div>
  )
}
