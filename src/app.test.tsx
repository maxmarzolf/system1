import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { ThemeProvider } from './theme'
import { mockFetch, type FetchMock } from './test/fetch'
import { button, drill, evaluation, flush, mcqCard, pressKey, typeCode } from './test/app'

type Options = {
  attempt?: (body: Record<string, unknown>) => unknown
  attemptStatus?: number
  drillsStatus?: number
  extra?: Parameters<typeof mockFetch>[0]
}

let fetch: FetchMock
let attempts: Record<string, unknown>[]

function setup(options: Options = {}) {
  attempts = []
  fetch = mockFetch([
    ...(options.extra ?? []),
    { match: '/api/coach/provider-default', body: { provider: 'openai' } },
    { match: '/api/catalog/playlists', body: { playlists: [] } },
    { match: '/api/skill-map', body: [] },
    { match: '/api/coach/problem-drills', status: options.drillsStatus ?? 200, body: { drills: [drill('a'), drill('b'), drill('c')], llmUsed: false } },
    { match: '/api/coach/playlist-drills/', body: { drills: [drill('p1', { title: 'Playlist card' })], llmUsed: false } },
    { method: 'POST', match: '/api/coach/skill-map-drills', body: { drills: [drill('g1', { title: 'Generated card' })], llmUsed: true } },
    { method: 'POST', match: '/api/coach/multiple-choice-drills', body: { drills: [mcqCard('1'), mcqCard('2')], llmUsed: true } },
    { method: 'POST', match: '/api/coach/history', body: { summary: { attemptCount: 0 }, entries: [] } },
    {
      method: 'POST',
      match: '/api/attempts',
      status: options.attemptStatus ?? 201,
      respond: (_url, init) => {
        const body = JSON.parse(String(init?.body))
        attempts.push(body)
        return options.attempt?.(body) ?? { saved: true, attemptId: attempts.length, successful: false, evaluation: evaluation(false) }
      },
    },
  ])
}

const renderApp = (path = '/') =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  )

beforeEach(() => setup())

describe('practice: recall', () => {
  it('loads a deck, then starts, types and submits a recall rep', async () => {
    renderApp()
    expect(await screen.findByText('Window a')).toBeInTheDocument()
    expect(fetch.calls.some((call) => call.url.includes('/api/coach/problem-drills?count=10'))).toBe(true)
    await userEvent.click(button('Start'))
    expect(screen.getByText('Type the full algorithm from memory')).toBeInTheDocument()
    typeCode('def f(nums, k):\n    return 0')
    await userEvent.click(button('Submit'))
    expect(await screen.findByText('Needs work')).toBeInTheDocument()
    expect(attempts[0]).toMatchObject({ cardId: 'a', userAnswer: 'def f(nums, k):\n    return 0', modality: 'total-recall' })
  })

  it('records a sound answer', async () => {
    setup({ attempt: () => ({ saved: true, attemptId: 1, successful: true, evaluation: evaluation(true) }) })
    renderApp()
    await screen.findByText('Window a')
    await userEvent.click(button('Start'))
    typeCode('def f(nums, k):\n    total = sum(nums[:k])\n    return total')
    await userEvent.click(button('Submit'))
    expect(await screen.findByText(/Sound|Correct/i)).toBeInTheDocument()
  })

  it('shows when feedback could not be generated', async () => {
    setup({
      attempt: () => ({
        saved: true,
        attemptId: 1,
        successful: false,
        evaluation: evaluation(false),
        feedbackUnavailable: { code: 'provider_timeout', message: 'Claude timed out.', provider: 'claude' },
      }),
    })
    renderApp()
    await screen.findByText('Window a')
    await userEvent.click(button('Start'))
    typeCode('x = 1')
    await userEvent.click(button('Submit'))
    const panel = await screen.findByLabelText('Submission feedback unavailable')
    expect(within(panel).getByText(/Claude timed out/)).toBeInTheDocument()
  })

  it('moves between cards', async () => {
    renderApp()
    await screen.findByText('Window a')
    expect(button('Previous card')).toBeDisabled()
    await userEvent.click(button('Next card'))
    expect(await screen.findByText('Window b')).toBeInTheDocument()
    await userEvent.click(button('Previous card'))
    expect(await screen.findByText('Window a')).toBeInTheDocument()
  })

  it('explains a deck that will not load', async () => {
    setup({
      drillsStatus: 500,
      extra: [{ method: 'POST', match: '/api/coach/skill-map-drills', status: 503, body: { detail: { message: 'No model provider is configured.' } } }],
    })
    renderApp()
    expect((await screen.findAllByText('No model provider is configured.')).length).toBeGreaterThan(0)
  })
})

