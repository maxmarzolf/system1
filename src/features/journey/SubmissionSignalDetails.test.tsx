import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SubmissionSignalDetails from './SubmissionSignalDetails'

describe('SubmissionSignalDetails', () => {
  it('explains a missing evaluation', () => {
    render(<SubmissionSignalDetails evaluation={null} />)
    expect(screen.getByText('No evaluation was stored for this submission.')).toBeInTheDocument()
  })

  it('renders spec, verdict, provenance, scores and rubric, leaving raw Jev calls to Model calls', () => {
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
    expect(screen.queryByText('Jev answers')).toBeNull()
    expect(screen.getByText('0.80')).toBeInTheDocument()
  })

  it('omits optional sections', () => {
    render(<SubmissionSignalDetails evaluation={{ verdict: 'needs-work', correctness: { label: '0' } }} />)
    expect(screen.queryByText('Jev answers')).toBeNull()
    expect(screen.queryByText('Dimensions')).toBeNull()
    expect(screen.getByText(/confidence —/)).toBeInTheDocument()
  })
})
