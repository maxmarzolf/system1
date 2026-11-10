import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import EvolvePage from './EvolvePage'
import { ThemeProvider } from '@/app/theme'
import { mockFetch } from '@/test/fetch'

const seedPrompt = 'Generate one focused Sliding Window question from the learner history.'

const preview = {
  pattern: 'Sliding Window',
  skill: 'window boundary',
  score: 0.8,
  raw: '',
  nextProbe: 'When to move the left bound',
  drill: {
    title: 'Window decision',
    difficulty: 'Med.',
    question: 'When should `left` move?',
    choices: [
      { id: 'A', text: 'After the window is too wide' },
      { id: 'B', text: 'Before reading each item' },
      { id: 'C', text: 'Only after a reset' },
      { id: 'D', text: 'Never' },
    ],
    correctChoiceId: 'A',
    explanation: 'Move `left` when the window exceeds the target size.',
  },
  jev: { model: 'jev-1.13.0', score: 0.8, scores: { grounded: 0.9 }, feedback: [] },
}

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'revision',
  prompt: 'Revised prompt that asks for the next window boundary decision.',
  nextProbe: 'When to move the left bound',
  score: 0.8,
  formatScore: 0.75,
  jevScore: 0.85,
  jevCases: [{ pattern: 'Sliding Window', scores: { grounded: 0.9 }, feedback: [] }],
  iteration: 1,
  generation: 1,
  parentId: 'seed',
  isBest: true,
  previews: [preview],
  answers: [],
  ...overrides,
})

const run = (overrides: Record<string, unknown> = {}) => ({
  id: 'run-1',
  status: 'complete',
  startedAt: '2026-11-09T12:00:00Z',
  finishedAt: '2026-11-09T12:05:00Z',
  iterations: 3,
  baseIteration: 0,
  completedIterations: 3,
  message: null,
  seedPrompt,
  candidates: [
    candidate({ id: 'seed', prompt: seedPrompt, nextProbe: '', score: 0.5, iteration: 0, isBest: false, previews: [] }),
    candidate(),
  ],
  parent: null,
  feedback: [{ id: 'f1', kind: 'answer', pattern: 'Sliding Window', correct: false, choice_id: 'B', choice_text: 'Before reading each item' }],
  ...overrides,
})

const overview = (runs: object[] = [{ id: 'run-1', status: 'complete', startedAt: '2026-11-09T12:00:00Z', finishedAt: '2026-11-09T12:05:00Z', iterations: 3 }]) => ({
  seedPrompt,
  model: 'gpt-5.4-mini',
  iterations: 3,
  ready: true,
  jevReady: true,
  missing: [],
  runs,
})

const renderPage = () => render(
  <ThemeProvider>
    <MemoryRouter>
      <EvolvePage />
    </MemoryRouter>
  </ThemeProvider>,
)

describe('Evolve page', () => {
  it('loads a saved run and records an answer for its generated MCQ', async () => {
    const answer = {
      candidateId: 'revision', caseIndex: 0, choiceId: 'A', choiceText: 'After the window is too wide',
      correctChoiceId: 'A', correct: true, createdAt: '2026-11-09T12:06:00Z',
    }
    const fetch = mockFetch([
      { match: '/api/coach/provider-default', body: { provider: 'openai' } },
      { match: '/api/evolve/runs/run-1', body: run() },
      { method: 'POST', match: '/api/evolve/runs/run-1/candidates/revision/answer', body: answer },
      { match: '/api/evolve', body: overview() },
    ])
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Window decision' })).toBeInTheDocument()
    expect(screen.getByText('Observations guiding this run · 1')).toBeInTheDocument()
    expect(screen.getByText('Next probe: When to move the left bound')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /A After the window is too wide/ }))
    await userEvent.click(screen.getByRole('button', { name: /Check answer/ }))
    expect(await screen.findByText(/Answer recorded/)).toBeInTheDocument()
    const posted = fetch.calls.find((call) => call.url.endsWith('/candidates/revision/answer'))
    expect(posted?.init?.method).toBe('POST')
    expect(JSON.parse(String(posted?.init?.body))).toEqual({ caseIndex: 0, choiceId: 'A' })
  })

  it('starts a run, generates a missing preview, and clears saved run data', async () => {
    let state = overview([])
    const emptyCandidate = candidate({ previews: [], answers: [], jevCases: [] })
    const detail = run({ candidates: [emptyCandidate], feedback: [] })
    const fetch = mockFetch([
      { match: '/api/coach/provider-default', body: { provider: 'openai' } },
      { method: 'POST', match: '/api/evolve/runs/run-1/candidates/revision/preview', body: { previews: [preview] } },
      { method: 'POST', match: '/api/evolve/runs', respond: () => {
        state = overview([{ id: 'run-1', status: 'complete', startedAt: '2026-11-09T12:00:00Z', finishedAt: '2026-11-09T12:05:00Z', iterations: 3 }])
        return detail
      } },
      { method: 'DELETE', match: '/api/evolve/runs', body: { deletedRuns: 1 } },
      { match: '/api/evolve/runs/run-1', body: detail },
      { match: '/api/evolve', respond: () => state },
    ])
    renderPage()

    expect(await screen.findByRole('button', { name: /Start evolution/ })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: /Start evolution/ }))
    expect(await screen.findByText('This candidate has no saved MCQ output yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Generate MCQs/ }))
    expect(await screen.findByRole('heading', { name: 'Window decision' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Start from scratch' }))
    const confirmation = screen.getByRole('group', { name: 'Confirm starting from scratch' })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Keep my runs' }))
    expect(screen.queryByRole('group', { name: 'Confirm starting from scratch' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start from scratch' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear Evolve data' }))
    expect(await screen.findByText(/1 Evolve run cleared/)).toBeInTheDocument()
    expect(fetch.calls.some((call) => call.init?.method === 'DELETE' && call.url.endsWith('/api/evolve/runs'))).toBe(true)
  })

  it('shows setup help when the Evolve service is unavailable', async () => {
    mockFetch([
      { match: '/api/coach/provider-default', body: { provider: 'openai' } },
      { match: '/api/evolve', status: 503, body: { detail: 'offline' } },
    ])
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('The Evolve service is unavailable')
    expect(screen.getByText('Start the Evolve service')).toBeInTheDocument()
    expect(screen.getByText('docker compose up -d --build evolve')).toBeInTheDocument()
  })
})
