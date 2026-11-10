import type { PracticeFlowTransitionState } from '../lib/types'
import { FLOW_COACH_LABELS } from './practiceFlow'
import Icon from '@/shared/components/Icon'

/** The coach's card between two flow stages: from where, to where, and why. */
export default function FlowCoachTransition({
  transition,
  settling,
}: {
  transition: PracticeFlowTransitionState
  settling: boolean
}) {
  const fromLabel = transition.fromStage ? FLOW_COACH_LABELS[transition.fromStage] : 'Start'
  const toLabel = FLOW_COACH_LABELS[transition.toStage]

  return (
    <section
      className={[
        'flow-transition-card',
        `flow-transition-card-${transition.toStage}`,
        settling ? 'flow-transition-card-settling' : '',
      ].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-label={`Coach transition to ${toLabel}`}
    >
      <div className="flow-transition-topline">
        <span className="flow-transition-eyebrow">Coach · Next modality</span>
        <div className="flow-transition-route" aria-label={`${fromLabel} to ${toLabel}`}>
          <span>{fromLabel}</span>
          <Icon name="chevron-right" />
          <strong>{toLabel}</strong>
        </div>
      </div>
      <div className="flow-transition-copy">
        <h2>{transition.headline}</h2>
        <p>{transition.detail}</p>
      </div>
      <div className="flow-transition-status">
        <span className="flow-transition-status-dot" aria-hidden="true" />
        <span>{transition.status}</span>
      </div>
      <div className="flow-transition-progress" aria-hidden="true"><span /></div>
    </section>
  )
}
