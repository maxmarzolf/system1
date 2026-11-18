import type { McqFlowMode } from '@/api/queries'
import { MULTIPLE_CHOICE_DIFFICULTY } from './types'
import { INLINE_LENS, RECALL_TARGET_MODE } from './targets'
import type { Flashcard, MultipleChoiceCard, PracticeFlowState, PracticeMode } from './types'

const HIDDEN_TAGS = new Set(['skill-map', 'skill-map-mcq'])

/**
 * How the current card is labelled: its header title, badges, tags, and History link.
 */
export function describeCard({ card, mcqCard, mode, flow, inlineEnabled, mcqFlowMode, hasDeck }: {
  /** The recall card (the flow's anchor during a flow). */
  card: Flashcard
  mcqCard: MultipleChoiceCard | null
  mode: PracticeMode
  flow: PracticeFlowState | null
  inlineEnabled: boolean
  mcqFlowMode: McqFlowMode
  hasDeck: boolean
}) {
  const mcq = mode === 'multiple-choice'
  // A flow keeps its anchor card in the header even at its MCQ stage.
  const headerTitle = flow ? flow.anchorTitle : mcq ? mcqCard?.title ?? 'Multiple Choice' : card.title
  const headerDifficulty = flow || !mcq ? card.difficulty : mcqCard?.difficulty ?? MULTIPLE_CHOICE_DIFFICULTY
  const headerTags = flow || !mcq ? card.tags : mcqCard?.tags ?? []
  const badges = [
    ...(!card.skeletonApplicability ? [headerDifficulty === 'Med.' ? 'Medium' : headerDifficulty] : []),
    ...(headerTags.includes('core-algorithm') ? ['Core'] : []),
    ...(headerTags.includes('core-meta') || headerTags.includes('meta') ? ['Meta'] : []),
  ]

  const skillTags = [
    ...card.tags,
    `target-${RECALL_TARGET_MODE}`,
    ...(inlineEnabled ? [`inline-${INLINE_LENS}`] : []),
    ...(flow ? ['mode-flow', `flow-stage-${flow.stage}`, `flow-cycle-${flow.cycle}`] : []),
  ]
  const mcqSkillTags = [
    ...(mcqCard?.tags ?? []),
    'mode-multiple-choice',
    'source-card',
    `flow-${flow ? 'progressive' : mcqFlowMode}`,
    `difficulty-${MULTIPLE_CHOICE_DIFFICULTY === 'Hard' ? 'hard' : 'med'}`,
    ...(flow ? ['mode-flow', `flow-cycle-${flow.cycle}`] : []),
  ]

  const historyHref = (() => {
    if (!hasDeck) return '/'
    const [id, title, tags] = mcq && mcqCard
      ? [mcqCard.id, mcqCard.title, mcqSkillTags]
      : [card.id, card.title, skillTags]
    const params = new URLSearchParams({ cardId: id, cardTitle: title })
    tags.forEach((tag) => params.append('tag', tag))
    return `/?${params.toString()}`
  })()

  return {
    headerTitle,
    badges,
    visibleTags: headerTags.filter((tag) => !HIDDEN_TAGS.has(tag)),
    skillTags,
    mcqSkillTags,
    /** Groups recall attempts on the same card and settings in the local practice flow. */
    recallHistoryKey: `${card.id}:${RECALL_TARGET_MODE}:${inlineEnabled ? INLINE_LENS : 'plain'}`,
    historyHref,
  }
}
