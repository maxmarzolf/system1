import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import InfoTip from './InfoTip'
import RelatedLeetCodeDrawer from './RelatedLeetCodeDrawer'
import SignalSpecTable from './SignalSpecTable'
import SubmissionSignalDetails from './SubmissionSignalDetails'
import TopNav from './TopNav'
import { providerDisplayLabel, useConfiguredProviderLabel } from './llmProviderDefault'
import { SIGNAL_FIELD_HELP } from './signalFieldHelp'
import { ThemeProvider, useTheme } from './theme'
import { NumberControl, SelectControl, ToggleControl, TuneSection } from './tuneControls'
import { mockFetch } from './test/fetch'

const renderNav = (path: string, props: Parameters<typeof TopNav>[0] = {}) =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <TopNav {...props} />
      </MemoryRouter>
    </ThemeProvider>,
  )

describe('TopNav', () => {
  it('underlines the current page only', () => {
    renderNav('/tune')
    expect(screen.getByRole('link', { name: 'Tune' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Admin' })).not.toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Journey' })).toHaveAttribute('href', '/practice-history')
  })

  it('pins, goes solid and toggles the theme', async () => {
    const { container } = renderNav('/', { pinned: true, solid: true })
    expect(container.querySelector('nav')).toHaveClass('navbar-pinned', 'navbar-solid')
    const toggle = screen.getByRole('button', { name: /Switch theme/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.theme).toBe('light-high-contrast')
    await userEvent.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('dark-high-contrast')
  })

  it('shows the provider picker when it can open', async () => {
    const onToggle = vi.fn()
    renderNav('/', { onToggleLlmProviderMenu: onToggle, llmProviderLabel: 'Claude', llmProviderMenuOpen: true, rightExtras: <span>extra</span> })
    await userEvent.click(screen.getByRole('button', { name: 'Coach model' }))
    expect(onToggle).toHaveBeenCalled()
    expect(screen.getByText('extra')).toBeInTheDocument()
  })

  it('shows a static label without a picker', () => {
    renderNav('/')
    expect(screen.getByLabelText('Coach model auto selection')).toHaveTextContent('Auto (OpenAI)')
  })
})

describe('theme', () => {
  it('restores the stored theme and requires a provider', () => {
    localStorage.setItem('system1-theme', 'light-high-contrast')
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })
    expect(result.current.theme).toBe('light-high-contrast')
    act(() => result.current.setTheme('dark-high-contrast'))
    expect(localStorage.getItem('system1-theme')).toBe('dark-high-contrast')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within a ThemeProvider')
  })
})

