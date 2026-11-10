import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import DashboardPage from './DashboardPage'
import { ThemeProvider } from './theme'
import { mockFetch } from './test/fetch'

const PATTERNS = [
  'sliding-window', 'two-pointers', 'binary-search', 'trees', 'backtracking', 'heap-priority-queue', 'union-find',
  'dynamic-programming', 'graph-traversal', 'intervals', 'prefix-sums', 'monotonic-stack', 'greedy-sorting',
  'stacks-queues', 'matrix-grid', 'linked-lists', 'trie', 'topological-sort', 'dfs-bfs', 'meta', 'something-else',
]

const node = (slug: string, overallReadiness: number) => ({
  algorithm: slug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
  slug,
  skills: [],
  overallReadiness,
  overallAttemptCount: 0,
  ghostRepCount: 2,
  unsupportedAttemptCount: 0,
  workCount: 0,
  totalCards: 4,
  practicedCards: 1,
  untouchedCards: 3,
  staleCards: 1,
  dimensionSummary: {},
  modes: {},
})

function Landing() {
  return <output data-testid="landing">{useLocation().search}</output>
}

const renderDashboard = () =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/" element={<Landing />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )

describe('DashboardPage', () => {
  it('shows a card per algorithm and playlist, with readiness tones and illustrations', async () => {
    mockFetch([
      { match: '/api/coach/provider-default', body: { provider: 'openai' } },
      {
        match: '/api/skill-map-overview',
        body: {
          algorithms: [
            ...PATTERNS.map((slug, index) => node(slug, [90, 60, 10][index % 3])),
            node('arrays-hash-maps', 50),
          ],
        },
      },
      {
        match: '/api/catalog/playlists',
        body: {
          playlists: [
            {
              slug: 'google',
              title: 'Google',
              description: '',
              showOnSkillMap: true,
              questions: [
                { title: 'One', coreShape: 'Graph', methods: ['Tier 1'] },
                { title: 'Two', coreShape: 'Graph', methods: ['Tier 2'] },
              ],
            },
            { slug: 'solo', title: 'Solo deck', description: '', showOnSkillMap: true, questions: [{ title: 'Only', coreShape: 'Heap', methods: [] }] },
          ],
        },
      },
    ])
    renderDashboard()
    expect(screen.getByText('Loading readiness overview...')).toBeInTheDocument()
    await screen.findByText('Sliding Window')
    expect(screen.queryByText('Arrays Hash Maps')).toBeNull()
    expect(document.querySelectorAll('.skill-map-illustration').length).toBeGreaterThan(PATTERNS.length)
    expect(document.querySelector('.coach-status-value-success')).not.toBeNull()
    expect(document.querySelector('.coach-status-value-warning')).not.toBeNull()
    expect(document.querySelector('.coach-status-value-error')).not.toBeNull()

    const google = screen.getByRole('heading', { name: 'Google' }).closest('article') as HTMLElement
    expect(within(google).getByText('2 problems')).toBeInTheDocument()
    expect(within(google).getByText('2 tiers')).toBeInTheDocument()
    expect(within(google).getByText('1 pattern')).toBeInTheDocument()
    const solo = screen.getByRole('heading', { name: 'Solo deck' }).closest('article') as HTMLElement
    expect(within(solo).getByText('1 problem')).toBeInTheDocument()
    expect(within(solo).getByText('Static')).toBeInTheDocument()

    const meta = screen.getByRole('heading', { name: 'Meta' }).closest('article') as HTMLElement
    expect(within(meta).getByText('4 meta questions')).toBeInTheDocument()
    await userEvent.click(within(google).getByRole('button', { name: 'Start playlist' }))
    expect(screen.getByTestId('landing')).toHaveTextContent('?playlist=google')
  })

  it('starts focused practice for an algorithm', async () => {
    mockFetch([
      { match: '/api/coach/provider-default', body: { provider: 'openai' } },
      { match: '/api/skill-map-overview', body: { algorithms: [node('heap-priority-queue', 70)] } },
      { match: '/api/catalog/playlists', status: 500 },
    ])
    renderDashboard()
    const card = (await screen.findByRole('heading', { name: 'Heap Priority Queue' })).closest('article') as HTMLElement
    await userEvent.click(within(card).getByRole('button', { name: 'Start practice' }))
    expect(screen.getByTestId('landing')).toHaveTextContent('?focusPattern=heap-priority-queue')
  })

  it('explains when readiness cannot load', async () => {
    mockFetch([
      { match: '/api/coach/provider-default', body: { provider: 'openai' } },
      { match: '/api/skill-map-overview', status: 500 },
      { match: '/api/catalog/playlists', body: { playlists: [] } },
    ])
    renderDashboard()
    expect(await screen.findByText('Unable to load readiness tracking right now.')).toBeInTheDocument()
  })

  it('keeps the local playlists when the catalog is offline', async () => {
    const fetch = mockFetch([
      { match: '/api/coach/provider-default', body: { provider: 'openai' } },
      { match: '/api/skill-map-overview', body: { algorithms: [] } },
    ])
    fetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/catalog/playlists')) throw new Error('offline')
      return new Response(JSON.stringify({ algorithms: [] }))
    })
    renderDashboard()
    expect((await screen.findAllByRole('heading', { level: 3 })).length).toBeGreaterThan(0)
  })
})
