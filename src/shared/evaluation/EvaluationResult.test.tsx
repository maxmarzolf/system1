import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import EvaluationResult from './EvaluationResult'
import type { Evaluation } from './evaluation'

const graded = {
  verdict: 'close',
  score: { overall: 64 },
  correctness: { source: 'deterministic-override', overrides: [{ key: 'no_return', message: 'The answer never returns a value.' }] },
  provenance: { flags: ['deterministic_override', 'low_correctness_confidence', 'custom_flag'] },
  signalResults: {
    nearMiss: { label: 'Near miss', role: 'score', status: 'scored', score: 91.5 },
    mistake: { label: 'Main mistake', role: 'diagnostic', status: 'scored', raw: 'missing return' },
    speed: { label: 'Speed', role: 'score', status: 'unavailable' },
  },
  feedback: { fullFeedback: 'Almost: return the total.', primaryFocus: 'Return values', nextMove: 'Write the return first.' },
} as unknown as Evaluation

describe('EvaluationResult', () => {
  it('shows the verdict, score, source, flags, overrides, feedback and signals', () => {
    render(<EvaluationResult evaluation={graded} />)
    expect(screen.getByText('Close')).toBeInTheDocument()
    expect(screen.getByText('64')).toBeInTheDocument()
    expect(screen.getByText('Overridden by a code check')).toBeInTheDocument()
    // The override flag is redundant with the source, so it isn't repeated.
    expect(screen.queryByText('Code check overrode Jev')).not.toBeInTheDocument()
    expect(screen.getByText('Low confidence')).toBeInTheDocument()
    expect(screen.getByText('custom_flag')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('The answer never returns a value.')
    expect(screen.getByText('Almost: return the total.')).toBeInTheDocument()
    expect(screen.getByText('Return values')).toBeInTheDocument()
    expect(screen.getByText('Write the return first.')).toBeInTheDocument()
    expect(screen.getByLabelText('Near miss score')).toHaveAttribute('value', '91.5')
    expect(screen.getByText('missing return')).toBeInTheDocument()
    expect(screen.queryByText('Speed')).not.toBeInTheDocument()
  })

  it('keeps only the head and feedback when compact', () => {
    render(<EvaluationResult evaluation={graded} compact />)
    expect(screen.getByText('Almost: return the total.')).toBeInTheDocument()
    expect(screen.queryByText('Return values')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Signals' })).not.toBeInTheDocument()
  })

  it('renders nothing without an evaluation or verdict', () => {
    const { container, rerender } = render(<EvaluationResult evaluation={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<EvaluationResult evaluation={{ feedback: {} } as unknown as Evaluation} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a bare sound verdict without optional parts', () => {
    render(<EvaluationResult evaluation={{ verdict: 'sound' } as unknown as Evaluation} />)
    expect(screen.getByRole('region', { name: 'Result' })).toHaveTextContent('Sound')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