describe('practice: toolbar', () => {
  it('toggles inline, ghost reps, AI completion, zen, tags, related problems and controls', async () => {
    renderApp()
    await screen.findByText('Window a')
    await userEvent.click(button('Turn Inline on'))
    expect(button('Turn Inline off')).toBeInTheDocument()
    await userEvent.click(button('Turn Ghost Reps on'))
    expect(button('Turn Ghost Reps off')).toBeInTheDocument()
    await userEvent.click(button('Turn AI completion off'))
    expect(button('Turn AI completion on')).toBeInTheDocument()
    await userEvent.click(button('Show tags'))
    expect(button('Hide tags')).toBeInTheDocument()
    await userEvent.click(button('Show related LeetCode drawer'))
    await userEvent.click(button('Enter Zen mode'))
    expect(button('Exit Zen mode')).toBeInTheDocument()
    await userEvent.click(button('Exit Zen mode'))
    await userEvent.click(button('Hide card controls'))
    expect(button('Show card controls')).toBeInTheDocument()
    await userEvent.click(button('Show card controls'))
  })

  it('opens and closes the flow menu from the URL', async () => {
    renderApp('/?panel=flow')
    await screen.findByText('Window a')
    expect(screen.getByLabelText('Flow configuration')).toBeInTheDocument()
    expect(screen.getByText('Build your flow')).toBeInTheDocument()
  })

  it('runs the Ghost Rep support layer on the typing editor', async () => {
    renderApp()
    await screen.findByText('Window a')
    await userEvent.click(button('Turn Ghost Reps on'))
    await userEvent.click(button('Start'))
    typeCode('def f(nums, k):\n    total = sum(nums[:k])')
    await userEvent.click(button('Submit'))
    await waitFor(() => expect(attempts[0]).toMatchObject({ modality: 'ghost-rep' }))
  })

  it('responds to keyboard shortcuts', async () => {
    renderApp()
    await screen.findByText('Window a')
    pressKey('Enter', { metaKey: true }) // primary action: Start
    expect(await screen.findByText('Type the full algorithm from memory')).toBeInTheDocument()
    pressKey('g', { metaKey: true })
    pressKey('l', { metaKey: true })
    pressKey('i', { metaKey: true })
    pressKey('ArrowRight', { metaKey: true })
    pressKey('ArrowRight', { metaKey: true })
    await flush(50)
  })
})

describe('practice: multiple choice', () => {
  it('generates questions and records the chosen answer', async () => {
    setup({ attempt: (body) => ({ saved: true, attemptId: 1, successful: body.selectedChoiceId === 'A', evaluation: evaluation(body.selectedChoiceId === 'A') }) })
    renderApp()
    await screen.findByText('Window a')
    await userEvent.click(button('MCQ'))
    const choices = await screen.findByRole('radiogroup', { name: 'Answer choices' })
    expect(fetch.calls.some((call) => call.url.includes('/api/coach/multiple-choice-drills'))).toBe(true)
    await userEvent.click(within(choices).getByText('A min-heap of size k'))
    const submit = screen.queryByRole('button', { name: /Submit|Check/ })
    if (submit) await userEvent.click(submit)
    await waitFor(() => expect(attempts[0]).toMatchObject({ selectedChoiceId: 'A' }))
  })
})

describe('practice: deck sources', () => {
  const playlists = {
    playlists: [
      { slug: 'blind', title: 'Blind', description: '', staticDeck: true, questions: [{ title: 'Two Sum', coreShape: 'Hash Map', methods: [] }] },
      { slug: 'live', title: 'Live', description: '', questions: [{ title: 'Three Sum', coreShape: 'Two Pointers', methods: ['sort'] }] },
    ],
  }
  const sse = (...titles: string[]) =>
    titles.map((title, index) => `event: drill\ndata: ${JSON.stringify({ index, total: titles.length, drill: drill(`s${index}`, { title }) })}\n\n`).join('')
    + 'event: done\ndata: {"count": 1}\n\n'

  it('loads a static playlist from the URL', async () => {
    setup({ extra: [{ match: '/api/catalog/playlists', body: playlists }] })
    renderApp('/?playlist=blind')
    expect(await screen.findByText('Playlist card')).toBeInTheDocument()
  })

  it('streams a generated playlist', async () => {
    setup({
      extra: [
        { match: '/api/catalog/playlists', body: playlists },
        { method: 'POST', match: '/api/coach/skill-map-drills-stream', text: sse('Streamed card') },
      ],
    })
    renderApp('/?playlist=live')
    expect(await screen.findByText('Streamed card')).toBeInTheDocument()
  })

  it('falls back to a single request when streaming fails', async () => {
    setup({
      extra: [
        { match: '/api/catalog/playlists', body: playlists },
        { method: 'POST', match: '/api/coach/skill-map-drills-stream', text: 'event: error\ndata: {"message": "boom"}\n\n' },
      ],
    })
    renderApp('/?playlist=live')
    expect(await screen.findByText('Generated card')).toBeInTheDocument()
  })

  it('reports an unavailable static playlist', async () => {
    setup({
      extra: [
        { match: '/api/catalog/playlists', body: playlists },
        { match: '/api/coach/playlist-drills/', status: 500 },
      ],
    })
    renderApp('/?playlist=blind')
    expect((await screen.findAllByText('Static playlist is unavailable right now.')).length).toBeGreaterThan(0)
  })

  it('focuses a pattern from the dashboard', async () => {
    setup({ extra: [{ match: '/api/skill-map', body: [{ algorithm: 'Sliding Window', skills: ['expand', 'shrink'] }] }] })
    renderApp('/?focusPattern=sliding-window')
    await screen.findByText(/Window|Generated card/)
  })

  it('focuses a tag', async () => {
    renderApp('/?focusTag=heap')
    await screen.findByText('Window a')
    expect(fetch.calls.some((call) => call.url.includes('tag=heap'))).toBe(true)
  })
})
