import type { RefObject } from 'react'
import type { PrimaryAction, PrimaryActionKind } from '../lib/primaryAction'

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

const PATHS: Partial<Record<PrimaryActionKind, string>> = {
  'microdrill-submit': 'm4.5 12.75 6 6 9-13.5',
  'mcq-submit': 'm4.5 12.75 6 6 9-13.5',
  'recall-start': 'M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605',
}
const SUBMIT_PATH = 'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z'

function PrimaryActionIcon({ kind }: { kind: PrimaryActionKind }) {
  if (kind === 'flow-next') return <FlowNextIcon />
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[kind] ?? SUBMIT_PATH} />
    </svg>
  )
}

function FlowNextIcon() {
  return (
    <svg
      className="flow-next-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  )
}
