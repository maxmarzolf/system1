import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SubmissionDetail, { type HistorySubmission } from './SubmissionDetail'
import { mockFetch } from '@/test/fetch'

const submission = (overrides: Partial<HistorySubmission> = {}): HistorySubmission => ({
  id: 1,
  createdAt: '2026-03-03T15:04:00Z',
  modality: 'mcq',
  title: 'Heap top k',
  question: 'Which structure?\n```python\nheapq.heappush(h, x)\n```\nPick one.',
  choices: [
    { id: 'A', text: 'Heap', correct: true },
    { id: 'B', text: 'List', correct: false },
  ],
  userAnswer: 'B. List',
  correctAnswer: 'A. Heap',
  successful: false,
  elapsedMs: 75000,
  algorithms: [{ slug: 'heap', algorithm: 'Heap' }],
  evaluation: { score: { overall: 42 }, verdict: 'needs-work' },
  ...overrides,
})

describe('SubmissionDetail', () => {
  it('asks for a day or algorithms first, and sends no request', () => {
    const fetch = mockFetch([])
    render(<SubmissionDetail date={null} algorithms={[]} algorithmNames={{}} />)
    expect(screen.getByText('Submission Detail')).toBeInTheDocument()
    expect(screen.getByText(/Select a day on the grid, or algorithms under it/)).toBeInTheDocument()
    expect(fetch.calls).toHaveLength(0)
  })

  it('loads the day and shows each submission, collapsed', async () => {
    const fetch = mockFetch([
      {
        match: '/api/history/submissions',
        body: {
          date: '2026-03-03',
          algorithms: [],
          submissions: [
            submission({ generationTrace: [{ attempt: 1, provider: 'claude', model: 'claude-fast', latencyMs: 900, ok: true }] }),
            submission({
              id: 2,
              modality: 'total-recall',
              successful: true,
              choices: [],
              userAnswer: '',
              correctAnswer: 'def f(): pass',
              elapsedMs: 4000,
              createdAt: '',
              title: '',
              question: '',
              evaluation: {},
              algorithms: [{ slug: 'dp', algorithm: 'DP' }],
            }),
            submission({ id: 3, modality: 'other', elapsedMs: 0, correctAnswer: '', choices: [], userAnswer: 'x' }),
          ],
        },
      },
    ])
    render(<SubmissionDetail date="2026-03-03" algorithms={[]} algorithmNames={{}} />)
    expect(screen.getByText(/Loading submissions/)).toBeInTheDocument()
    await screen.findByText('3 submissions · 1 correct')
    expect(fetch.calls[0].url).toContain('date=2026-03-03')
    expect(fetch.calls[0].url).not.toContain('algorithm=')
    expect(screen.getByRole('heading', { name: 'Tuesday, March 3, 2026' })).toBeInTheDocument()

    const cards = document.querySelectorAll('details.history-day-submission')
    expect(cards).toHaveLength(3)
    expect(cards[0]).not.toHaveAttribute('open')
    expect(within(cards[0] as HTMLElement).getByText('✗ Missed')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('1m 15s')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('score 42.0')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('heapq.heappush(h, x)')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('Chosen')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('Model calls')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('#1 · claude · claude-fast · 900 ms')).toBeInTheDocument()
    expect(within(cards[1] as HTMLElement).getByText('✓ Correct')).toBeInTheDocument()
    expect(within(cards[1] as HTMLElement).getByText('(empty)')).toBeInTheDocument()
    expect(within(cards[1] as HTMLElement).getByText('Expected')).toBeInTheDocument()
    expect(within(cards[1] as HTMLElement).getByText('4s')).toBeInTheDocument()
    expect(within(cards[2] as HTMLElement).getByText('other')).toBeInTheDocument()
  })

  it('narrows a day to algorithms, and explains an empty result', async () => {
    const fetch = mockFetch([{
      match: '/api/history/submissions',
      respond: (url) => {
        const params = new URL(url, 'http://x').searchParams
        const algorithms = params.getAll('algorithm')
        return { date: params.get('date'), algorithms, submissions: algorithms.includes('heap') ? [submission()] : [] }
      },
    }])
    const { rerender } = render(<SubmissionDetail date="2026-03-03" algorithms={['heap']} algorithmNames={{ heap: 'Heap' }} />)
    await screen.findByText('1 submission · 0 correct · Heap only')
    expect(fetch.calls[0].url).toContain('algorithm=heap')
    rerender(<SubmissionDetail date="2026-03-03" algorithms={['dp', 'trie']} algorithmNames={{ trie: 'Trie' }} />)
    expect(await screen.findByText('No dp, Trie submissions on this day.')).toBeInTheDocument()
    expect(fetch.calls.at(-1)?.url).toMatch(/algorithm=dp&algorithm=trie/)
  })

  it('lists algorithms across the year, newest first, with each date', async () => {
    const fetch = mockFetch([{
      match: '/api/history/submissions',
      body: {
        date: null,
        algorithms: ['heap'],
        submissions: [submission({ id: 5, date: '2026-03-03', successful: true }), submission({ id: 4, date: '2026-02-01' })],
      },
    }])
    render(<SubmissionDetail date={null} algorithms={['heap']} algorithmNames={{ heap: 'Heap' }} />)
    await screen.findByText('2 submissions · 1 correct · last year')
    expect(fetch.calls[0].url).not.toContain('date=')
    expect(screen.getByRole('heading', { name: 'Heap' })).toBeInTheDocument()
    const times = [...document.querySelectorAll('.history-day-meta time')].map((time) => time.textContent)
    expect(times[0]).toMatch(/^Mar 3 · /)
    expect(times[1]).toMatch(/^Feb 1 · /)
  })

  it('explains an algorithm with no submissions this year', async () => {
    mockFetch([{ match: '/api/history/submissions', body: { date: null, algorithms: ['trie'], submissions: [] } }])
    render(<SubmissionDetail date={null} algorithms={['trie']} algorithmNames={{}} />)
    expect(await screen.findByText('No submissions in the last year.')).toBeInTheDocument()
  })

  it('shows empty days and load errors', async () => {
    mockFetch([{ match: '/api/history/submissions', body: { date: '2026-03-01', algorithms: [], submissions: [] } }])
    const { unmount } = render(<SubmissionDetail date="2026-03-01" algorithms={[]} algorithmNames={{}} />)
    await screen.findByText('No submissions recorded on this day.')
    unmount()

    mockFetch([{ match: '/api/history/submissions', status: 500 }])
    render(<SubmissionDetail date="2026-03-02" algorithms={[]} algorithmNames={{}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load submissions (500)')
  })

  it('reports non-Error failures', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject('offline')))
    render(<SubmissionDetail date="2026-03-02" algorithms={[]} algorithmNames={{}} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load submissions'))
  })
})