describe('InfoTip', () => {
  it('opens on click, closes on Escape or an outside click', async () => {
    render(
      <div>
        <InfoTip label="weight">How much it counts.</InfoTip>
        <button type="button">outside</button>
      </div>,
    )
    const button = screen.getByRole('button', { name: 'About weight' })
    await userEvent.click(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('How much it counts.')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(button).toHaveFocus()
    await userEvent.click(button)
    await userEvent.keyboard('a')
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('tooltip'))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shifts the bubble left when it would overflow the window', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 900 } as DOMRect)
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000)
    render(<InfoTip label="x">tip</InfoTip>)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('tooltip').style.left).toBe('-312px')
  })

  it('does not toggle a surrounding label control', async () => {
    const onChange = vi.fn()
    render(
      <label>
        <input type="checkbox" onChange={onChange} />
        <InfoTip label="box">tip</InfoTip>
      </label>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'About box' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('SignalSpecTable', () => {
  const spec = {
    algorithm: 'heap',
    version: 2,
    structuralElements: ['heap', 'loop'],
    signals: [
      { key: 'order', label: 'Order', kind: 'score' as const, role: 'dimension' as const, weight: 0.25, guidance: 'g', variationStrategy: 'v', axis: 'fidelity' as const },
      { key: 'syntax', label: 'Syntax', kind: 'boolean' as const, role: 'modifier' as const, weight: 0, guidance: 'g2', variationStrategy: 'v2', axis: null },
    ],
  }

  it('renders every signal with its weight, kind and axis', () => {
    render(<SignalSpecTable spec={spec} />)
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('valid / error')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Variation strategy')).toBeInTheDocument()
    expect(screen.getByText('loop')).toBeInTheDocument()
  })

  it('can hide the strategy column', () => {
    render(<SignalSpecTable spec={spec} showStrategy={false} />)
    expect(screen.queryByText('Variation strategy')).toBeNull()
  })
})

describe('SubmissionSignalDetails', () => {
  it('explains a missing evaluation', () => {
    render(<SubmissionSignalDetails evaluation={null} />)
    expect(screen.getByText('No evaluation was stored for this submission.')).toBeInTheDocument()
  })

  it('renders spec, verdict, provenance, scores, rubric and Jev answers', () => {
    render(
      <SubmissionSignalDetails
        evaluation={{
          signalSpec: { algorithm: 'mcq-heap', version: 3, hash: 'abc' },
          verdict: 'sound',
          primaryFailure: { key: 'nearMiss' },
          provenance: { source: 'jev', provider: 'jev', model: 'jev-1.13.0', flags: ['low_correctness_confidence'] },
          correctness: { label: '1', confidence: 0.91, answerKeyAgreement: false },
          score: { overall: 88.25, label: 'good' },
          dimensions: { concept: { label: 'Concept', status: 'pass', score: 90, evidence: ['Named the heap.'] } },
          modifiers: { time: { status: '', score: 'n/a' } },
          signalResults: {
            concept: { label: 'Concept', status: 'pass', raw: 0.9, score: 90, confidence: 0.8 },
            skipped: { status: 'not_applicable', raw: null, score: null, confidence: null },
          },
          jevTrace: [{ requestId: 'r1' }],
        }}
      />,
    )
    expect(screen.getByText('mcq-heap')).toBeInTheDocument()
    expect(screen.getByText('abc')).toBeInTheDocument()
    expect(screen.getByText('nearMiss')).toBeInTheDocument()
    expect(screen.getByText('jev-1.13.0')).toBeInTheDocument()
    expect(screen.getByText(/disagrees with answer key/)).toBeInTheDocument()
    expect(screen.getByText('low_correctness_confidence')).toBeInTheDocument()
    expect(screen.getByText('88.3')).toBeInTheDocument()
    expect(screen.getByText('good')).toBeInTheDocument()
    expect(screen.getByText('Named the heap.')).toBeInTheDocument()
    expect(screen.getByText('Jev answers')).toBeInTheDocument()
    expect(screen.getByText('0.80')).toBeInTheDocument()
  })

  it('omits optional sections', () => {
    render(<SubmissionSignalDetails evaluation={{ verdict: 'needs-work', correctness: { label: '0' } }} />)
    expect(screen.queryByText('Jev answers')).toBeNull()
    expect(screen.queryByText('Dimensions')).toBeNull()
    expect(screen.getByText(/confidence —/)).toBeInTheDocument()
  })
})

describe('tune controls', () => {
  it('wires section, select, toggle and number controls', async () => {
    const onSelect = vi.fn()
    const onToggle = vi.fn()
    const onNumber = vi.fn()
    render(
      <TuneSection eyebrow="01" title="Section" copy="copy" action={<button type="button">act</button>}>
        <SelectControl label="Mode" value="a" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} onChange={onSelect} description="pick" />
        <ToggleControl label="On" checked={false} onChange={onToggle} />
        <NumberControl label="Count" value={3} min={1} max={9} onChange={onNumber} description="how many" />
      </TuneSection>,
    )
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b')
    expect(onSelect).toHaveBeenCalledWith('b')
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith(true)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } })
    expect(onNumber).toHaveBeenLastCalledWith(7)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    expect(onNumber).toHaveBeenLastCalledWith(1)
    expect(screen.getByText('act')).toBeInTheDocument()
    expect(screen.getByText('how many')).toBeInTheDocument()
  })

  it('omits optional parts', () => {
    render(
      <TuneSection eyebrow="e" title="t" copy="c">
        <SelectControl label="Mode" value="a" options={[{ value: 'a', label: 'A' }]} onChange={() => {}} />
        <NumberControl label="Count" value={1} min={1} max={2} onChange={() => {}} />
      </TuneSection>,
    )
    expect(document.querySelector('.tune-section-action')).toBeNull()
    expect(document.querySelector('.tune-control-description')).toBeNull()
  })
})

describe('RelatedLeetCodeDrawer', () => {
  it('lists problems and closes', async () => {
    const onClose = vi.fn()
    render(
      <RelatedLeetCodeDrawer
        open
        onClose={onClose}
        relatedSet={{ heading: 'Windows', description: 'desc', problems: [{ id: 3, title: 'Longest Substring' }] } as never}
      />,
    )
    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getByLabelText('Related LeetCode questions')).toHaveClass('related-problems-drawer-open')
    await userEvent.click(screen.getByRole('button', { name: 'Close related problems drawer' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('provider default', () => {
  it('maps provider names to labels', () => {
    expect(providerDisplayLabel('claude')).toBe('Claude')
    expect(providerDisplayLabel('gemma')).toBe('Gemma')
    expect(providerDisplayLabel('openai')).toBe('OpenAI')
  })

  it('loads the configured provider and tolerates failures', async () => {
    mockFetch([{ match: '/api/coach/provider-default', body: { provider: 'claude' } }])
    const { result } = renderHook(() => useConfiguredProviderLabel())
    await waitFor(() => expect(result.current).toBe('Claude'))

    mockFetch([{ match: '/api/coach/provider-default', status: 500 }])
    const failed = renderHook(() => useConfiguredProviderLabel())
    await waitFor(() => expect(failed.result.current).toBe('OpenAI'))

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const offline = renderHook(() => useConfiguredProviderLabel())
    offline.unmount()
    expect(offline.result.current).toBe('OpenAI')
  })
})

describe('signal field help', () => {
  it('describes every field and primitive', () => {
    expect(Object.keys(SIGNAL_FIELD_HELP).length).toBeGreaterThan(10)
    expect(Object.keys(SIGNAL_FIELD_HELP.criteria)).toEqual(['choice', 'score', 'noul'])
  })
})
