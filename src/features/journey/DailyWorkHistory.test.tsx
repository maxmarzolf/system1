import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DailyWorkHistory from './DailyWorkHistory'

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

