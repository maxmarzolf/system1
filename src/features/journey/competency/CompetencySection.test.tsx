import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import CompetencySection from './CompetencySection'
import { competencyFill, daysAgo, practiceHref, rankedAlgorithms, standingOf } from './competencyDisplay'
import { competencyAlgorithm, competencyCell, competencyTerrain } from '@/test/competency'
import { mockFetch } from '@/test/fetch'

function Practice() {
  const location = useLocation()
  return <output data-testid="practice">{location.search}</output>
}

const renderSection = (onSelect = vi.fn()) => {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<CompetencySection onSelect={onSelect} />} />
        <Route path="/practice" element={<Practice />} />
      </Routes>
    </MemoryRouter>,
  )
  return onSelect
}

describe('competency display helpers', () => {
  it('ranks weakest first, names standings, and colours from error through warning to accent', () => {
    expect(rankedAlgorithms(competencyTerrain()).map((algorithm) => algorithm.slug)).toEqual(['heap', 'sliding-window'])
    const tied = { ...competencyTerrain(), algorithms: [competencyAlgorithm({ slug: 'b', name: 'B', competency: 5 }), competencyAlgorithm({ slug: 'a', name: 'A', competency: 5 })] }
    expect(rankedAlgorithms(tied).map((algorithm) => algorithm.name)).toEqual(['A', 'B'])
    expect(standingOf('review')).toBe('review')
    expect(standingOf('anything')).toBe('learn')
    expect(competencyFill(0)).toBe('color-mix(in srgb, var(--hc-warning) 0%, var(--hc-error))')
    expect(competencyFill(75)).toBe('color-mix(in srgb, var(--hc-accent) 50%, var(--hc-warning))')
    expect(competencyFill(150)).toContain('var(--hc-accent) 100%')
    expect([daysAgo(0), daysAgo(1), daysAgo(9)]).toEqual(['today', 'yesterday', '9 days ago'])
    expect(practiceHref({ slug: 'heap', kind: 'algorithm' })).toBe('/practice?focusPattern=heap')
    expect(practiceHref({ slug: 'skeletons', kind: 'playlist' })).toBe('/practice?playlist=skeletons')
  })
})

describe('CompetencySection', () => {
  it('lists algorithms weakest first with why, the trend, and a way to practise', async () => {
    mockFetch([{ match: '/api/history/competency', body: competencyTerrain() }])
    renderSection()
    expect(screen.getByText('Loading competency…')).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Competency today, weakest first' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual(['Heap', 'Sliding Window with a very long name'])
    expect(within(rows[0]).getByText('Review')).toHaveAttribute('title', expect.stringContaining('has faded'))
    expect(within(rows[0]).getByRole('meter', { name: 'Heap competency' })).toHaveAttribute('aria-valuenow', '76.8')
    expect(rows[0]).toHaveTextContent(/last 80 on Mar 1 · 2 days ago · 2 answers/)
    expect(within(rows[0]).getByRole('img', { name: 'Heap: the last 3 days of competency' }).querySelectorAll('circle')).toHaveLength(1)
    expect(within(rows[1]).getByText('Strong')).toBeInTheDocument()
    expect(screen.getByText(/days without practice fade 2%/)).toBeInTheDocument()

    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Practise Heap' }))
    expect(await screen.findByTestId('practice')).toHaveTextContent('?focusPattern=heap')
  })

  it('maps history to a heatmap whose practised days open their answers', async () => {
    mockFetch([{ match: '/api/history/competency', body: competencyTerrain() }])
    const onSelect = renderSection()
    const grid = await screen.findByRole('group', { name: /Competency per algorithm per day/ })
    expect(grid.querySelectorAll('rect')).toHaveLength(4)
    const practised = within(grid).getAllByRole('button')
    expect(practised).toHaveLength(2)
    expect(practised[0]).toHaveAccessibleName('Heap · Mar 1 · competency 80.0 · 2 answers, 9 signals averaged')

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Hover a day for its values')
    const decayed = grid.querySelectorAll('rect')[2]
    fireEvent.mouseEnter(decayed)
    expect(status).toHaveTextContent('Heap · Mar 3 · competency 76.8 · not practised: decayed from Mar 1')
    fireEvent.mouseLeave(grid)
    expect(status).toHaveTextContent('Hover a day for its values')

    await userEvent.click(practised[1])
    expect(onSelect).toHaveBeenCalledWith('2026-03-03', 'sliding-window')
    fireEvent.focus(practised[0])
    expect(status).toHaveTextContent('Heap · Mar 1')
    fireEvent.keyDown(practised[0], { key: 'Enter' })
    fireEvent.keyDown(practised[0], { key: ' ' })
    fireEvent.keyDown(practised[0], { key: 'x' })
    expect(onSelect).toHaveBeenCalledTimes(3)
    expect(onSelect).toHaveBeenLastCalledWith('2026-03-01', 'heap')
  })

  it('handles an empty history, a single day, and errors', async () => {
    mockFetch([{ match: '/api/history/competency', body: { decayPerDay: 0.02, algorithms: [], days: [], cells: [] } }])
    const { unmount } = render(<MemoryRouter><CompetencySection onSelect={vi.fn()} /></MemoryRouter>)
    await screen.findByText('No graded answers yet.')
    unmount()

    const single = {
      decayPerDay: 0.02,
      algorithms: [competencyAlgorithm({ slug: 'heap', name: 'Heap', competency: 50, kind: 'playlist', answers: 1, daysSince: 1 })],
      days: ['2026-03-01'],
      cells: [competencyCell('heap', '2026-03-01', 50, true)],
    }
    mockFetch([{ match: '/api/history/competency', body: single }])
    const second = render(<MemoryRouter><CompetencySection onSelect={vi.fn()} /></MemoryRouter>)
    expect(await screen.findByText(/yesterday · 1 answer$/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Heap: the last 1 day of competency' })).toBeInTheDocument()
    second.unmount()

    mockFetch([{ match: '/api/history/competency', status: 503 }])
    render(<MemoryRouter><CompetencySection onSelect={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Competency terrain unavailable (503)'))
  })
})
