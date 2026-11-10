import { useMemo } from 'react'
import type { CodeEditorTuning } from '@/shared/settings/codeEditorTuning'
import RecallCodeEditor, { type RecallEditorLineMeta } from '../editor/RecallCodeEditor'
import type { AppTheme } from '@/app/theme'
import type { RecallAttempt } from '../hooks/useRecallAttempt'
import { inlineDisplayLines, splitInlineAnnotationLine } from '../lib/inlineNotes'

const BASE_LABEL = 'Type the full algorithm from memory'
const BASE_PLACEHOLDER = 'Type the full algorithm from memory...'

const numberedLines = (text: string): RecallEditorLineMeta[] =>
  text.split('\n').map((_, index) => ({ sourceLineNumber: index + 1, inlineDecision: false, inlineNote: undefined }))

/**
 * The recall editor: a read-only preview of the target until the learner starts, then the editor
 * they type into, with the verdict and timing once submitted.
 */
export default function RecallPanel({
  hasDeck, loading, error, attempt, target, theme, tuning, ghostReps, ghostStageLines, inlineEnabled, inlineTask,
  inFlow, locked, evaluating, aiCompletion,
}: {
  hasDeck: boolean
  loading: boolean
  error: string
  attempt: RecallAttempt
  target: string
  theme: AppTheme
  tuning: CodeEditorTuning
  ghostReps: boolean
  /** In a flow's ghost stage, how many targeted lines to type; null otherwise. */
  ghostStageLines: number | null
  inlineEnabled: boolean
  inlineTask: string | undefined
  inFlow: boolean
  /** The card was already answered this session, or the session is over. */
  locked: boolean
  /** A total-recall submission is being evaluated. */
  evaluating: boolean
  aiCompletion: { cardId: string; cardTitle: string; prompt: string; provider: string }
}) {
  const { phase, input, latest, minHeight, error: submitError, aiCompletionStatus, editorRef, previewRef, change, onEnterKey, markAiCompletionShown, setAiCompletionStatus } = attempt
  const previewValue = useMemo(
    () => inlineDisplayLines(target).map(({ line }) => splitInlineAnnotationLine(line).code).join('\n').trimEnd(),
    [target],
  )
  const previewLineMeta = useMemo(() => numberedLines(target), [target])
  const lineMeta = useMemo(() => numberedLines(input).map((line) => ({ ...line, status: null })), [input])
  const ghostSubmitted = latest?.supportLayer === 'ghost-reps'

  const label = !ghostReps
    ? BASE_LABEL
    : ghostStageLines !== null
      ? `Type only the ${ghostStageLines} targeted line${ghostStageLines === 1 ? '' : 's'} from memory`
      : `${BASE_LABEL} with Ghost Reps`
  const placeholder = !ghostReps
    ? BASE_PLACEHOLDER
    : ghostStageLines !== null
      ? 'Trace only the lines you missed on the last recall...'
      : 'Trace the faint algorithm target here...'
  const editorOptions = {
    language: tuning.language,
    theme,
    intellisense: tuning.intellisense,
    styleGuide: tuning.styleGuide,
    commonPatterns: tuning.commonPatterns,
    foldControls: tuning.foldControls,
    showSearchPanel: tuning.showSearchPanel,
  }

  if (!hasDeck) {
    return (
      <div className="panel">
        {loading ? (
          <div className="skeleton-group">
            <div className="skeleton-line w60" />
            <div className="skeleton-line w95 tall" />
            <div className="skeleton-line w95 tall" />
            <div className="skeleton-line w80 tall" />
            <div className="skeleton-line w95 tall" />
            <div className="skeleton-line w45" />
          </div>
        ) : (
          <div className="hint" style={{ marginTop: 0 }}>{error || 'No drills are available yet.'}</div>
        )}
      </div>
    )
  }

  if (phase === 'preview') {
    return (
      <div className="panel recall-preview-panel">
        <div className="drill-fade-in">
          <div className="code-container recall-editor-container" ref={previewRef}>
            <div className="typing-editor-shell">
              <div className="recall-editor-code-wrap">
                <div className="recall-submit-summary-slot" aria-live="polite" />
                <RecallCodeEditor {...editorOptions} value={previewValue} editable={false} placeholder="" lineMeta={previewLineMeta} onChange={() => {}} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const typing = phase === 'typing'
  return (
    <div className="panel">
      <label className="answer-label" htmlFor="main-recall-input">{label}</label>
      <div
        className={[
          'code-container recall-editor-container',
          ghostSubmitted ? 'recall-editor-container-ghost-submitted' : '',
          evaluating ? 'recall-editor-container-recall-evaluating' : '',
        ].filter(Boolean).join(' ')}
        aria-busy={evaluating || undefined}
        style={minHeight ? { minHeight: minHeight } : undefined}
      >
        <div className="typing-editor-shell">
          <div className="recall-editor-code-wrap">
            <div className="recall-submit-summary-slot" aria-live="polite">
              {evaluating ? (
                <div className="recall-submit-summary recall-submit-summary-loading" role="status">
                  <span className="recall-submit-loading-indicator" aria-hidden="true" />
                  <span>Evaluating recall…</span>
                </div>
              ) : phase === 'submitted' && latest ? (
                <div className="recall-submit-summary">
                  <span className="recall-submit-metric">
                    <span className="recall-submit-metric-name">Outcome</span>
                    <span className="recall-submit-metric-value">{latest.exact ? 'Sound' : 'Needs work'}</span>
                  </span>
                  <span className="recall-submit-metric">
                    <span className="recall-submit-metric-name">Time</span>
                    <span className="recall-submit-metric-value">{(latest.elapsedMs / 1000).toFixed(1)}s</span>
                  </span>
                </div>
              ) : null}
              {!inFlow && phase === 'submitted' && submitError ? <p className="flow-submit-error" role="alert">{submitError}</p> : null}
            </div>
            <RecallCodeEditor
              {...editorOptions}
              ref={editorRef}
              value={input}
              editable={typing && !evaluating}
              disabled={locked || evaluating}
              placeholder={typing && (ghostReps || inlineEnabled) ? '' : placeholder}
              ghostTarget={typing && ghostReps ? target : undefined}
              inlineTask={inlineTask}
              aiCompletion={aiCompletion}
              aiCompletionEnabled={tuning.aiCompletion && typing && !ghostReps && !evaluating && !locked}
              onAiCompletionShown={markAiCompletionShown}
              onAiCompletionStatus={setAiCompletionStatus}
              lineMeta={lineMeta}
              minHeight={minHeight}
              onChange={change}
              onEnterKey={onEnterKey}
            />
            {aiCompletionStatus && typing && <p className="hint" role="status">{aiCompletionStatus}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
