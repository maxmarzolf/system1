import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ModelCallDetails from './ModelCallDetails'

const generation = [
  {
    attempt: 1,
    provider: 'claude',
    model: 'claude-fast',
    maxTokens: 1200,
    temperature: 0.7,
    timeoutSeconds: 90,
    startedAt: '2026-11-11T10:00:00+00:00',
    latencyMs: 400,
    systemPrompt: 'You write one multiple-choice card.',
    payload: { angle: 'a boundary or edge case' },
    reply: '{"drill": {"question": "broken"}}',
    ok: false,
    error: { code: 'provider_invalid_json', message: 'Claude API error: response could not be parsed as JSON.' },
  },
  {
    attempt: 2,
    provider: 'claude',
    model: 'claude-fast',
    latencyMs: 2300,
    usage: { inputTokens: 820, outputTokens: 410 },
    systemPrompt: 'You write one multiple-choice card.',
    payload: { angle: 'a boundary or edge case' },
    reply: '{"drill": {"question": "Why left <= right?"}}',
    parsed: { drill: { question: 'Why left <= right?' } },
    ok: true,
  },
]

describe('ModelCallDetails', () => {
  it('shows each generation call with its settings, request and response, failures included', () => {
    render(<ModelCallDetails generationTrace={generation} evaluation={{}} />)
    const section = screen.getByRole('region', { name: 'Generation' })
    expect(within(section).getByText('Generation (2)')).toBeInTheDocument()
    expect(within(section).getByText('#1 · claude · claude-fast · 400 ms · failed: provider_invalid_json')).toHaveClass('model-call-header-failed')
    expect(within(section).getByText('#2 · claude · claude-fast · 2.3 s · 820 in / 410 out')).toBeInTheDocument()
    expect(within(section).getAllByText('You write one multiple-choice card.')).toHaveLength(2)
    expect(within(section).getByText('Claude API error: response could not be parsed as JSON.')).toBeInTheDocument()
    expect(within(section).getByText('1200')).toBeInTheDocument()
    expect(within(section).getByText('90 s')).toBeInTheDocument()
    expect(section.textContent).toContain('"angle": "a boundary or edge case"')
    expect(section.textContent).toContain('"question": "Why left <= right?"')
  })

  it('shows grading LLM calls and the full Jev request and answers', () => {
    render(
      <ModelCallDetails
        generationTrace={[]}
        evaluation={{
          llmTrace: [{ attempt: 1, provider: 'openai', systemPrompt: 'Grade this recall.', payload: { userAnswer: 'x' }, ok: true }],
          jevTrace: [
            {
              model: 'jev-1.13.0',
              requestId: 'req-1',
              latencyMs: 1200,
              attempts: 2,
              usage: { input_tokens: 30, output_tokens: 4 },
              state: { question: 'When does the window shrink?' },
              questions: { correctness: { type: 'choice', instructions: 'Is it right?' } },
              answers: { correctness: { type: 'choice', choice: '1' } },
            },
          ],
        }}
      />,
    )
    expect(screen.getByText('No generation calls were stored (questions made before tracing, or not LLM-generated).')).toBeInTheDocument()
    const grading = screen.getByRole('region', { name: 'Grading LLM calls' })
    expect(within(grading).getByText('#1 · openai · default model')).toBeInTheDocument()
    expect(within(grading).getByText('Grade this recall.')).toBeInTheDocument()
    const jev = screen.getByRole('region', { name: 'Jev' })
    expect(within(jev).getByText('#1 · jev · jev-1.13.0 · 1.2 s · 30 in / 4 out · 2 attempts · request req-1')).toBeInTheDocument()
    expect(jev.textContent).toContain('When does the window shrink?')
    expect(jev.textContent).toContain('Is it right?')
    expect(jev.textContent).toContain('"choice": "1"')
  })

  it('explains when nothing was called, and reads older Jev traces with question ids only', () => {
    const { rerender } = render(<ModelCallDetails generationTrace={undefined} evaluation={null} />)
    expect(screen.getByText('No LLM calls were made while grading.')).toBeInTheDocument()
    expect(screen.getByText('Jev was not called.')).toBeInTheDocument()
    rerender(<ModelCallDetails generationTrace={null} evaluation={{ jevTrace: [{ questionIds: ['correctness'], answers: {} }] }} />)
    expect(screen.getByText('#1 · jev')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Jev' }).textContent).toContain('"correctness"')
  })
})
