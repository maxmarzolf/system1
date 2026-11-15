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
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual(['!Heap', 'Sliding Window with a very long name', 'Trees'])
    expect(within(rows[0]).getByText('Review')).toHaveAttribute('data-tip', expect.stringContaining('has faded'))
    expect(within(rows[0]).getByRole('meter', { name: 'Heap competency' })).toHaveAttribute('aria-valuenow', '76.8')
    expect(rows[0]).toHaveTextContent(/last 80 on Mar 1 · 2 days ago · 2 answers/)
    expect(within(rows[0]).getByRole('img', { name: 'Heap: the last 3 days of competency' }).querySelectorAll('circle')).toHaveLength(1)
    expect(within(rows[1]).getByText('Strong')).toBeInTheDocument()
    expect(screen.getByText(/days without practice fade 2%/)).toBeInTheDocument()

    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Practise Heap' }))
    expect(await screen.findByTestId('practice')).toHaveTextContent('?focusPattern=heap')
  })

  it('puts an overall row above the list, outside it, with its whole history', async () => {
    mockFetch([{ match: '/api/history/competency', body: competencyTerrain() }])
    renderSection()
    const overall = await screen.findByRole('meter', { name: 'Overall competency' })
    expect(overall).toHaveAttribute('aria-valuenow', '83.4')
    expect(overall).toHaveTextContent('83')
    const row = overall.closest('.competency-overall') as HTMLElement
    expect(row).toHaveTextContent('Overall')
    expect(row.closest('ol')).toBeNull()
    const graph = within(row).getByRole('img', { name: 'Overall competency from Mar 1 to Mar 3' })
    expect(graph.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(3)
    // The week's trend, coloured like the standing chips.
    expect(within(row).getByText('Improving')).toHaveClass('competency-chip-strong')
    expect(within(row).getByText('Improving')).toHaveAttribute('data-tip', 'Up 3.4 points over the last week.')
  })

  it.each([
    ['regressing', -5.2, 'Regressing', 'competency-chip-learn', 'Down 5.2 points over the last week.'],
    ['maintaining', 0, 'Maintaining', 'competency-chip-review', 'No change over the last week.'],
    ['maintaining', null, 'Maintaining', 'competency-chip-review', 'No change over the last week.'],
  ])('labels a %s week', async (trend, weekChange, label, chip, tip) => {
    const terrain = competencyTerrain()
    terrain.overall = { ...terrain.overall, trend, weekChange }
    mockFetch([{ match: '/api/history/competency', body: terrain }])
    renderSection()
    const badge = await screen.findByText(label)
    expect(badge).toHaveClass(chip)
    expect(badge).toHaveAttribute('data-tip', tip)
  })

  it('shows no trend label when the server sends none', async () => {
    const terrain = competencyTerrain()
    terrain.overall = { ...terrain.overall, trend: 'sideways' }
    mockFetch([{ match: '/api/history/competency', body: terrain }])
    renderSection()
    await screen.findByRole('meter', { name: 'Overall competency' })
    expect(screen.queryByText(/Improving|Maintaining|Regressing/)).toBeNull()
  })

  it('shows only the last 30 days in the collapsed preview', async () => {
    const terrain = competencyTerrain()
    const days = Array.from({ length: 40 }, (_, index) => `2026-02-${String(index + 1).padStart(2, '0')}`)
    terrain.cells = [...days.map((date) => competencyCell('sliding-window', date, 50, false)), ...terrain.cells]
    mockFetch([{ match: '/api/history/competency', body: terrain }])
    renderSection()
    expect(await screen.findByRole('img', { name: 'Sliding Window with a very long name: the last 30 days of competency' })).toBeInTheDocument()
  })

  it('has no overall row before any answer', async () => {
    mockFetch([{ match: '/api/history/competency', body: { ...competencyTerrain(), overall: { competency: null, weekChange: null, trend: null, days: [] } } }])
    renderSection()
    await screen.findByRole('list', { name: 'Competency today, weakest first' })
    expect(screen.queryByRole('meter', { name: 'Overall competency' })).toBeNull()
  })

  it('flags free fall and never-practised algorithms', async () => {
    mockFetch([{ match: '/api/history/competency', body: competencyTerrain() }])
    renderSection()
    const list = await screen.findByRole('list', { name: 'Competency today, weakest first' })
    const rows = within(list).getAllByRole('listitem')
    expect(within(rows[0]).getByLabelText('Decaying for more than 10 days.')).toHaveTextContent('!')
    expect(within(rows[0]).getByLabelText('Decaying for more than 10 days.')).toHaveAttribute('data-tip', 'Decaying for more than 10 days.')
    expect(within(rows[1]).queryByText('!')).toBeNull()
    // Never practised comes last: a dash, no value, still a way in.
    expect(rows[2]).toHaveTextContent('Trees')
    expect(within(rows[2]).getByLabelText('Never practiced.')).toHaveTextContent('-')
    expect(within(rows[2]).getByText('Not started')).toHaveAttribute('data-tip', 'Never practiced.')
    expect(within(rows[2]).queryByRole('meter')).toBeNull()
    await userEvent.click(rows[2]) // not expandable
    expect(rows[2]).not.toHaveAttribute('aria-expanded')
    await userEvent.click(within(rows[2]).getByRole('button', { name: 'Practise Trees' }))
    expect(await screen.findByTestId('practice')).toHaveTextContent('?focusPattern=trees')
  })

  it('expands a row into its history graph, a heat strip whose practised days open answers, and its signals', async () => {
    mockFetch([{ match: '/api/history/competency', body: competencyTerrain() }])
    const onSelect = renderSection()
    const list = await screen.findByRole('list', { name: 'Competency today, weakest first' })
    const heap = within(list).getAllByRole('listitem')[0]
    expect(heap).toHaveAttribute('aria-expanded', 'false')
    expect(within(heap).queryByText('Strongest signals')).toBeNull()

    await userEvent.click(heap)
    expect(heap).toHaveAttribute('aria-expanded', 'true')
    expect(within(heap).getByRole('img', { name: 'Heap: competency from Mar 1 to Mar 3' }).querySelectorAll('.competency-detail-dot')).toHaveLength(1)
    const strongest = within(heap).getByText('Strongest signals').parentElement as HTMLElement
    expect(strongest).toHaveTextContent(/Concept recognition\s*96\s*1 answer/)
    expect(within(heap).getByText('Weakest signals').parentElement).toHaveTextContent(/Correct choice\s*40\s*2 answers/)

    const strip = within(heap).getByRole('group', { name: 'Heap by day; practised days open their answers' })
    expect(strip.querySelectorAll('rect')).toHaveLength(3)
    const status = within(heap).getByRole('status')
    fireEvent.mouseEnter(strip.querySelectorAll('rect')[2])
    expect(status).toHaveTextContent('Heap · Mar 3 · competency 76.8 · not practised: decayed from Mar 1')
    fireEvent.mouseLeave(strip)
    expect(status).toHaveTextContent('Hover a day for its values')

    const practised = within(strip).getByRole('button', { name: 'Heap · Mar 1 · competency 80.0 · 2 answers, 9 signals averaged' })
    await userEvent.click(practised)
    expect(onSelect).toHaveBeenCalledWith('2026-03-01', 'heap')
    expect(heap).toHaveAttribute('aria-expanded', 'true') // clicks inside the detail don't collapse it
    fireEvent.focus(practised)
    expect(status).toHaveTextContent('Heap · Mar 1')
    fireEvent.keyDown(practised, { key: 'Enter' })
    fireEvent.keyDown(practised, { key: ' ' })
    fireEvent.keyDown(practised, { key: 'x' })
    expect(onSelect).toHaveBeenCalledTimes(3)

    // The sliding window row has no signals yet.
    const sliding = within(list).getByRole('listitem', { name: 'Sliding Window with a very long name: show details' })
    sliding.focus()
    fireEvent.keyDown(sliding, { key: 'Enter' })
    expect(sliding).toHaveAttribute('aria-expanded', 'true')
    expect(within(sliding).getAllByText('Not enough signals yet.')).toHaveLength(2)
    fireEvent.keyDown(sliding, { key: ' ' })
    expect(sliding).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(sliding, { key: 'a' })
    expect(sliding).toHaveAttribute('aria-expanded', 'false')

    // Clicking the summary again collapses; Practise never toggles.
    await userEvent.click(within(heap).getByRole('meter'))
    expect(heap).toHaveAttribute('aria-expanded', 'false')
  })

  it('handles an empty history, a single day, and errors', async () => {
    mockFetch([{ match: '/api/history/competency', body: { decayPerDay: 0.02, freeFallDays: 10, overall: { competency: null, weekChange: null, trend: null, days: [] }, algorithms: [], unpractised: [], days: [], cells: [] } }])
    const { unmount } = render(<MemoryRouter><CompetencySection onSelect={vi.fn()} /></MemoryRouter>)
    await screen.findByText('No graded answers yet.')
    unmount()

    const single = {
      decayPerDay: 0.02,
      freeFallDays: 10,
      overall: { competency: 50, weekChange: 0, trend: 'maintaining', days: [{ date: '2026-03-01', competency: 50 }] },
      unpractised: [],
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
