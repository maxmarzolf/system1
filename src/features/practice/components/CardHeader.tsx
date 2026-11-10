import type { PracticePanels } from '../hooks/usePracticePanels'
import { INLINE_FEEDBACK_ENABLED, type PracticeMode } from '../lib/types'
import Icon from '@/shared/components/Icon'
import IconToggle from '@/shared/components/IconToggle'

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
          <Icon name="columns" />
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
        <IconToggle
          icon="inline"
          iconSize={16}
          className={INLINE_FEEDBACK_ENABLED ? 'navbar-toggle' : 'navbar-toggle navbar-toggle-crossed'}
          active={INLINE_FEEDBACK_ENABLED && inlineEnabled}
          pressed={INLINE_FEEDBACK_ENABLED && inlineEnabled}
          label={INLINE_FEEDBACK_ENABLED ? (inlineEnabled ? 'Turn Inline off' : 'Turn Inline on') : 'Inline disabled'}
          title={INLINE_FEEDBACK_ENABLED ? 'Inline' : 'Inline disabled'}
          disabled={inFlow || !recall || !INLINE_FEEDBACK_ENABLED}
          onClick={onToggleInline}
        />
        <IconToggle
          icon="ghost"
          iconSize={16}
          className="navbar-toggle"
          active={ghostReps}
          pressed={ghostReps}
          label={ghostReps ? 'Turn Ghost Reps off' : 'Turn Ghost Reps on'}
          title="Ghost Reps"
          disabled={inFlow || !recall}
          onClick={onToggleGhostReps}
        />
        <IconToggle
          icon="sparkle"
          iconSize={16}
          className="navbar-toggle"
          active={aiCompletion}
          pressed={aiCompletion}
          label={aiCompletion ? 'Turn AI completion off' : 'Turn AI completion on'}
          title="AI completion · Tab accepts a suggestion"
          disabled={!recall}
          onClick={onToggleAiCompletion}
        />
      </div>
      <div className="card-side-drawer-actions" aria-label="Card side controls">
        <IconToggle
          icon="zen"
          className="card-side-drawer-toggle zen-mode-toggle"
          active={panels.zen}
          pressed={panels.zen}
          label={panels.zen ? 'Exit Zen mode' : 'Enter Zen mode'}
          keyShortcuts={panels.zen ? 'Escape' : undefined}
          title={panels.zen ? 'Exit Zen mode (Esc)' : 'Enter Zen mode'}
          srLabel="Zen mode"
          onClick={panels.toggleZen}
        />
        <IconToggle
          icon="ladder"
          className="card-side-drawer-toggle"
          active={ladderActive}
          pressed={ladderActive}
          expanded={ladderActive}
          controls="sliding-window-ladder"
          label={ladderActive ? 'Close Ladder' : 'Open Sliding Window Ladder'}
          title={ladderTechnique
            ? standaloneMcq
              ? 'Select Recall to open the Ladder for this card'
              : `${ladderActive ? 'Close' : 'Open'} ${ladderTechnique} Sliding Window Ladder`
            : 'Ladder available for fixed or variable sliding window cards'}
          srLabel="Ladder"
          disabled={!ladderTechnique || standaloneMcq}
          onClick={onToggleLadder}
        />
        <IconToggle
          icon="flow"
          iconSize={16}
          className="card-side-drawer-toggle"
          active={panels.flowOpen}
          expanded={panels.flowOpen}
          controls="card-flow-panel"
          label={panels.flowOpen ? 'Hide Flow menu' : 'Show Flow menu'}
          title="Flow"
          srLabel="Flow"
          onClick={panels.toggleFlow}
        />
        <IconToggle
          icon="related"
          iconSize={16}
          className="card-side-drawer-toggle"
          active={panels.relatedOpen}
          expanded={panels.relatedOpen}
          controls={hasRelated ? 'related-problems-drawer' : undefined}
          label={panels.relatedOpen ? 'Hide related LeetCode drawer' : 'Show related LeetCode drawer'}
          title={hasRelated ? 'Related LeetCode' : 'No related LeetCode problems for this card'}
          srLabel="Related LeetCode"
          disabled={!hasRelated}
          onClick={panels.toggleRelated}
        />
        <IconToggle
          icon="tags"
          className="card-side-drawer-toggle card-tags-drawer-toggle"
          active={panels.tagsExpanded}
          expanded={panels.tagsExpanded}
          controls={hasTags ? tagsListId : undefined}
          label={panels.tagsExpanded ? 'Hide tags' : 'Show tags'}
          title={hasTags ? (panels.tagsExpanded ? 'Hide tags' : 'Show tags') : 'No tags for this card'}
          srLabel="Tags"
          disabled={!hasTags}
          onClick={panels.toggleTags}
        />
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
