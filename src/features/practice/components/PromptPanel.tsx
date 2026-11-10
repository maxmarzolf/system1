import type { CSSProperties } from 'react'
import type { AppTheme } from '@/app/theme'
import { MarkdownCodeContent } from './markdown'
import type { MultipleChoiceCard, PracticeMode } from '../lib/types'

const SkeletonLines = () => (
  <>
    <div className="skeleton-line w95 tall" />
    <div className="skeleton-line w80" />
    <div className="skeleton-line w60" />
  </>
)

/** The left panel: the MCQ question, or the recall prompt (an explanation for skeleton cards). */
export default function PromptPanel({ mode, hasDeck, loading, error, onRetry, mcqCard, prompt, explanation, syntaxTheme, theme }: {
  mode: PracticeMode
  hasDeck: boolean
  loading: boolean
  error: string
  /** Offered when a flow's targeted MCQ failed to generate. */
  onRetry: (() => void) | null
  mcqCard: MultipleChoiceCard | null
  prompt: string
  explanation: string | null
  syntaxTheme: Record<string, CSSProperties>
  theme: AppTheme
}) {
  if (mode === 'multiple-choice') {
    return (
      <div className="panel prompt-surface-panel">
        {!hasDeck ? (
          loading ? (
            <div className="prompt-surface-section skeleton-group" role="status" aria-label="Generating multiple-choice question">
              <div className="prompt-section-content" aria-hidden="true">
                <span className="prompt-section-label">Question</span>
              </div>
              <SkeletonLines />
            </div>
          ) : (
            <div className="prompt-surface-section">
              <span className="prompt-section-label">Question</span>
              <p className="prompt prompt-surface-body prompt-bar">Multiple choice is unavailable right now.</p>
              <p className="hint">{error || 'No question set was returned.'}</p>
              {onRetry && <button type="button" className="secondary" onClick={onRetry}>Retry MCQ</button>}
            </div>
          )
        ) : mcqCard ? (
          <div className="prompt-surface-section">
            <div className="prompt-section-content">
              <span className="prompt-section-label">Question</span>
              <div className="prompt prompt-surface-body multiple-choice-question">
                <MarkdownCodeContent text={mcqCard.question} syntaxTheme={syntaxTheme} theme={theme} editorBlocks />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="panel prompt-surface-panel">
      {!hasDeck ? (
        loading ? (
          <div className="prompt-surface-section skeleton-group" role="status" aria-label="Loading prompt">
            <span className="prompt-section-label" aria-hidden="true">Prompt</span>
            <SkeletonLines />
          </div>
        ) : (
          <div className="prompt-surface-section">
            <span className="prompt-section-label">Prompt</span>
            <p className="prompt prompt-surface-body prompt-bar">The skill-map deck is unavailable right now.</p>
            <p className="hint">{error || 'No drills were returned.'}</p>
          </div>
        )
      ) : (
        <div className="drill-fade-in">
          <div className="prompt-surface-section">
            <div className="prompt-section-content">
              <span className="prompt-section-label">{explanation !== null ? 'Explanation' : 'Prompt'}</span>
              <p className="prompt prompt-surface-body">{explanation ?? prompt}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
