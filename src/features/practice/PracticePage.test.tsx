import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import PracticePage from './PracticePage'
import { ThemeProvider } from '@/app/theme'
import { mockFetch, type FetchMock } from '@/test/fetch'
import { button, drill, evaluation, flush, mcqCard, pressKey, submitKey, typeCode } from '@/test/app'

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
        <PracticePage />
      </MemoryRouter>
    </ThemeProvider>,
  )

beforeEach(() => setup())

describe('practice: recall', () => {
  it('loads a deck, then starts, types and submits a recall rep', async () => {
    renderApp()
    expect(await screen.findByText('TOPIC: Window a')).toBeInTheDocument()
    expect(fetch.calls.some((call) => call.url.includes('/api/coach/problem-drills?count=10'))).toBe(true)
    submitKey()
    expect(screen.getByText('Type the full algorithm from memory')).toBeInTheDocument()
    typeCode('def f(nums, k):\n    return 0')
    submitKey()
    expect(await screen.findByText('Needs work')).toBeInTheDocument()
    expect(attempts[0]).toMatchObject({ cardId: 'a', userAnswer: 'def f(nums, k):\n    return 0', modality: 'total-recall' })
  })

  it('records a sound answer', async () => {
    setup({ attempt: () => ({ saved: true, attemptId: 1, successful: true, evaluation: evaluation(true) }) })
    renderApp()
    await screen.findByText('TOPIC: Window a')
    submitKey()
    typeCode('def f(nums, k):\n    total = sum(nums[:k])\n    return total')
    submitKey()
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
    await screen.findByText('TOPIC: Window a')
    submitKey()
    typeCode('x = 1')
    submitKey()
    const panel = await screen.findByLabelText('Submission feedback unavailable')
    expect(within(panel).getByText(/Claude timed out/)).toBeInTheDocument()
  })

  it('shows why the server rejected an attempt instead of hiding it', async () => {
    setup({
      attemptStatus: 422,
      attempt: () => ({ detail: [{ loc: ['body', 'cardId'], msg: 'String should have at least 1 character' }] }),
    })
    renderApp()
    await screen.findByText('TOPIC: Window a')
    submitKey()
    typeCode('x = 1')
    submitKey()
    expect(
      await screen.findByText('This attempt was rejected: Invalid request: cardId: String should have at least 1 character'),
    ).toBeInTheDocument()
  })

  it('keeps the generic message when the server is down', async () => {
    setup({ attemptStatus: 503, attempt: () => ({ detail: 'down' }) })
    renderApp()
    await screen.findByText('TOPIC: Window a')
    submitKey()
    typeCode('x = 1')
    submitKey()
    expect(await screen.findByText('Submission evaluation unavailable for this attempt.')).toBeInTheDocument()
  })

  it('has no Previous, Next, Start or Submit buttons', async () => {
    renderApp()
    await screen.findByText('TOPIC: Window a')
    expect(screen.queryByRole('button', { name: /Previous card|Next card|Start|Submit/ })).toBeNull()
    expect(document.querySelector('.card-control-bar')).toBeNull()
    expect(document.querySelector('.card-header')).toBeNull()
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

const questionType = () => screen.getByLabelText('Question type')
const modeKey = (key: 'ArrowUp' | 'ArrowDown') => {
  pressKey(key, { metaKey: true })
  pressKey(key, { metaKey: true })
}

describe('practice: question type', () => {
  it('has no card toolbar, and shows the question type in the navbar', async () => {
    renderApp()
    await screen.findByText('TOPIC: Window a')
    expect(screen.queryByRole('group', { name: 'Practice mode' })).toBeNull()
    expect(screen.queryByRole('button', { name: /card controls|Ghost Reps|MCQ/ })).toBeNull()
    expect(document.querySelector('.mcq-session-meta')).toBeNull()
    expect(questionType()).toHaveTextContent('Recall')
  })

  it('steps through MCQ, Recall and Ghost with double-tapped Cmd + up and down', async () => {
    renderApp()
    await screen.findByText('TOPIC: Window a')
    pressKey('ArrowDown', { metaKey: true })
    expect(questionType()).toHaveTextContent('Recall')
    pressKey('ArrowDown', { metaKey: true })
    expect(questionType()).toHaveTextContent('Ghost')
    modeKey('ArrowDown')
    expect(questionType()).toHaveTextContent('Ghost')
    modeKey('ArrowUp')
    expect(questionType()).toHaveTextContent('Recall')
    modeKey('ArrowUp')
    expect(questionType()).toHaveTextContent('MCQ')
    expect(await screen.findByRole('radiogroup', { name: 'Answer choices' })).toBeInTheDocument()
    modeKey('ArrowUp')
    expect(questionType()).toHaveTextContent('MCQ')
    modeKey('ArrowDown')
    expect(questionType()).toHaveTextContent('Recall')
  })

  it('opens and closes the flow menu from the URL', async () => {
    renderApp('/?panel=flow')
    await waitFor(() => expect(button('Start flow')).toBeEnabled())
    expect(screen.getByLabelText('Flow configuration')).toBeInTheDocument()
    expect(screen.getByText('Build your flow')).toBeInTheDocument()
  })

  it('runs the Ghost Rep support layer on the typing editor', async () => {
    renderApp()
    await screen.findByText('TOPIC: Window a')
    modeKey('ArrowDown')
    expect(questionType()).toHaveTextContent('Ghost')
    submitKey()
    typeCode('def f(nums, k):\n    total = sum(nums[:k])')
    submitKey()
    await waitFor(() => expect(attempts[0]).toMatchObject({ modality: 'ghost-rep' }))
  })

  it('responds to keyboard shortcuts', async () => {
    renderApp()
    await screen.findByText('TOPIC: Window a')
    submitKey() // start
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
    await screen.findByText('TOPIC: Window a')
    modeKey('ArrowUp')
    const choices = await screen.findByRole('radiogroup', { name: 'Answer choices' })
    expect(fetch.calls.some((call) => call.url.includes('/api/coach/multiple-choice-drills'))).toBe(true)
    expect(screen.queryByRole('button', { name: /Submit/ })).toBeNull()
    pressKey('2') // second answer
    expect(within(choices).getByRole('radio', { name: /A sorted list/ })).toHaveAttribute('aria-checked', 'true')
    pressKey('a') // first answer
    expect(within(choices).getByRole('radio', { name: /A min-heap of size k/ })).toHaveAttribute('aria-checked', 'true')
    submitKey()
    await waitFor(() => expect(attempts[0]).toMatchObject({ selectedChoiceId: 'A' }))
  })

  it('shows why the server would not grade an answer', async () => {
    setup({
      attemptStatus: 422,
      attempt: () => ({ detail: { code: 'mcq_unknown_problem', message: "Unknown multiple-choice problem '1'." } }),
    })
    renderApp()
    await screen.findByText('TOPIC: Window a')
    modeKey('ArrowUp')
    const choices = await screen.findByRole('radiogroup', { name: 'Answer choices' })
    await userEvent.click(within(choices).getByText('A min-heap of size k'))
    submitKey()
    expect(
      await screen.findByText("Your answer could not be graded: Unknown multiple-choice problem '1'."),
    ).toBeInTheDocument()
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
    expect(await screen.findByText('TOPIC: Playlist card')).toBeInTheDocument()
  })

  it('streams a generated playlist', async () => {
    setup({
      extra: [
        { match: '/api/catalog/playlists', body: playlists },
        { method: 'POST', match: '/api/coach/skill-map-drills-stream', text: sse('Streamed card') },
      ],
    })
    renderApp('/?playlist=live')
    expect(await screen.findByText('TOPIC: Streamed card')).toBeInTheDocument()
  })

  it('falls back to a single request when streaming fails', async () => {
    setup({
      extra: [
        { match: '/api/catalog/playlists', body: playlists },
        { method: 'POST', match: '/api/coach/skill-map-drills-stream', text: 'event: error\ndata: {"message": "boom"}\n\n' },
      ],
    })
    renderApp('/?playlist=live')
    expect(await screen.findByText('TOPIC: Generated card')).toBeInTheDocument()
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
    await screen.findByText('TOPIC: Window a')
    expect(fetch.calls.some((call) => call.url.includes('tag=heap'))).toBe(true)
  })
})
