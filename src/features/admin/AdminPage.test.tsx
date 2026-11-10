import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AdminPage from './AdminPage'
import {
  SignalAdminError,
  createSignal,
  draftFromSignal,
  emptySignalDraft,
  fetchSignalAdminCatalog,
  jevQuestionFor,
  setSignalArchived,
  type AdminSignal,
  type SignalAdminCatalog,
} from './api'
import { ThemeProvider } from '@/app/theme'
import { mockFetch } from '@/test/fetch'

const signal = (overrides: Partial<AdminSignal> = {}): AdminSignal => ({
  ...emptySignalDraft(),
  key: 'conceptRecognition',
  label: 'Concept recognition',
  instructions: 'Did they recognize the concept?',
  primitive: 'noul',
  modality: 'mcq',
  status: 'active',
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  archivedAt: null,
  jevQuestion: null,
  effectiveShare: 0.1,
  weight: 0.15,
  ...overrides,
})

const catalog = (): SignalAdminCatalog => ({
  modality: 'mcq',
  stateFields: ['question', 'answers'],
  directive: {
    modality: 'mcq',
    instructions: 'Was the answer correct?',
    criteria: { '1': 'correct', '0': 'incorrect' },
    correctnessWeight: 0.6,
    version: 1,
    updatedAt: '2026-01-01T00:00:00Z',
    labels: ['1', '0'],
    weightShare: 0.55,
  },
  signals: [
    signal(),
    signal({
      key: 'distractor',
      label: 'Distractor',
      primitive: 'choice',
      criteria: { wrong_update: 'Updated the wrong bound', other: null },
      scoreMap: { wrong_update: 0 },
      role: 'diagnostic',
      instructions: '',
    }),
    signal({ key: 'nearMiss', label: 'Near miss', primitive: 'score', criteria: ['far', 'close', 'exact'], status: 'archived', appliesWhen: 'incorrect' }),
    signal({ key: 'completionTime', label: 'Speed', source: 'deterministic', primitive: null, implementation: 'completionTime', instructions: '' }),
    signal({ key: 'heapOrder', label: 'Heap order', scope: 'heap', instructions: '' }),
  ],
  algorithms: [{ slug: 'heap', name: 'Heap' }, { slug: 'graphs', name: 'Graphs' }],
  implementations: [{ name: 'completionTime', label: 'Completion time', description: 'Faster is better.' }],
})

const specCatalog = {
  default: { algorithm: 'default', version: 1, structuralElements: ['loop'], signals: [] },
  algorithms: [
    { slug: 'heap', name: 'Heap', usesDefault: true, seeded: false, spec: { algorithm: 'default', version: 1, structuralElements: [], signals: [] } },
    {
      slug: 'binary-search',
      name: 'Binary Search',
      usesDefault: false,
      seeded: true,
      spec: {
        algorithm: 'binary-search',
        version: 2,
        structuralElements: ['bounds'],
        signals: [{ key: 'midpoint', label: 'Midpoint', kind: 'score', role: 'dimension', weight: 0.2, guidance: 'g', variationStrategy: 'v', axis: null }],
      },
    },
  ],
}

type Sent = { url: string; method: string; body: Record<string, unknown> }

function routes(overrides: { catalogStatus?: number; write?: { status: number; body: unknown } } = {}) {
  const sent: Sent[] = []
  const record = (url: string, init?: RequestInit) => {
    sent.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : {} })
    return overrides.write?.body ?? { key: 'created' }
  }
  const status = overrides.write?.status ?? 200
  const fetch = mockFetch([
    { match: '/api/coach/provider-default', body: { provider: 'openai' } },
    { match: '/api/catalog/signal-specs', body: specCatalog },
    { match: '/api/admin/signals/samples', body: [
      { id: 'p1', question: 'Which heap?', choices: [{ id: 'A', text: 'Min' }, { id: 'B', text: 'Max' }], correctChoiceId: 'A' },
      { id: 'p2', question: 'Second', choices: [{ id: 'C', text: 'Only' }], correctChoiceId: 'C' },
    ] },
    { match: '/api/admin/signals/revisions/', body: [{ id: 1, subject: 'x', action: 'update', before: {}, after: {}, createdAt: '2026-01-01T00:00:00Z' }] },
    { method: 'POST', match: '/api/admin/signals/try', respond: () => ({
      state: {}, answeredCorrectly: false, applies: true, question: { type: 'noul' }, answer: { noul: 0.7 },
      result: { status: 'scored', raw: 0.7, score: 70, confidence: 0.9, note: '' }, model: 'jev-test',
    }) },
    { match: /\/api\/admin\/signals$/, status: overrides.catalogStatus ?? 200, body: catalog() },
    { method: 'POST', match: '/api/admin/signals', status, respond: record },
    { method: 'PUT', match: '/api/admin/signals', status, respond: record },
  ])
  return { fetch, sent }
}

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.search}</output>
}

