import { useState } from 'react'
import type { Evaluation, SubmitResponse } from '@/shared/evaluation/evaluation'
import { submissionFailureMessage } from '@/features/practice/submission/submission'
import type { MultipleChoiceCard, MultipleChoiceChoice } from '@/features/practice/lib/types'

/**
 * Answering multiple-choice cards: the selected choice, when the card was shown, and the server's
 * grade for each submitted card (the browser never decides correctness). The page keeps one of
 * these for a standalone MCQ session and one for a flow's MCQ stage.
 */
export function useMultipleChoiceAttempt() {
  const [selectedChoiceId, setSelectedChoiceId] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [submittedByCard, setSubmittedByCard] = useState<Record<string, string>>({})
  const [resultByCard, setResultByCard] = useState<Record<string, SubmitResponse>>({})
  const [grading, setGrading] = useState(false)
  const [submitError, setSubmitError] = useState('')

  /** A new card is showing: nothing selected, and its clock starts now. */
  const resetCard = () => {
    setSelectedChoiceId('')
    setStartedAt(Date.now())
  }

  /** A new set of cards: forget what was submitted. */
  const resetAll = (clockStarted: boolean) => {
    setSelectedChoiceId('')
    setStartedAt(clockStarted ? Date.now() : null)
    setSubmittedByCard({})
    setSubmitError('')
  }

  /**
   * Grade the selected choice for ``card``. ``save`` posts the attempt; on success the grade is kept
   * and ``onGraded`` runs, otherwise the server's reason is shown.
   */
  const submit = async (
    card: MultipleChoiceCard,
    save: (choice: MultipleChoiceChoice, elapsedMs: number) => Promise<SubmitResponse | null>,
    onGraded: (saved: SubmitResponse, elapsedMs: number) => void,
  ) => {
    if (grading || !selectedChoiceId) return
    const choice = card.choices.find((candidate) => candidate.id === selectedChoiceId)
    if (!choice) return
    const elapsedMs = Math.max(Date.now() - (startedAt ?? Date.now()), 1)
    setGrading(true)
    setSubmitError('')
    let failure: unknown = null
    const saved = await save(choice, elapsedMs).catch((error: unknown) => {
      failure = error
      return null
    })
    setGrading(false)
    if (!saved?.saved) {
      setSubmitError(submissionFailureMessage(failure))
      return
    }
    setResultByCard((previous) => ({ ...previous, [card.id]: saved }))
    setSubmittedByCard((previous) => ({ ...previous, [card.id]: choice.id }))
    onGraded(saved, elapsedMs)
  }

  /** How ``card`` stands: what is selected, what was submitted, whether it was right, and Jev's evaluation. */
  const viewOf = (card: MultipleChoiceCard | null) => {
    const submittedChoiceId = card ? submittedByCard[card.id] ?? '' : ''
    return {
      selectedChoice: card?.choices.find((choice) => choice.id === selectedChoiceId) ?? null,
      submittedChoiceId,
      submitted: Boolean(submittedChoiceId),
      correct: Boolean(submittedChoiceId && card && resultByCard[card.id]?.successful),
      evaluation: (submittedChoiceId && card ? resultByCard[card.id]?.evaluation : null) ?? null as Evaluation | null,
    }
  }

  return { selectedChoiceId, select: setSelectedChoiceId, grading, submitError, resetCard, resetAll, submit, viewOf }
}

export type MultipleChoiceAttempt = ReturnType<typeof useMultipleChoiceAttempt>
