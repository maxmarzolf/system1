import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import PracticePage from './PracticePage'
import { ThemeProvider } from '@/app/theme'
import { mockFetch } from '@/test/fetch'
import { button, drill, evaluation, mcqCard, pressKey, submitKey, typeCode } from '@/test/app'

const SLOW = { timeout: 6000 }

function setup(attempt: (body: Record<string, unknown>) => boolean) {
  const attempts: Record<string, unknown>[] = []
  const fetch = mockFetch([
    { match: '/api/coach/provider-default', body: { provider: 'openai' } },
    { match: '/api/catalog/playlists', body: { playlists: [] } },
    { match: '/api/skill-map', body: [] },
    { match: '/api/coach/problem-drills', body: { drills: [drill('a'), drill('b')], llmUsed: false } },
    { method: 'POST', match: '/api/coach/multiple-choice-drills', body: { drills: [mcqCard('1'), mcqCard('2')], llmUsed: true } },
    {
      method: 'POST',
      match: '/api/coach/micro-drill',
      body: { prompt: 'Fill the window', language: 'python', template: 'total = ___\nreturn total', answers: ['sum(nums[:k])'] },
    },
    { method: 'POST', match: '/api/coach/history', body: { summary: {}, entries: [] } },
    {
      method: 'POST',
      match: '/api/attempts',
      respond: (_url, init) => {
        const body = JSON.parse(String(init?.body))
        attempts.push(body)
        const successful = attempt(body)
        return { saved: true, attemptId: attempts.length, successful, evaluation: evaluation(successful) }
      },
    },
  ])
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/?panel=flow']}>
        <PracticePage />
      </MemoryRouter>
    </ThemeProvider>,
  )
  return { attempts, fetch }
}

const continueFlow = async () => userEvent.click(await screen.findByRole('button', { name: 'Continue to the next modality' }, SLOW))
const continueRecallOrGhostFlow = async () => {
  await waitFor(() => expect(document.querySelector('.recall-submit-summary:not(.recall-submit-summary-loading)')).not.toBeNull(), SLOW)
  expect(screen.queryByRole('button', { name: 'Continue to the next modality' })).toBeNull()
  pressKey('Enter', { metaKey: true })
}

describe('practice flow', () => {
  it('adapts from a recall miss to ghost reps, a microdrill and an MCQ', async () => {
    const { attempts, fetch } = setup(() => false)
    await waitFor(() => expect(button('Start flow')).toBeEnabled())
    await userEvent.click(button('Start flow'))
    expect(screen.getByLabelText('Question type')).toHaveTextContent('Total Recall')

    // Recall, missed.
    await screen.findByText('Type the full algorithm from memory', undefined, SLOW)
    typeCode('def f(nums, k):\n    return 0')
    submitKey()
    await waitFor(() => expect(attempts).toHaveLength(1))
    await continueRecallOrGhostFlow()

    // Ghost reps on the missed lines.
    expect(await screen.findByText(/Type only the \d+ targeted lines? from memory/, undefined, SLOW)).toBeInTheDocument()
    typeCode('def f(nums, k):\n    total = sum(nums[:k])\n    return total')
    submitKey()
    await waitFor(() => expect(attempts).toHaveLength(2))
    expect(attempts[1]).toMatchObject({ modality: 'ghost-rep' })
    await continueRecallOrGhostFlow()

    // Microdrill: fill the blank.
    expect(await screen.findByText('Fill the window', undefined, SLOW)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Blank 1, line 1'), { target: { value: 'sum(nums[:k])' } })
    submitKey()
    await waitFor(() => expect(attempts).toHaveLength(3), SLOW)
    expect(attempts[2]).toMatchObject({ modality: 'microdrill' })
    expect(fetch.calls.some((call) => call.url.includes('/api/coach/micro-drill'))).toBe(true)
    await continueFlow()

    // The direct modality keys also work inside a running flow.
    pressKey('ArrowUp', { metaKey: true })
    pressKey('ArrowUp', { metaKey: true })
    expect(screen.getByLabelText('Question type')).toHaveTextContent('Total Recall')
    pressKey('ArrowRight', { metaKey: true })
    pressKey('ArrowRight', { metaKey: true })
    expect(screen.getByLabelText('Question type')).toHaveTextContent('Ghost')
    expect(document.querySelector('.flow-coach-transition')).toBeNull()
  }, 30000)

  it('runs a custom MCQ-only flow', async () => {
    const { attempts } = setup(() => true)
    await waitFor(() => expect(button('Start flow')).toBeEnabled())
    const panel = screen.getByLabelText('Flow configuration')
    await userEvent.click(within(panel).getByRole('button', { name: 'Custom sequence' }))
    for (const select of within(panel).getAllByLabelText(/Modality for block/)) {
      await userEvent.selectOptions(select, 'multiple-choice')
    }
    await userEvent.click(button('Start flow'))
    const choices = await screen.findByRole('radiogroup', { name: 'Answer choices' }, SLOW)
    await userEvent.click(within(choices).getByText('A min-heap of size k'))
    submitKey()
    await waitFor(() => expect(attempts[0]).toMatchObject({ modality: 'mcq', selectedChoiceId: 'A' }), SLOW)
    await continueFlow()
    expect(await screen.findByRole('radiogroup', { name: 'Answer choices' }, SLOW)).toBeInTheDocument()
  }, 30000)
})
