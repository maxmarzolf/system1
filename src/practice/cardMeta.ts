import type { McqFlowMode } from '../mcqTuning'
import { MULTIPLE_CHOICE_DIFFICULTY } from './mcqRequests'
import { INLINE_LENS, RECALL_TARGET_MODE } from './targets'
import type { Flashcard, MultipleChoiceCard, PracticeFlowState, PracticeMode } from './types'

const TEMPLATE_MODE = 'algorithm'
const HIDDEN_TAGS = new Set(['skill-map', 'skill-map-mcq'])

/**
 * How the current card is labelled: its header title, badges and tags, the question types and
 * skill tags its attempts are saved under, and the History link for it.
 */
export function describeCard({ card, mcqCard, mode, flow, inlineEnabled, requestedQuestionType, mcqFlowMode, hasDeck }: {
  /** The recall card (the flow's anchor during a flow). */
  card: Flashcard
  mcqCard: MultipleChoiceCard | null
  mode: PracticeMode
  flow: PracticeFlowState | null
  inlineEnabled: boolean
  requestedQuestionType: string
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

  const questionType = `${requestedQuestionType}:${RECALL_TARGET_MODE}${inlineEnabled ? `:${INLINE_LENS}` : ''}`
  const skillTags = [
    ...card.tags,
    `template-${TEMPLATE_MODE}`,
    `target-${RECALL_TARGET_MODE}`,
    ...(inlineEnabled ? [`inline-${INLINE_LENS}`] : []),
    ...(flow ? ['mode-flow', `flow-stage-${flow.stage}`, `flow-cycle-${flow.cycle}`] : []),
  ]
  const mcqQuestionType = flow ? `skill-map-mcq:card:progressive:flow-cycle-${flow.cycle}` : `skill-map-mcq:card:${mcqFlowMode}`
  const mcqSkillTags = [
    ...(mcqCard?.tags ?? []),
    'mode-multiple-choice',
    'source-card',
    `flow-${flow ? 'progressive' : mcqFlowMode}`,
    `difficulty-${MULTIPLE_CHOICE_DIFFICULTY === 'Hard' ? 'hard' : 'med'}`,
    ...(flow ? ['mode-flow', `flow-cycle-${flow.cycle}`] : []),
  ]

  const historyHref = (() => {
    if (!hasDeck) return '/practice-history'
    const [id, title, type, tags] = mcq && mcqCard
      ? [mcqCard.id, mcqCard.title, mcqQuestionType, mcqSkillTags]
      : [card.id, card.title, questionType, skillTags]
    const params = new URLSearchParams({ cardId: id, cardTitle: title, questionType: type })
    tags.forEach((tag) => params.append('tag', tag))
    return `/practice-history?${params.toString()}`
  })()

  return {
    headerTitle,
    badges,
    visibleTags: headerTags.filter((tag) => !HIDDEN_TAGS.has(tag)),
    questionType,
    skillTags,
    mcqQuestionType,
    mcqSkillTags,
    /** Groups recall attempts on the same card and settings for the attempt history. */
    recallHistoryKey: `${card.id}:${TEMPLATE_MODE}:${RECALL_TARGET_MODE}:${inlineEnabled ? INLINE_LENS : 'plain'}`,
    historyHref,
  }
}
