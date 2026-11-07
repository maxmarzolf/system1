import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DailyWorkHistory from './DailyWorkHistory'
import HistoryDayDetail, { type HistorySubmission } from './HistoryDayDetail'
import { mockFetch } from './test/fetch'

const activity = {
  windowEnd: '2026-03-03',
  days: [
    { date: '2026-03-01', segments: [{ slug: 'heap', count: 2 }] },
    { date: '2026-03-02', segments: [] },
    { date: '2026-03-03', segments: [{ slug: 'heap', count: 1 }, { slug: 'dynamic-programming', count: 1 }] },
  ],
}
const algorithms = [
  { algorithm: 'Heap / Priority Queue Patterns', slug: 'heap' },
  { algorithm: 'Dynamic Programming', slug: 'dynamic-programming' },
]

function renderGrid(overrides: Partial<Parameters<typeof DailyWorkHistory>[0]> = {}) {
  const props = {
    activity,
    algorithmOrder: algorithms,
    range: 'week' as const,
    onRangeChange: vi.fn(),
    selectedDate: null,
    onSelectDate: vi.fn(),
    selectedAlgorithm: '',
    onSelectAlgorithm: vi.fn(),
    ...overrides,
  }
  render(<DailyWorkHistory {...props} />)
  return props
}

describe('DailyWorkHistory', () => {
  it('shows a loading state before activity arrives', () => {
    renderGrid({ activity: undefined, loading: true })
    expect(screen.getByText('Loading daily work history...')).toBeInTheDocument()
    expect(screen.getByLabelText('Daily work history')).toHaveAttribute('aria-busy', 'true')
  })

  it('switches ranges', async () => {
    const props = renderGrid()
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'All-Time' }))
    expect(props.onRangeChange).toHaveBeenCalledWith('all')
  })

  it('shortens long algorithm names and filters by algorithm', async () => {
    const props = renderGrid({ selectedAlgorithm: 'heap' })
    const labels = screen.getByRole('group', { name: /Algorithms/ })
    expect(within(labels).getByRole('button', { name: 'Heap / PQ Patterns' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(labels).getByRole('button', { name: 'DP' })).toHaveAttribute('title', 'Show only Dynamic Programming')
    await userEvent.click(within(labels).getByRole('button', { name: 'DP' }))
    expect(props.onSelectAlgorithm).toHaveBeenCalledWith('dynamic-programming')
  })

  it('lets you pick a day from a square or the x axis, and highlights hovered columns', async () => {
    const props = renderGrid({ selectedDate: '2026-03-03' })
    const square = screen.getAllByRole('button', { name: /on .*: 2 submissions/ })[0]
    await userEvent.click(square)
    expect(props.onSelectDate).toHaveBeenCalledWith('2026-03-01')
    expect(screen.getAllByRole('img', { name: /no work/ }).length).toBeGreaterThan(0)

    const axis = screen.getByRole('group', { name: /Days/ })
    const [first, empty, today] = within(axis).getAllByRole('button')
    expect(today).toHaveAttribute('aria-pressed', 'true')
    expect(today.getAttribute('aria-label')).toContain('click to clear the day')
    expect(today).toHaveClass('daily-work-history-x-day-today')
    expect(empty.getAttribute('aria-label')).toContain('no work')
    expect(first.getAttribute('aria-label')).toContain('2 submissions')

    fireEvent.mouseEnter(first)
    expect(document.querySelectorAll('.daily-work-history-cell-column-hover')).toHaveLength(2)
    fireEvent.mouseLeave(empty)
    expect(document.querySelectorAll('.daily-work-history-cell-column-hover')).toHaveLength(2)
    fireEvent.mouseLeave(first)
    expect(document.querySelectorAll('.daily-work-history-cell-column-hover')).toHaveLength(0)
    fireEvent.focus(empty)
    fireEvent.blur(empty)
    expect(document.querySelectorAll('.daily-work-history-cell-column-hover')).toHaveLength(0)
    await userEvent.click(empty)
    expect(props.onSelectDate).toHaveBeenLastCalledWith('2026-03-02')
  })

  it('pluralizes a single submission', () => {
    renderGrid()
    expect(screen.getAllByRole('button', { name: /: 1 submission\. / }).length).toBe(2)
  })
})

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

describe('HistoryDayDetail', () => {
  it('asks you to pick a day first', () => {
    render(<HistoryDayDetail date={null} algorithmFilter="" algorithmNames={{}} />)
    expect(screen.getByText(/Select a date on the grid/)).toBeInTheDocument()
  })

  it('loads the day and shows each submission, collapsed', async () => {
    const fetch = mockFetch([
      {
        match: '/api/history/day',
        body: {
          date: '2026-03-03',
          submissions: [
            submission(),
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
    render(<HistoryDayDetail date="2026-03-03" algorithmFilter="" algorithmNames={{}} />)
    expect(screen.getByText(/Loading the day/)).toBeInTheDocument()
    await screen.findByText('3 submissions · 1 correct')
    expect(fetch.calls[0].url).toContain('date=2026-03-03')

    const cards = document.querySelectorAll('details.history-day-submission')
    expect(cards).toHaveLength(3)
    expect(cards[0]).not.toHaveAttribute('open')
    expect(within(cards[0] as HTMLElement).getByText('✗ Missed')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('1m 15s')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('score 42.0')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('heapq.heappush(h, x)')).toBeInTheDocument()
    expect(within(cards[0] as HTMLElement).getByText('Chosen')).toBeInTheDocument()
    expect(within(cards[1] as HTMLElement).getByText('✓ Correct')).toBeInTheDocument()
    expect(within(cards[1] as HTMLElement).getByText('(empty)')).toBeInTheDocument()
    expect(within(cards[1] as HTMLElement).getByText('Expected')).toBeInTheDocument()
    expect(within(cards[1] as HTMLElement).getByText('4s')).toBeInTheDocument()
    expect(within(cards[2] as HTMLElement).getByText('other')).toBeInTheDocument()
  })

  it('filters by algorithm and explains an empty filter', async () => {
    mockFetch([{ match: '/api/history/day', body: { date: '2026-03-03', submissions: [submission()] } }])
    const { rerender } = render(<HistoryDayDetail date="2026-03-03" algorithmFilter="heap" algorithmNames={{ heap: 'Heap' }} />)
    await screen.findByText('1 submission · 0 correct · Heap only')
    rerender(<HistoryDayDetail date="2026-03-03" algorithmFilter="dp" algorithmNames={{}} />)
    expect(screen.getByText('No dp submissions on this day.')).toBeInTheDocument()
  })

  it('shows empty days and load errors', async () => {
    mockFetch([{ match: '/api/history/day', body: { date: '2026-03-01', submissions: [] } }])
    const { unmount } = render(<HistoryDayDetail date="2026-03-01" algorithmFilter="" algorithmNames={{}} />)
    await screen.findByText('No submissions recorded on this day.')
    unmount()

    mockFetch([{ match: '/api/history/day', status: 500 }])
    render(<HistoryDayDetail date="2026-03-02" algorithmFilter="" algorithmNames={{}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load this day (500)')
  })

  it('reports non-Error failures', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject('offline')))
    render(<HistoryDayDetail date="2026-03-02" algorithmFilter="" algorithmNames={{}} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this day'))
  })
})
