import FlowBuilder from '../../FlowBuilder'
import type { FlowConfig } from '../../practiceFlow'
import { summarizeFlowFocusLine } from '../lineReview'
import type { MultipleChoiceSpecimenFocus } from '../types'

/** The Flow panel: the flow's configuration, its status, and the lines it is targeting. */
export default function FlowPanel({ config, locked, onConfigChange, status, historyError, focus }: {
  config: FlowConfig
  /** A flow is running; its configuration is fixed until it stops. */
  locked: boolean
  onConfigChange: (config: FlowConfig) => void
  status: string
  historyError: string
  focus: MultipleChoiceSpecimenFocus | null
}) {
  const previewLines = focus?.missedLines.slice(0, 3) ?? []
  return (
    <aside id="card-flow-panel" className="card-flow-panel card-flow-panel-open" aria-label="Flow configuration">
      <div className="related-problems-body card-flow-body">
        <FlowBuilder config={config} disabled={locked} onChange={onConfigChange} />
        <p className="card-flow-status">{status}</p>
        {historyError && <p className="card-flow-summary" role="status">{historyError}</p>}
        {focus?.focusSummary && <p className="card-flow-summary">{focus.focusSummary}</p>}
        {previewLines.length > 0 && (
          <div className="card-flow-focus-list" aria-label="Targeted lines">
            {previewLines.map((line) => (
              <span key={`${line.lineNumber}-${line.status}-${line.expected}`} className="card-flow-focus-chip">
                L{line.lineNumber} {summarizeFlowFocusLine(line)}
              </span>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
