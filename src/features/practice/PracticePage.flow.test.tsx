import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import PracticePage from './PracticePage'
import { ThemeProvider } from '@/app/theme'
import { mockFetch } from '@/test/fetch'
import { button, drill, evaluation, mcqCard, pressKey, typeCode } from '@/test/app'

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

describe('practice flow', () => {
  it('adapts from a recall miss to ghost reps, a microdrill and an MCQ', async () => {
    const { attempts, fetch } = setup(() => false)
    await screen.findByText('Window a')
    await userEvent.click(button('Start flow'))
    expect(screen.getByText('Establish a clean baseline')).toBeInTheDocument()

    // Recall, missed.
    await screen.findByRole('button', { name: 'Submit' }, SLOW)
    typeCode('def f(nums, k):\n    return 0')
    await userEvent.click(button('Submit'))
    await waitFor(() => expect(attempts).toHaveLength(1))
    await continueFlow()

    // Ghost reps on the missed lines.
    expect(await screen.findByText(/Type only the \d+ targeted lines? from memory/, undefined, SLOW)).toBeInTheDocument()
    typeCode('def f(nums, k):\n    total = sum(nums[:k])\n    return total')
    await userEvent.click(await screen.findByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(attempts).toHaveLength(2))
    expect(attempts[1]).toMatchObject({ modality: 'ghost-rep' })
    await continueFlow()

    // Microdrill: fill the blank.
    expect(await screen.findByText('Fill the window', undefined, SLOW)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Building a focused Microdrill…')).toBeNull(), SLOW)
    fireEvent.change(screen.getByLabelText('Blank 1, line 1'), { target: { value: 'sum(nums[:k])' } })
    pressKey('Enter', { metaKey: true })
    await waitFor(() => expect(attempts).toHaveLength(3), SLOW)
    expect(attempts[2]).toMatchObject({ modality: 'microdrill' })
    expect(fetch.calls.some((call) => call.url.includes('/api/coach/micro-drill'))).toBe(true)
    await continueFlow()

    // Then whatever the coach picks next; stop the flow.
    await waitFor(() => expect(screen.queryByText(/Preparing|Building/)).toBeNull(), SLOW)
    await userEvent.click(button('Show Flow menu'))
    await userEvent.click(button('Stop flow'))
    expect(button('Start flow')).toBeInTheDocument()
  }, 30000)

  it('runs a custom MCQ-only flow', async () => {
    const { attempts } = setup(() => true)
    await screen.findByText('Window a')
    const panel = screen.getByLabelText('Flow configuration')
    await userEvent.click(within(panel).getByRole('button', { name: 'Custom sequence' }))
    for (const select of within(panel).getAllByLabelText(/Modality for block/)) {
      await userEvent.selectOptions(select, 'multiple-choice')
    }
    await userEvent.click(button('Start flow'))
    const choices = await screen.findByRole('radiogroup', { name: 'Answer choices' }, SLOW)
    await userEvent.click(within(choices).getByText('A min-heap of size k'))
    pressKey('Enter', { metaKey: true })
    await waitFor(() => expect(attempts[0]).toMatchObject({ modality: 'mcq', selectedChoiceId: 'A' }), SLOW)
    await continueFlow()
    expect(await screen.findByRole('radiogroup', { name: 'Answer choices' }, SLOW)).toBeInTheDocument()
  }, 30000)
})
