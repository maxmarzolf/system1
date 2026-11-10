import type { RefObject } from 'react'
import type { PrimaryAction } from '../lib/primaryAction'
import PrimaryActionIcon from './PrimaryActionIcon'

/**
 * The bar under the card. With the Flow panel open it starts or stops the flow; otherwise it
 * moves between cards and carries the card's primary action.
 */
export default function PracticeControlBar({
  primaryButtonRef, flowPanelOpen, flowRunning, canStartFlow, onStartFlow, onStopFlow,
  canGoPrev, canGoNext, onPrev, onNext, action, onAction,
}: {
  /** The primary-action hotkey presses this button. */
  primaryButtonRef: RefObject<HTMLButtonElement | null>
  flowPanelOpen: boolean
  flowRunning: boolean
  canStartFlow: boolean
  onStartFlow: () => void
  onStopFlow: () => void
  canGoPrev: boolean
  canGoNext: boolean
  onPrev: () => void
  onNext: () => void
  action: PrimaryAction | null
  onAction: () => void
}) {
  if (flowPanelOpen) {
    return (
      <div className="card-control-bar">
        <div className="card-control-group card-control-group-primary">
          <button
            type="button"
            ref={primaryButtonRef}
            className="card-control-button"
            onClick={flowRunning ? onStopFlow : onStartFlow}
            disabled={!flowRunning && !canStartFlow}
          >
            {flowRunning ? 'Stop flow' : 'Start flow'}
          </button>
        </div>
      </div>
    )
  }

  // In a flow, "Next" moves to the next modality, so it reads label-first like a forward arrow.
  const flowNext = flowRunning && action?.label === 'Next'
  return (
    <div className="card-control-bar">
      <div className="card-control-group">
        <button type="button" className="secondary card-control-button" onClick={onPrev} disabled={!canGoPrev} aria-label="Previous card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061a1.125 1.125 0 0 1 1.683.977v8.122Z" />
          </svg>
          <span>Previous</span>
        </button>
        <button type="button" className="secondary card-control-button" onClick={onNext} disabled={!canGoNext} aria-label="Next card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
          </svg>
          <span>Next</span>
        </button>
      </div>
      {action && (
        <div className="card-control-group card-control-group-primary">
          <button
            type="button"
            ref={primaryButtonRef}
            className={flowNext ? 'card-control-button card-control-button-flow-next' : 'card-control-button'}
            onClick={onAction}
            disabled={action.disabled}
            aria-label={flowNext ? 'Continue to the next modality' : undefined}
          >
            {flowNext ? (
              <>
                <span>{action.label}</span>
                <PrimaryActionIcon kind={action.kind} />
              </>
            ) : (
              <>
                <PrimaryActionIcon kind={action.kind} />
                <span>{action.label}</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