const renderAdmin = (path = '/admin') =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AdminPage />
        <Location />
      </MemoryRouter>
    </ThemeProvider>,
  )

const card = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('article') as HTMLElement

describe('AdminPage: browsing', () => {
  it('lists MCQ signals grouped by scope with the correctness question', async () => {
    routes()
    renderAdmin()
    await screen.findByText('Correctness question')
    expect(screen.getByRole('heading', { name: 'All MCQ signals' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Heap' })).toBeInTheDocument()
    expect(within(card('Near miss')).getByText('Archived')).toBeInTheDocument()
    expect(within(card('Near miss')).getByText('Score 0–2')).toBeInTheDocument()
    expect(within(card('Distractor')).getByText('Choice (2 labels)')).toBeInTheDocument()
    expect(within(card('Speed')).getByText('Computed in code: Faster is better.')).toBeInTheDocument()
    expect(within(card('Heap order')).getByText('No instructions yet.')).toBeInTheDocument()
    expect(within(card('Concept recognition')).getByText('Weight: 15%')).toBeInTheDocument()
  })

  it('filters by scope through the URL', async () => {
    routes()
    renderAdmin()
    await screen.findByText('Correctness question')
    const rail = screen.getByRole('navigation', { name: 'Question types and scopes' })
    await userEvent.click(within(rail).getAllByRole('button', { name: /Heap/ })[0])
    expect(screen.getByTestId('location')).toHaveTextContent('?type=mcq&scope=heap')
    expect(screen.queryByText('Correctness question')).toBeNull()
    expect(screen.getByText(/in addition to the 4 general signals/)).toBeInTheDocument()

    await userEvent.click(within(rail).getByRole('button', { name: 'Graphs' }))
    expect(screen.getByText('No Graphs signals yet.')).toBeInTheDocument()

    await userEvent.click(within(rail).getByRole('button', { name: /General/ }))
    expect(screen.getByText('Asked for every MCQ, in one Jev call with the correctness question.')).toBeInTheDocument()
    expect(screen.getByText('Correctness question')).toBeInTheDocument()

    await userEvent.click(within(rail).getByRole('button', { name: 'MCQ' }))
    expect(screen.getByTestId('location')).toHaveTextContent('')
  })

  it('shows the read-only recall specs', async () => {
    routes()
    renderAdmin('/admin?type=recall')
    await screen.findByText('All recall signals')
    expect(screen.getByText('Used by 1 of 2 algorithms. These have their own:')).toBeInTheDocument()
    const rail = screen.getByRole('navigation', { name: 'Question types and scopes' })
    await userEvent.click(within(rail).getAllByRole('button', { name: /Heap/ })[1])
    expect(screen.getByText('Heap has no spec of its own, so it uses the default spec.')).toBeInTheDocument()
    expect(screen.getByText('Not seeded in the database yet.')).toBeInTheDocument()
    await userEvent.click(within(rail).getByRole('button', { name: /Binary Search/ }))
    expect(screen.getByText('Binary Search signals')).toBeInTheDocument()
    await userEvent.click(within(rail).getByRole('button', { name: 'Recall' }))
    expect(screen.getByText('All recall signals')).toBeInTheDocument()
  })

  it('reports a catalog that will not load', async () => {
    routes({ catalogStatus: 500 })
    renderAdmin()
    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (500)')
  })
})

describe('AdminPage: editing', () => {
  it('edits, saves and discards a signal', async () => {
    const { sent } = routes()
    renderAdmin()
    await screen.findByText('Correctness question')
    const concept = card('Concept recognition')
    await userEvent.click(within(concept).getByRole('button', { name: /Concept recognition/ }))
    const label = within(concept).getByDisplayValue('Concept recognition')
    await userEvent.clear(label)
    await userEvent.type(label, 'Concept named')
    expect(within(concept).getByText('Unsaved')).toBeInTheDocument()
    await userEvent.click(within(concept).getByRole('button', { name: 'Discard' }))
    expect(within(concept).queryByText('Unsaved')).toBeNull()

    await userEvent.type(within(concept).getByDisplayValue('Did they recognize the concept?'), ' Really?')
    await userEvent.click(within(concept).getByRole('button', { name: 'Save' }))
    await within(concept).findByText('Saved. Applies to the next MCQ evaluation.')
    const put = sent.find((item) => item.method === 'PUT')!
    expect(put.url).toContain('/api/admin/signals/conceptRecognition')
    expect(put.body).toMatchObject({ version: 3, instructions: 'Did they recognize the concept? Really?' })
  })

  it('shows field errors and offers a reload on conflict', async () => {
    routes({ write: { status: 409, body: { detail: { code: 'conflict', message: 'Changed elsewhere', errors: { label: 'Stale' } } } } })
    renderAdmin()
    await screen.findByText('Correctness question')
    const concept = card('Concept recognition')
    await userEvent.click(within(concept).getByRole('button', { name: /Concept recognition/ }))
    await userEvent.type(within(concept).getByDisplayValue('Concept recognition'), '!')
    await userEvent.click(within(concept).getByRole('button', { name: 'Save' }))
    await within(concept).findByText('Changed elsewhere')
    expect(within(concept).getByText('Stale')).toBeInTheDocument()
    await userEvent.click(within(concept).getByRole('button', { name: 'Reload signal' }))
  })

  it('archives and restores', async () => {
    const { sent } = routes()
    renderAdmin()
    await screen.findByText('Correctness question')
    const nearMiss = card('Near miss')
    await userEvent.click(within(nearMiss).getByRole('button', { name: /Near miss/ }))
    await userEvent.click(within(nearMiss).getByRole('button', { name: 'Restore' }))
    await within(nearMiss).findByText('Restored. Runs again from the next evaluation.')
    expect(sent.at(-1)?.url).toContain('/nearMiss/restore')

    const concept = card('Concept recognition')
    await userEvent.click(within(concept).getByRole('button', { name: /Concept recognition/ }))
    await userEvent.click(within(concept).getByRole('button', { name: 'Archive' }))
    await within(concept).findByText('Archived. No longer sent to Jev.')
  })

  it('edits every criteria type and the shared fields', async () => {
    routes()
    renderAdmin()
    await screen.findByText('Correctness question')

    const distractor = card('Distractor')
    await userEvent.click(within(distractor).getByRole('button', { name: /Distractor/ }))
    expect(within(distractor).queryByText(/Score 0–100/)).toBeNull() // diagnostic: no score map
    await userEvent.type(within(distractor).getByLabelText('Label 2'), '_two')
    await userEvent.click(within(distractor).getByRole('button', { name: 'Add label' }))
    await userEvent.type(within(distractor).getByLabelText('Label 3'), 'wrong_update')
    expect(within(distractor).getByText(/Duplicate labels/)).toBeInTheDocument()
    await userEvent.click(within(distractor).getByRole('button', { name: 'Remove label 3' }))
    await userEvent.selectOptions(within(distractor).getByDisplayValue('Diagnostic (recorded, not scored)'), 'dimension')
    await userEvent.type(within(distractor).getByLabelText('Score 1'), '40')
    expect(within(distractor).getByLabelText('Score 1')).toHaveValue(40)

    const nearMiss = card('Near miss')
    await userEvent.click(within(nearMiss).getByRole('button', { name: /Near miss/ }))
    await userEvent.click(within(nearMiss).getByRole('button', { name: 'Move level 0 down' }))
    expect(within(nearMiss).getByLabelText('Level 0')).toHaveValue('close')
    await userEvent.click(within(nearMiss).getByRole('button', { name: 'Move level 2 up' }))
    await userEvent.click(within(nearMiss).getByRole('button', { name: 'Add level' }))
    await userEvent.type(within(nearMiss).getByLabelText('Level 3'), 'beyond')
    await userEvent.click(within(nearMiss).getByRole('button', { name: 'Remove level 3' }))

    const concept = card('Concept recognition')
    await userEvent.click(within(concept).getByRole('button', { name: /Concept recognition/ }))
    const outcome = (text: RegExp) => within(concept).getByText(text).closest('label')!.querySelector('input')!
    await userEvent.type(outcome(/Yes means/), 'They named it')
    await userEvent.type(outcome(/No means/), 'They did not')
    expect(within(concept).getByText(/"true": "They named it"/)).toBeInTheDocument()
    await userEvent.selectOptions(within(concept).getByDisplayValue('Noul — yes probability'), 'score')
    expect(within(concept).getByLabelText('Level 0')).toBeInTheDocument()
    await userEvent.selectOptions(within(concept).getByDisplayValue('Score — ordered levels'), 'choice')
    expect(within(concept).getByLabelText('Label 1')).toBeInTheDocument()
    await userEvent.click(within(concept).getByRole('checkbox'))
    expect(within(concept).getAllByText('answeredCorrectly').length).toBeGreaterThan(0)
    fireEvent.change(within(concept).getByDisplayValue('0.15'), { target: { value: '0.4' } })
    await userEvent.selectOptions(within(concept).getByDisplayValue('Always'), 'correct')
    await userEvent.selectOptions(within(concept).getByDisplayValue('None'), 'fluency')
    fireEvent.change(within(concept).getByDisplayValue('0'), { target: { value: '20' } })
    await userEvent.selectOptions(within(concept).getByDisplayValue('General — every MCQ'), 'heap')
    await userEvent.type(within(concept).getByPlaceholderText('What this signal is for and how to read it.'), 'notes')

    const speed = card('Speed')
    await userEvent.click(within(speed).getByRole('button', { name: /Speed/ }))
    expect(within(speed).getByText('Computed locally; nothing is sent to Jev.')).toBeInTheDocument()
    expect(within(speed).getByText(/Logic lives in code/)).toBeInTheDocument()
  })

  it('creates a new signal in the current scope, including a computed one', async () => {
    const { sent } = routes()
    renderAdmin('/admin?type=mcq&scope=heap')
    await screen.findByText('Heap signals')
    const newCard = screen.getByText('+ New signal').closest('article') as HTMLElement
    await userEvent.click(within(newCard).getByRole('button', { name: /New signal/ }))
    expect(within(newCard).getByDisplayValue('Heap only')).toBeInTheDocument()
    await userEvent.selectOptions(within(newCard).getByDisplayValue('Jev question'), 'deterministic')
    expect(within(newCard).getByDisplayValue('completionTime')).toBeInTheDocument()
    await userEvent.selectOptions(within(newCard).getByDisplayValue('Computed in code'), 'jev')
    await userEvent.type(within(newCard).getAllByRole('textbox')[0], 'heapDepth')
    await userEvent.click(within(newCard).getByRole('button', { name: 'Create signal' }))
    await screen.findByText('Created created. Applies to the next MCQ evaluation.')
    expect(sent.at(-1)).toMatchObject({ method: 'POST', body: { key: 'heapDepth', scope: 'heap' } })

    await userEvent.click(within(newCard).getByRole('button', { name: /New signal/ }))
    await userEvent.click(within(newCard).getByRole('button', { name: 'Cancel' }))
    expect(within(newCard).queryByRole('button', { name: 'Create signal' })).toBeNull()
  })

  it('reports create errors', async () => {
    routes({ write: { status: 422, body: { detail: { code: 'invalid_signal', message: 'Signal is invalid.', errors: { key: 'Bad key' } } } } })
    renderAdmin()
    await screen.findByText('Correctness question')
    const newCard = screen.getByText('+ New signal').closest('article') as HTMLElement
    await userEvent.click(within(newCard).getByRole('button', { name: /New signal/ }))
    await userEvent.click(within(newCard).getByRole('button', { name: 'Create signal' }))
    expect(await within(newCard).findByText('Bad key')).toBeInTheDocument()
    expect(within(newCard).getByText('Signal is invalid.')).toBeInTheDocument()
  })

  it('edits and saves the correctness question', async () => {
    const { sent } = routes()
    renderAdmin()
    await screen.findByText('Correctness question')
    const instructions = screen.getByDisplayValue('Was the answer correct?')
    await userEvent.type(instructions, ' Strictly.')
    await userEvent.clear(screen.getByDisplayValue('correct'))
    await userEvent.type(screen.getByDisplayValue('incorrect'), '!')
    fireEvent.change(screen.getByDisplayValue('0.6'), { target: { value: 'abc' } })
    const section = instructions.closest('.admin-editor') as HTMLElement
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }))
    await within(section).findByText('Saved. Applies to the next MCQ evaluation.')
    expect(sent.at(-1)).toMatchObject({ method: 'PUT', body: { instructions: 'Was the answer correct? Strictly.', correctnessWeight: 0, version: 1 } })
    await userEvent.type(instructions, 'x')
    await userEvent.click(within(section).getByRole('button', { name: 'Discard' }))
  })

  it('reports correctness save errors', async () => {
    routes({ write: { status: 422, body: { detail: { code: 'invalid_signal', message: 'Nope', errors: { instructions: 'Required.' } } } } })
    renderAdmin()
    await screen.findByText('Correctness question')
    const instructions = screen.getByDisplayValue('Was the answer correct?')
    await userEvent.clear(instructions)
    const section = instructions.closest('.admin-editor') as HTMLElement
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }))
    expect(await within(section).findByText('Required.')).toBeInTheDocument()
  })
})

