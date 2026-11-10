import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SignalSpecTable from './SignalSpecTable'

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
