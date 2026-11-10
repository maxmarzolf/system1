import { buildInlineTaskProgression, buildPracticePrompt, normalizeInlineTemplateTarget, normalizeTyping, stripHashAnnotationComments, stripInlineAnnotationNotes } from './inlineNotes'
import { getPrimaryPatternTag } from './patterns'
import type { Flashcard, InlineLens } from './types'

/** The recall target is always the full algorithm, annotated with pattern-lens notes when Inline is on. */
export const RECALL_TARGET_MODE = 'algorithm' as const
export const INLINE_LENS: InlineLens = 'pattern'

export type PracticeTargets = {
  primaryPatternTag: string
  /** What the learner types: the algorithm with annotations stripped. */
  practiceTarget: string
  /** The Inline helper's per-line tasks for ``practiceTarget``. */
  inlineTaskProgression: ReturnType<typeof buildInlineTaskProgression>
  practicePrompt: string
}

const fillMissing = (template: string, card: Flashcard) => template.replace('{{missing}}', card.missing)

/** Everything a recall card asks for, derived from the card alone. */
export function derivePracticeTargets(card: Flashcard): PracticeTargets {
  const primaryPatternTag = getPrimaryPatternTag(card.tags)
  const generatedAlgorithm = card.templateTargets?.algorithm?.trim()
  const algorithmTarget = normalizeTyping(fillMissing(generatedAlgorithm || card.solution, card))
  const generatedInline = card.templateTargets?.inline?.trim()
  const inlineTarget = normalizeInlineTemplateTarget(
    generatedInline ? fillMissing(generatedInline, card) : algorithmTarget,
    primaryPatternTag,
    INLINE_LENS,
  )
  const practiceTarget = normalizeTyping(stripHashAnnotationComments(stripInlineAnnotationNotes(algorithmTarget)))
  const generatedPrompt = card.templatePrompts?.algorithm?.trim() || card.prompt.trim()
  return {
    primaryPatternTag,
    practiceTarget,
    inlineTaskProgression: buildInlineTaskProgression(practiceTarget, inlineTarget),
    practicePrompt: generatedPrompt || buildPracticePrompt(RECALL_TARGET_MODE, primaryPatternTag),
  }
}
