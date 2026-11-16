import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DailyWorkHistory from './DailyWorkHistory'
import { mockFetch } from '@/test/fetch'

// Mar 1 2026 is a Sunday: the grid starts a fresh week.
const activity = {
  windowEnd: '2026-03-04',
  days: [
    { date: '2026-03-01', segments: [{ slug: 'heap', count: 2 }] },
    { date: '2026-03-02', segments: [] },
    { date: '2026-03-03', segments: [{ slug: 'heap', count: 1 }, { slug: 'dynamic-programming', count: 1 }] },
    { date: '2026-03-04', segments: [{ slug: 'trie', count: 1 }] },
  ],
}
const algorithms = [
  { algorithm: 'Heap', slug: 'heap' },
  { algorithm: 'Dynamic Programming', slug: 'dynamic-programming' },
  { algorithm: 'Trie', slug: 'trie' },
  { algorithm: 'Graphs', slug: 'graphs' },
]

function renderGrid(overrides: Partial<Parameters<typeof DailyWorkHistory>[0]> = {}) {
  mockFetch([{ match: '/api/history/submissions', body: { date: null, algorithms: [], submissions: [] } }])
  const props = {
    activity,
    algorithmOrder: algorithms,
    selectedDate: null,
    onSelectDate: vi.fn(),
    selectedAlgorithms: [],
    onToggleAlgorithm: vi.fn(),
    onClearAlgorithms: vi.fn(),
    ...overrides,
  }
  render(<DailyWorkHistory {...props} />)
  return props
}

const grid = () => screen.getByRole('group', { name: /Days of the last year/ })
const filter = () => screen.getByRole('group', { name: /Algorithms/ })

describe('DailyWorkHistory', () => {
  it('shows a loading state before activity arrives', () => {
    renderGrid({ activity: undefined, loading: true })
    expect(screen.getByText('Loading daily work history...')).toBeInTheDocument()
    expect(screen.getByLabelText('Daily work history')).toHaveAttribute('aria-busy', 'true')
  })

  it('draws a week column per seven days, marking only whether each day had work', () => {
    renderGrid()
    expect(screen.getByText('3 days practised in the last year')).toBeInTheDocument()
    expect(grid().querySelectorAll('.activity-grid-week')).toHaveLength(1)
    expect(grid().querySelectorAll('.activity-cell-active')).toHaveLength(3)
    const idle = screen.getByRole('img', { name: 'Mon Mar 2: no work' })
    const busy = within(grid()).getByRole('button', { name: 'Tue Mar 3: 2 submissions (Heap, Dynamic Programming)' })
    expect(busy).toHaveClass('activity-cell-active')
    // Hovering or focusing a day reads it out in the header (no tooltip to widen the grid).
    const note = screen.getByText('3 days practised in the last year')
    fireEvent.mouseEnter(idle)
    expect(note).toHaveTextContent('Mon Mar 2: no work')
    fireEvent.mouseLeave(idle)
    expect(note).toHaveTextContent('3 days practised in the last year')
    fireEvent.focus(busy)
    expect(note).toHaveTextContent('Tue Mar 3: 2 submissions (Heap, Dynamic Programming)')
    fireEvent.mouseLeave(idle) // another day leaving keeps the readout
    expect(note).toHaveTextContent('Tue Mar 3')
    fireEvent.blur(busy)
    expect(note).toHaveTextContent('3 days practised')
    expect(within(grid()).getByRole('button', { name: /^Wed Mar 4/ })).toHaveClass('activity-cell-today')
    expect(screen.getByText('Mar')).toBeInTheDocument()
    // Without a day, the filter offers every algorithm practised in the window, in catalog order.
    expect(within(filter()).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Heap', 'Dynamic Programming', 'Trie'])
    expect(screen.getByText(/Select a day on the grid/)).toBeInTheDocument()
  })

  it('reports day clicks, and offers only the selected day’s algorithms', async () => {
    const props = renderGrid({ selectedDate: '2026-03-03' })
    const day = within(grid()).getByRole('button', { name: /^Tue Mar 3/ })
    expect(day).toHaveAttribute('aria-pressed', 'true')
    expect(day).toHaveClass('activity-cell-selected')
    expect(screen.getByRole('group', { name: 'Algorithms practised on Mar 3' })).toBeInTheDocument()
    expect(within(filter()).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Heap', 'Dynamic Programming'])
    await userEvent.click(within(grid()).getByRole('button', { name: /^Sun Mar 1/ }))
    expect(props.onSelectDate).toHaveBeenCalledWith('2026-03-01')
    await userEvent.click(within(filter()).getByRole('button', { name: 'Heap' }))
    expect(props.onToggleAlgorithm).toHaveBeenCalledWith('heap')
    // No highlighting while a day is chosen.
    expect(grid().querySelectorAll('.activity-cell-highlighted, .activity-cell-dimmed')).toHaveLength(0)
  })

  it('highlights the selected algorithms’ days when no day is chosen, and clears', async () => {
    const props = renderGrid({ selectedAlgorithms: ['heap', 'graphs'] })
    const highlighted = [...grid().querySelectorAll('.activity-cell-highlighted')].map((cell) => cell.getAttribute('aria-label'))
    expect(highlighted).toEqual([expect.stringMatching(/^Sun Mar 1/), expect.stringMatching(/^Tue Mar 3/)])
    expect(within(grid()).getByRole('button', { name: /^Wed Mar 4/ })).toHaveClass('activity-cell-dimmed')
    // Clear, then the selected ones (even one with no practice in the window), then the rest.
    expect(within(filter()).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Clear', 'Heap', 'Graphs', 'Dynamic Programming', 'Trie'])
    expect(within(filter()).getByRole('button', { name: 'Graphs' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(filter()).getByRole('button', { name: 'Heap' })).toHaveClass('algorithm-filter-chip-selected')
    await userEvent.click(within(filter()).getByRole('button', { name: 'Clear' }))
    expect(props.onClearAlgorithms).toHaveBeenCalled()
  })

  it('says when nothing has been practised yet', () => {
    renderGrid({ activity: { windowEnd: '2026-03-02', days: [{ date: '2026-03-02', segments: [] }] } })
    expect(screen.getByText('No algorithms practised yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })
})
