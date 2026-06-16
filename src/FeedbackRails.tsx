import type { CSSProperties } from 'react'

export type FeedbackRailModel = {
  source: 'Live' | 'Submission'
  items: string[]
  loading?: boolean
}

type FeedbackRailsProps = {
  feedback: FeedbackRailModel
  top: number
  height: number
}

function FeedbackRail({
  items,
  loading,
}: {
  items: string[]
  loading?: boolean
}) {
  return (
    <section className="feedback-rail feedback-rail-generic" aria-label="Feedback">
      {loading && <p className="feedback-rail-loading">Generating feedback...</p>}
      {!loading && items.length === 0 && <p className="feedback-rail-empty">Nothing to call out yet.</p>}
      {!loading && items.length > 0 && (
        <ul className="feedback-rail-list">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="feedback-rail-item">{item}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function FeedbackRails({ feedback, top, height }: FeedbackRailsProps) {
  return (
    <aside
      className="feedback-rails"
      style={{
        '--feedback-rails-top': `${top}px`,
        '--feedback-rails-height': `${height}px`,
      } as CSSProperties}
      aria-label={`${feedback.source} feedback`}
    >
      <FeedbackRail
        items={feedback.items}
        loading={feedback.loading}
      />
    </aside>
  )
}
