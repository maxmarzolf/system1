import type { CSSProperties } from 'react'
import type { MultipleChoiceAttempt } from '../hooks/useMultipleChoiceAttempt'
import MarkdownCodeContent from './MarkdownCodeContent'
import type { MultipleChoiceCard } from '../lib/types'

/** The answer choices for an MCQ card and, once graded, the verdict with its explanation. */
export default function MultipleChoicePanel({ hasDeck, loading, error, card, attempt, locked, syntaxTheme }: {
  hasDeck: boolean
  loading: boolean
  error: string
  card: MultipleChoiceCard | null
  attempt: MultipleChoiceAttempt
  /** The card was already answered this session, or the session is over. */
  locked: boolean
  syntaxTheme: Record<string, CSSProperties>
}) {
  const view = attempt.viewOf(card)
  return (
    <div className="panel">
      {!hasDeck ? (
        loading ? (
          <div className="multiple-choice-card" role="status" aria-label="Generating answer choices">
            <div className="mcq-section-heading" aria-hidden="true">
              <span className="prompt-section-label">Choose one answer</span>
            </div>
            <div className="multiple-choice-options">
              {['A', 'B', 'C', 'D'].map((choice) => (
                <div className="multiple-choice-option multiple-choice-option-loading" key={choice} aria-hidden="true">
                  <span className="multiple-choice-option-id">{choice}</span>
                  <div className="skeleton-group">
                    <div className="skeleton-line w95" />
                    <div className="skeleton-line w60" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="hint" style={{ marginTop: 0 }}>{error || 'No multiple choice questions are available yet.'}</div>
        )
      ) : card ? (
        <div className="multiple-choice-card">
          <div className="mcq-section-heading">
            <span className="prompt-section-label">Choose one answer</span>
          </div>
          <div className="multiple-choice-options" role="radiogroup" aria-label="Answer choices">
            {card.choices.map((choice) => {
              const selected = attempt.selectedChoiceId === choice.id
              const submittedChoice = view.submittedChoiceId === choice.id
              const result = !view.submitted ? '' : card.correctChoiceId === choice.id ? ' correct' : submittedChoice ? ' incorrect' : ''
              return (
                <button
                  key={choice.id}
                  type="button"
                  className={`multiple-choice-option${selected ? ' selected' : ''}${result}`}
                  onClick={() => {
                    if (!view.submitted) attempt.select(choice.id)
                  }}
                  disabled={view.submitted || locked}
                  role="radio"
                  aria-checked={selected || submittedChoice}
                >
                  <span className="multiple-choice-option-id">{choice.id}</span>
                  <span className="multiple-choice-option-text">
                    <MarkdownCodeContent text={choice.text} syntaxTheme={syntaxTheme} compact />
                  </span>
                </button>
              )
            })}
          </div>
          {attempt.submitError && !view.submitted ? <p className="hint" role="alert">{attempt.submitError}</p> : null}
          {view.submitted && (
            <div className={view.correct ? 'mcq-feedback mcq-feedback-correct' : 'mcq-feedback mcq-feedback-incorrect'} role="status">
              <div className="mcq-feedback-heading">
                <span className="mcq-feedback-mark" aria-hidden="true">{view.correct ? '✓' : '↗'}</span>
                <strong>{view.correct ? 'Correct' : 'Not quite'}</strong>
              </div>
              <div className="mcq-feedback-explanation">
                <MarkdownCodeContent text={card.explanation} syntaxTheme={syntaxTheme} compact />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
