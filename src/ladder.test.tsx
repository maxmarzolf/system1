import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SlidingWindowLadder, { type LadderQuestion } from './WindowLadderPanel'
import { LADDER_REPS_PER_RUNG } from './windowLadderPlan'
import { mockFetch } from './test/fetch'

vi.mock('./RecallCodeEditor', () => ({
  default: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) => (
    <textarea aria-label="code" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  ),
}))

const question = (rung = 0): LadderQuestion => ({
  rungTitle: `Rung ${rung}`,
  question: `Write rung ${rung}`,
  starterCode: 'def f():\n    pass',
  solution: 'def f():\n    return 1',
  language: 'python',
})

const storageKey = 'system1-ladder-v1:card-1:fixed'

function renderLadder(onSave = vi.fn(), onClose = vi.fn()) {
  render(
    <SlidingWindowLadder
      cardId="card-1"
      cardTitle="Window"
      cardPrompt="p"
      cardTarget="t"
      technique="fixed"
      provider="openai"
      theme="dark-high-contrast"
      onSave={onSave}
      onClose={onClose}
    />,
  )
  return { onSave, onClose }
}

const answer = async (text = 'def f():\n    return 1') => {
  const editor = await screen.findByLabelText('code')
  fireEvent.change(editor, { target: { value: text } })
}

describe('SlidingWindowLadder', () => {
  it('loads a question, submits a rep and moves to the next one', async () => {
    const fetch = mockFetch([{ method: 'POST', match: '/api/coach/sliding-window-ladder', respond: () => question() }])
    const onSave = vi.fn(async () => ({
      saved: true,
      successful: true,
      evaluation: { feedback: { fullFeedback: 'Nice.', nextMove: 'Keep going.', affirmation: 'Clean' } },
    }))
    renderLadder(onSave)
    expect(screen.getByRole('status')).toHaveTextContent('Writing a new question')
    expect(await screen.findByText('Write rung 0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit rep' })).toBeDisabled() // unchanged starter code
    await answer()
    await userEvent.click(screen.getByRole('button', { name: 'Submit rep' }))
    expect(await screen.findByText('Nice.')).toBeInTheDocument()
    expect(screen.getByText('Keep going.')).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ question: 'Write rung 0' }), 'def f():\n    return 1', expect.any(Number), expect.any(String), 0, 1)
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
    await waitFor(() => expect(fetch.calls).toHaveLength(2))
    expect(JSON.parse(String(fetch.calls[1].init?.body))).toMatchObject({ rungIndex: 0, rep: 2 })
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}')).toMatchObject({ rungIndex: 0, rep: 2 })
  })

  it('stays on the rung after a miss', async () => {
    const fetch = mockFetch([{ method: 'POST', match: '/api/coach/sliding-window-ladder', respond: () => question() }])
    renderLadder(vi.fn(async () => ({ saved: true, successful: false, evaluation: { feedback: { primaryFocus: 'Shrink first' } } })))
    await answer()
    await userEvent.click(screen.getByRole('button', { name: 'Submit rep' }))
    expect(await screen.findByText('This rung needs another rep.')).toBeInTheDocument()
    expect(screen.getByText('The next question stays on this rung.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
    await waitFor(() => expect(fetch.calls).toHaveLength(2))
    expect(JSON.parse(String(fetch.calls[1].init?.body)).recentAttempts[0]).toMatchObject({ successful: false, weakness: 'Shrink first' })
  })

  it('finishes a rung on its last rep and the ladder on the last rung', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ rungIndex: 4, rep: LADDER_REPS_PER_RUNG, recentAttempts: [] }))
    mockFetch([{ method: 'POST', match: '/api/coach/sliding-window-ladder', respond: () => question(4) }])
    const { onClose } = renderLadder(vi.fn(async () => ({ saved: true, successful: true, evaluation: { feedback: {} } })))
    await answer()
    await userEvent.click(screen.getByRole('button', { name: 'Submit rep' }))
    expect(await screen.findByText('Sound. This rep counts.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next rung' }))
    expect(screen.getByText(/Ladder complete/)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}').complete).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Return to card' }))
    expect(onClose).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Start Ladder again' }))
    expect(await screen.findByText('Write rung 4')).toBeInTheDocument()
  })

  it('advances to the next rung after ten reps', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ rungIndex: 1, rep: LADDER_REPS_PER_RUNG, recentAttempts: [{}, {}] }))
    const fetch = mockFetch([{ method: 'POST', match: '/api/coach/sliding-window-ladder', respond: () => question(1) }])
    renderLadder(vi.fn(async () => ({ saved: true, successful: true, evaluation: { feedback: { strengths: ['a', 'b'] } } })))
    await answer()
    await userEvent.click(screen.getByRole('button', { name: 'Submit rep' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Next rung' }))
    await waitFor(() => expect(fetch.calls).toHaveLength(2))
    expect(JSON.parse(String(fetch.calls[1].init?.body))).toMatchObject({ rungIndex: 2, rep: 1 })
  })

  it('reports save failures and generation failures, and retries', async () => {
    const fetch = mockFetch([{ method: 'POST', match: '/api/coach/sliding-window-ladder', status: 503, body: { detail: 'No provider' } }])
    renderLadder(vi.fn(async () => null))
    expect(await screen.findByRole('alert')).toHaveTextContent('No provider')
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify(question())))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await answer()
    await userEvent.click(screen.getByRole('button', { name: 'Submit rep' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your answer could not be saved')
  })

  it('uses a generic message for unexpected failures', async () => {
    mockFetch([{ method: 'POST', match: '/api/coach/sliding-window-ladder', status: 500, body: { detail: [{ msg: 'x' }] } }])
    renderLadder()
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to generate a Ladder question.')
  })

  it('ignores corrupt saved progress', async () => {
    for (const saved of ['{', JSON.stringify({ rungIndex: 9, rep: 1 }), JSON.stringify({ rungIndex: 'a' })]) {
      localStorage.setItem(storageKey, saved)
      mockFetch([{ method: 'POST', match: '/api/coach/sliding-window-ladder', respond: () => question() }])
      const { unmount } = render(
        <SlidingWindowLadder cardId="card-1" cardTitle="W" cardPrompt="" cardTarget="" technique="fixed" provider="" theme="dark-high-contrast" onSave={vi.fn()} onClose={vi.fn()} />,
      )
      expect(await screen.findByText(/Rung 1 of 5 · Rep 1 of 10/)).toBeInTheDocument()
      unmount()
    }
  })
})