describe('AdminPage: try it and history', () => {
  it('runs a draft against a stored MCQ and shows the revision history', async () => {
    const { fetch } = routes()
    renderAdmin()
    await screen.findByText('Correctness question')
    const concept = card('Concept recognition')
    await userEvent.click(within(concept).getByRole('button', { name: /Concept recognition/ }))

    const tryPanel = within(concept).getByText('Try it against Jev').closest('details') as HTMLDetailsElement
    tryPanel.open = true
    fireEvent(tryPanel, new Event('toggle'))
    const question = await within(tryPanel).findByDisplayValue('Which heap?')
    expect(within(tryPanel).getByDisplayValue('B. Max')).toBeInTheDocument()
    await userEvent.selectOptions(question, 'p2')
    expect(within(tryPanel).getByDisplayValue('C. Only (correct)')).toBeInTheDocument()
    await userEvent.selectOptions(question, 'p1')
    await userEvent.selectOptions(within(tryPanel).getByDisplayValue('A. Min (correct)'), 'B')
    await userEvent.click(within(tryPanel).getByRole('button', { name: 'Run draft' }))
    await within(tryPanel).findByText('70.0')
    expect(within(tryPanel).getByText('jev-test')).toBeInTheDocument()
    const tried = fetch.calls.find((call) => call.url.includes('/try'))
    expect(JSON.parse(String(tried?.init?.body))).toMatchObject({ problemId: 'p1', choiceId: 'B' })

    const history = within(concept).getByText('History').closest('details') as HTMLDetailsElement
    history.open = true
    fireEvent(history, new Event('toggle'))
    expect(await within(history).findByText('update')).toBeInTheDocument()
    history.open = false
    fireEvent(history, new Event('toggle'))
  })

  it('explains empty samples and try failures', async () => {
    mockFetch([
      { match: '/api/coach/provider-default', body: { provider: 'openai' } },
      { match: '/api/catalog/signal-specs', status: 500 },
      { match: '/api/admin/signals/samples', body: [] },
      { match: '/api/admin/signals/revisions/', body: [] },
      { match: /\/api\/admin\/signals$/, body: catalog() },
    ])
    renderAdmin()
    await screen.findByText('Correctness question')
    const concept = card('Concept recognition')
    await userEvent.click(within(concept).getByRole('button', { name: /Concept recognition/ }))
    const tryPanel = within(concept).getByText('Try it against Jev').closest('details') as HTMLDetailsElement
    tryPanel.open = true
    fireEvent(tryPanel, new Event('toggle'))
    expect(await within(tryPanel).findByText(/No stored MCQs yet/)).toBeInTheDocument()
    const history = within(concept).getByText('History').closest('details') as HTMLDetailsElement
    history.open = true
    fireEvent(history, new Event('toggle'))
    expect(await within(history).findByText('No changes recorded.')).toBeInTheDocument()
  })

  it('shows try errors from Jev and from validation', async () => {
    for (const [status, detail, expected] of [
      [502, { code: 'jev_unavailable', message: 'Jev is down' }, 'Jev is down'],
      [422, { code: 'invalid_signal', message: 'x', errors: { instructions: 'Needs words.' } }, 'Needs words.'],
    ] as const) {
      mockFetch([
        { match: '/api/coach/provider-default', body: { provider: 'openai' } },
        { match: '/api/catalog/signal-specs', body: specCatalog },
        { match: '/api/admin/signals/samples', body: [{ id: 'p1', question: 'Q', choices: [{ id: 'A', text: 'a' }], correctChoiceId: 'A' }] },
        { method: 'POST', match: '/api/admin/signals/try', status, body: { detail } },
        { match: /\/api\/admin\/signals$/, body: catalog() },
      ])
      const { unmount } = renderAdmin()
      await screen.findByText('Correctness question')
      const concept = card('Concept recognition')
      await userEvent.click(within(concept).getByRole('button', { name: /Concept recognition/ }))
      const tryPanel = within(concept).getByText('Try it against Jev').closest('details') as HTMLDetailsElement
      tryPanel.open = true
      fireEvent(tryPanel, new Event('toggle'))
      await userEvent.click(await within(tryPanel).findByRole('button', { name: 'Run draft' }))
      expect(await within(tryPanel).findByRole('alert')).toHaveTextContent(expected)
      unmount()
    }
  })
})

