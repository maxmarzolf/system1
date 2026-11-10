import type { SubmissionFailureModalState } from '../lib/types'

/** Shown when an attempt was saved but the provider could not write its feedback. */
export default function SubmissionFailureModal({ failure, onClose }: { failure: SubmissionFailureModalState; onClose: () => void }) {
  return (
    <div className="submission-feedback-modal" onClick={onClose}>
      <div
        className="submission-feedback-popover"
        role="dialog"
        aria-modal="true"
        aria-label="Submission feedback unavailable"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="dashboard-activity-eyebrow">Submission feedback unavailable</p>
        <h4>Feedback cannot be generated at this time.</h4>
        <p className="coach-panel-copy" style={{ marginBottom: '0.55rem' }}>{failure.message}</p>
        <div className="actions" style={{ marginTop: 0 }}>
          <button type="button" className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
