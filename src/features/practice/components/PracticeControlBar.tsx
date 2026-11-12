import type { RefObject } from 'react'
import { isKeyOnlyAction, type PrimaryAction, type PrimaryActionKind } from '../lib/primaryAction'
import Icon from '@/shared/components/Icon'

/**
 * The bar under the card. With the Flow panel open it starts or stops the flow; otherwise it
 * carries the card's primary action, unless that action is keyboard-only (Recall, Ghost, MCQ
 * and Microdrill use Mod+Shift+Enter), in which case there is no bar.
 */
export default function PracticeControlBar({
  primaryButtonRef, flowPanelOpen, flowRunning, canStartFlow, onStartFlow, onStopFlow,
  action, onAction,
}: {
  /** The primary-action hotkey presses this button. */
  primaryButtonRef: RefObject<HTMLButtonElement | null>
  flowPanelOpen: boolean
  flowRunning: boolean
  canStartFlow: boolean
  onStartFlow: () => void
  onStopFlow: () => void
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

  if (!action || isKeyOnlyAction(action.kind)) return null

  // In a flow, "Next" moves to the next modality, so it reads label-first like a forward arrow.
  const flowNext = flowRunning && action.label === 'Next'
  return (
    <div className="card-control-bar">
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
    </div>
  )
}

/** The primary action's icon (only button actions get here): a flow's "Next" is a larger forward arrow. */
function PrimaryActionIcon({ kind }: { kind: PrimaryActionKind }) {
  if (kind === 'flow-next') return <Icon name="arrow-right" size={18} className="flow-next-icon" />
  return <Icon name="check" size={16} />
}
