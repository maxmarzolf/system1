import type { PracticePanels } from '../hooks/usePracticePanels'
import { INLINE_FEEDBACK_ENABLED, type PracticeMode } from '../types'

export type McqSessionMeta = {
  inFlow: boolean
  flowModeLabel: string
  focusLabel: string | null
  position: number
  total: number
}

/** The card's title, its practice controls, and its tag list. */
export default function CardHeader({ title, flowSubtitle, mcqMeta, controls, panels, tags }: {
  title: string
  /** Shown with the Flow panel open instead of the card title. */
  flowSubtitle: string
  mcqMeta: McqSessionMeta | null
  controls: CardControlsProps
  panels: PracticePanels
  tags: CardTagsProps
}) {
  return (
    <div className="card-header">
      <div className="card-header-main">
        {panels.flowOpen ? (
          <>
            <span className="related-problems-eyebrow">Flow</span>
            <h3>Flow</h3>
            <p className="card-flow-header-subtitle">{flowSubtitle}</p>
          </>
        ) : (
          <>
            <h3>{title}</h3>
            {mcqMeta ? (
              <div className="mcq-session-meta">
                <span className="mcq-session-context">{mcqMeta.inFlow ? 'Targeted card flow' : 'Current card'}</span>
                <span className="mcq-session-separator" aria-hidden="true">/</span>
                <span className="mcq-session-context">{mcqMeta.flowModeLabel}</span>
                {mcqMeta.focusLabel && <span className="mcq-session-context">{mcqMeta.focusLabel}</span>}
                <span className="mcq-session-progress">Question {mcqMeta.position} of {mcqMeta.total}</span>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className={panels.controlsOpen ? 'card-header-aside card-header-aside-open' : 'card-header-aside'}>
        <div
          className="card-header-controls-panel"
          id="card-header-controls-panel"
          inert={!panels.controlsOpen}
          aria-hidden={!panels.controlsOpen}
        >
          <CardControls {...controls} panels={panels} hasTags={tags.badges.length + tags.tags.length > 0} tagsListId={tags.id} />
        </div>
        <button
          type="button"
          className="card-header-settings-toggle"
          aria-controls="card-header-controls-panel"
          aria-expanded={panels.controlsOpen}
          aria-label={panels.controlsOpen ? 'Hide card controls' : 'Show card controls'}
          title={panels.controlsOpen ? 'Hide card controls' : 'Show card controls'}
          onClick={panels.toggleControls}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
          </svg>
        </button>
      </div>
      <CardTags {...tags} expanded={panels.tagsExpanded} />
    </div>
  )
}

export type CardControlsProps = {
  mode: PracticeMode
  inFlow: boolean
  canChooseMcq: boolean
  onChooseRecall: () => void
  onChooseMcq: () => void
  inlineEnabled: boolean
  onToggleInline: () => void
  ghostReps: boolean
  onToggleGhostReps: () => void
  aiCompletion: boolean
  onToggleAiCompletion: () => void
  /** The card's sliding-window technique, when it has a Ladder. */
  ladderTechnique: string | null
  ladderActive: boolean
  onToggleLadder: () => void
  hasRelated: boolean
}

function CardControls({
  mode, inFlow, canChooseMcq, onChooseRecall, onChooseMcq, inlineEnabled, onToggleInline, ghostReps, onToggleGhostReps,
  aiCompletion, onToggleAiCompletion, ladderTechnique, ladderActive, onToggleLadder, hasRelated, panels, hasTags, tagsListId,
}: CardControlsProps & { panels: PracticePanels; hasTags: boolean; tagsListId: string }) {
  const recall = mode === 'recall'
  const standaloneMcq = mode === 'multiple-choice' && !inFlow
  return (
    <div className="card-header-side">
      <div className="practice-mode-control" role="group" aria-label="Practice mode">
        <button
          type="button"
          className={recall ? 'practice-mode-button active' : 'practice-mode-button'}
          onClick={onChooseRecall}
          aria-pressed={recall}
          title="Recall"
          disabled={inFlow}
        >
          Recall
        </button>
        <button
          type="button"
          className={mode === 'multiple-choice' ? 'practice-mode-button active' : 'practice-mode-button'}
          onClick={onChooseMcq}
          aria-pressed={mode === 'multiple-choice'}
          title="Multiple Choice"
          disabled={inFlow || !canChooseMcq}
        >
          MCQ
        </button>
      </div>
      <div className="support-layer-control" aria-label="Practice support controls">
        <button
          type="button"
          className={[
            INLINE_FEEDBACK_ENABLED && inlineEnabled ? 'navbar-toggle active' : 'navbar-toggle',
            !INLINE_FEEDBACK_ENABLED ? 'navbar-toggle-crossed' : '',
          ].filter(Boolean).join(' ')}
          onClick={onToggleInline}
          aria-pressed={INLINE_FEEDBACK_ENABLED && inlineEnabled}
          aria-label={INLINE_FEEDBACK_ENABLED ? (inlineEnabled ? 'Turn Inline off' : 'Turn Inline on') : 'Inline disabled'}
          title={INLINE_FEEDBACK_ENABLED ? 'Inline' : 'Inline disabled'}
          disabled={inFlow || !recall || !INLINE_FEEDBACK_ENABLED}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        </button>
        <button
          type="button"
          className={ghostReps ? 'navbar-toggle active' : 'navbar-toggle'}
          onClick={onToggleGhostReps}
          aria-pressed={ghostReps}
          aria-label={ghostReps ? 'Turn Ghost Reps off' : 'Turn Ghost Reps on'}
          title="Ghost Reps"
          disabled={inFlow || !recall}
        >
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12.5V6.5a5 5 0 0 1 10 0v6l-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5Z"/>
            <circle cx="5.5" cy="6.5" r="0.75" fill="currentColor" stroke="none"/>
            <circle cx="8.5" cy="6.5" r="0.75" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <button
          type="button"
          className={aiCompletion ? 'navbar-toggle active' : 'navbar-toggle'}
          onClick={onToggleAiCompletion}
          aria-pressed={aiCompletion}
          aria-label={aiCompletion ? 'Turn AI completion off' : 'Turn AI completion on'}
          title="AI completion · Tab accepts a suggestion"
          disabled={!recall}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2.5 14.1 9.9 21.5 12l-7.4 2.1L12 21.5l-2.1-7.4L2.5 12l7.4-2.1L12 2.5Z" />
          </svg>
        </button>
      </div>
      <div className="card-side-drawer-actions" aria-label="Card side controls">
        <button
          type="button"
          className={panels.zen ? 'card-side-drawer-toggle zen-mode-toggle active' : 'card-side-drawer-toggle zen-mode-toggle'}
          aria-pressed={panels.zen}
          aria-label={panels.zen ? 'Exit Zen mode' : 'Enter Zen mode'}
          aria-keyshortcuts={panels.zen ? 'Escape' : undefined}
          title={panels.zen ? 'Exit Zen mode (Esc)' : 'Enter Zen mode'}
          onClick={panels.toggleZen}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8.25 4.5H5.625A1.125 1.125 0 0 0 4.5 5.625V8.25m11.25-3.75h2.625A1.125 1.125 0 0 1 19.5 5.625V8.25m0 7.5v2.625a1.125 1.125 0 0 1-1.125 1.125H15.75m-7.5 0H5.625A1.125 1.125 0 0 1 4.5 18.375V15.75" />
            <circle cx="12" cy="12" r="1.5" />
          </svg>
          <span className="sr-only">Zen mode</span>
        </button>
        <button
          type="button"
          className={ladderActive ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
          aria-pressed={ladderActive}
          aria-expanded={ladderActive}
          aria-controls="sliding-window-ladder"
          aria-label={ladderActive ? 'Close Ladder' : 'Open Sliding Window Ladder'}
          title={ladderTechnique
            ? standaloneMcq
              ? 'Select Recall to open the Ladder for this card'
              : `${ladderActive ? 'Close' : 'Open'} ${ladderTechnique} Sliding Window Ladder`
            : 'Ladder available for fixed or variable sliding window cards'}
          onClick={onToggleLadder}
          disabled={!ladderTechnique || standaloneMcq}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
          </svg>
          <span className="sr-only">Ladder</span>
        </button>
        <button
          type="button"
          className={panels.flowOpen ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
          aria-expanded={panels.flowOpen}
          aria-controls="card-flow-panel"
          aria-label={panels.flowOpen ? 'Hide Flow menu' : 'Show Flow menu'}
          title="Flow"
          onClick={panels.toggleFlow}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <span className="sr-only">Flow</span>
        </button>
        <button
          type="button"
          className={panels.relatedOpen ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
          aria-expanded={panels.relatedOpen}
          aria-controls={hasRelated ? 'related-problems-drawer' : undefined}
          aria-label={panels.relatedOpen ? 'Hide related LeetCode drawer' : 'Show related LeetCode drawer'}
          title={hasRelated ? 'Related LeetCode' : 'No related LeetCode problems for this card'}
          disabled={!hasRelated}
          onClick={panels.toggleRelated}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
          </svg>
          <span className="sr-only">Related LeetCode</span>
        </button>
        <button
          type="button"
          className={panels.tagsExpanded ? 'card-side-drawer-toggle card-tags-drawer-toggle active' : 'card-side-drawer-toggle card-tags-drawer-toggle'}
          aria-expanded={panels.tagsExpanded}
          aria-controls={hasTags ? tagsListId : undefined}
          aria-label={panels.tagsExpanded ? 'Hide tags' : 'Show tags'}
          title={hasTags ? (panels.tagsExpanded ? 'Hide tags' : 'Show tags') : 'No tags for this card'}
          disabled={!hasTags}
          onClick={panels.toggleTags}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          <span className="sr-only">Tags</span>
        </button>
      </div>
    </div>
  )
}

export type CardTagsProps = {
  id: string
  /** Difficulty and kind labels, shown before the tags. */
  badges: string[]
  tags: string[]
  activeTag: string
  onTagClick: (tag: string) => void
}

function CardTags({ id, badges, tags, activeTag, onTagClick, expanded }: CardTagsProps & { expanded: boolean }) {
  if (badges.length + tags.length === 0) return null
  return (
    <div className={expanded ? 'tags expanded' : 'tags'}>
      <div className="tags-list" id={id} aria-label="Card details and tags" aria-hidden={!expanded}>
        {badges.map((label, index) => (
          <span className="tag-item" key={`badge-${label}`}>
            <span className="tag tag-static">{label.toLowerCase()}</span>
            {(index < badges.length - 1 || tags.length > 0) && <span className="tag-separator" aria-hidden="true">,</span>}
          </span>
        ))}
        {tags.map((tag, index) => (
          <span className="tag-item" key={tag}>
            <button
              type="button"
              className={activeTag === tag ? 'tag tag-button active' : 'tag tag-button'}
              onClick={() => onTagClick(tag)}
              aria-pressed={activeTag === tag}
              disabled={!expanded}
            >
              {tag.replaceAll('-', ' ')}
            </button>
            {index < tags.length - 1 && <span className="tag-separator" aria-hidden="true">,</span>}
          </span>
        ))}
      </div>
    </div>
  )
}