describe('signalAdmin client', () => {
  it('turns error bodies into SignalAdminError', async () => {
    mockFetch([{ match: '/api/admin/signals', status: 404, body: { detail: 'Not here' } }])
    await expect(fetchSignalAdminCatalog()).rejects.toMatchObject({ status: 404, code: 'error', message: 'Not here' })

    const text = new Response('<html>', { status: 500 })
    const fetch = mockFetch([])
    fetch.mockResolvedValueOnce(text)
    await expect(createSignal(emptySignalDraft())).rejects.toBeInstanceOf(SignalAdminError)

    mockFetch([{ method: 'POST', match: '/archive', body: { key: 'k' } }])
    await expect(setSignalArchived('k', true, 1)).resolves.toEqual({ key: 'k' })
  })

  it('builds the exact Jev question for each primitive', () => {
    const base = emptySignalDraft()
    expect(jevQuestionFor({ ...base, source: 'deterministic', primitive: null })).toBeNull()
    expect(jevQuestionFor({ ...base, primitive: 'choice', criteria: null })).toEqual({ type: 'choice', instructions: '', criteria: {} })
    expect(jevQuestionFor({ ...base, primitive: 'score', criteria: { a: 'b' } })).toEqual({ type: 'score', instructions: '', criteria: [] })
    expect(jevQuestionFor({ ...base, primitive: 'noul', criteria: { true: 'yes', false: null } })).toEqual({
      type: 'noul', instructions: '', criteria: { true: 'yes' },
    })
    expect(jevQuestionFor({ ...base, primitive: 'noul', criteria: ['x'] })).toEqual({ type: 'noul', instructions: '' })
  })

  it('copies an admin signal into a draft', () => {
    const draft = draftFromSignal(signal({ description: undefined as never, scoreMap: undefined as never }))
    expect(draft.description).toBe('')
    expect(draft.scoreMap).toEqual({})
  })
})

describe('AdminPage: loading', () => {
  it('shows loading states', async () => {
    routes()
    renderAdmin()
    expect(screen.getByText('Loading signals…')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Loading signals…')).toBeNull())
  })
})
