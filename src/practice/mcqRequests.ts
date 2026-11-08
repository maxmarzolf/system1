import type { SkillMapNode } from '../data/skill-map'
import type { FlowGenerationContext } from '../practiceFlow'
import type { McqFlowMode } from '../mcqTuning'
import { getPrimaryPatternTag, patternLabelFromSlug } from './patterns'
import type { Flashcard, MultipleChoiceDifficulty, MultipleChoiceDrillsRequest, MultipleChoiceSpecimenContext, PracticeFlowState } from './types'

export const MULTIPLE_CHOICE_DIFFICULTY: MultipleChoiceDifficulty = 'Med.'

/** The card's skill-map entry for generation: its pattern plus the card and up to four tags. */
const cardSkillMap = (algorithm: string, card: { title: string; tags: string[] }): SkillMapNode[] => [{
  algorithm,
  skills: [card.title, ...card.tags.filter((tag) => tag !== 'skill-map').slice(0, 4)],
}]

/** What MCQ generation needs to know about the recall card it starts from. */
export function cardSpecimen(card: Flashcard, prompt: string, target: string): MultipleChoiceSpecimenContext {
  const patternTag = getPrimaryPatternTag(card.tags)
  return {
    cardId: card.id,
    cardTitle: card.title,
    algorithm: patternTag ? patternLabelFromSlug(patternTag) : card.title,
    prompt,
    target,
    tags: card.tags,
  }
}

/** A standalone MCQ set about one card. */
export function multipleChoiceDeckRequest(
  specimen: MultipleChoiceSpecimenContext,
  { count, flowMode, llmProvider }: { count: number; flowMode: McqFlowMode; llmProvider: string },
): MultipleChoiceDrillsRequest {
  return {
    questionType: `skill-map-mcq:card:${flowMode}`,
    count,
    skillMap: cardSkillMap(specimen.algorithm, { title: specimen.cardTitle, tags: specimen.tags }),
    difficulty: MULTIPLE_CHOICE_DIFFICULTY,
    sourceMode: 'card',
    flowMode,
    specimen,
    llmProvider,
  }
}

/** The single MCQ a flow asks for, aimed at the lines missed on the last recall. */
export function flowMultipleChoiceRequest({
  flow,
  card,
  prompt,
  target,
  context,
  llmProvider,
}: {
  flow: PracticeFlowState
  card: Flashcard
  prompt: string
  target: string
  context: FlowGenerationContext
  llmProvider: string
}): MultipleChoiceDrillsRequest {
  const patternTag = getPrimaryPatternTag(card.tags)
  const algorithm = (patternTag ? patternLabelFromSlug(patternTag) : card.title) || 'Algorithm'
  return {
    questionType: `skill-map-mcq:card:progressive:flow-${flow.runId}-step-${flow.step}`,
    count: 1,
    skillMap: cardSkillMap(algorithm, card),
    difficulty: context.phase === 'challenge' || context.phase === 'mastered' ? 'Hard' : MULTIPLE_CHOICE_DIFFICULTY,
    sourceMode: 'card',
    flowMode: 'progressive',
    specimen: {
      cardId: card.id,
      cardTitle: card.title,
      algorithm,
      prompt,
      target,
      tags: card.tags,
      focus: {
        sequenceStage: 'multiple-choice',
        focusSummary: flow.focus.focusSummary,
        missedLines: flow.focus.missedLines,
        ...context,
      },
    },
    llmProvider,
  }
}
