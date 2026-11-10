import { normalizeTyping, stripHashAnnotationComments, stripInlineAnnotationNotes } from './inlineNotes'
import type { Flashcard, LineReview, LineReviewStatus, MultipleChoiceSpecimenFocus, MultipleChoiceSpecimenFocusLine, RecallAttemptSnapshot, SupportLayer } from './types'

export const isPlaceholderLine = (line: string) => /\b(pass|something|todo|tbd)\b/i.test(line.trim())

export const createInteractionId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const summarizeRecallAttempt = (
  actualLines: string[],
  exact: boolean,
  elapsedMs: number,
  attemptNumber: number,
  supportLayer: SupportLayer
): RecallAttemptSnapshot => ({
  attemptNumber,
  exact,
  elapsedMs,
  supportLayer,
  usedPlaceholder: actualLines.some((line) => isPlaceholderLine(line)),
  hasGuard: actualLines.some((line) => /^\s*if\b/.test(line) && /not|visited|seen|< 0|>=/.test(line)),
  hasBookkeeping: actualLines.some((line) =>
    /(graph|visited|seen|indegree|parent|dist|rows|cols|queue|deque|stack|\bm\b|\bn\b|state|window)/i.test(line)
  ),
  hasTraversal: actualLines.some((line) => /\bdfs\b|\bbfs\b|queue|deque|stack/i.test(line)),
  hasLoop: actualLines.some((line) =>
    /^\s*(for|while)\b/.test(line)
  ),
})

export const computeLineReview = (expectedCode: string, actualCode: string) => {
  const expectedLines = expectedCode.replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd())
  const actualLines = actualCode.replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd())
  const maxLines = Math.max(expectedLines.length, actualLines.length, 1)
  const reviews: LineReview[] = []

  for (let i = 0; i < maxLines; i += 1) {
    const expected = expectedLines[i] ?? ''
    const actual = actualLines[i] ?? ''
    let status: LineReviewStatus = 'match'
    if (expected !== actual) {
      if (!actual && expected) status = 'missing'
      else if (actual && !expected) status = 'extra'
      else status = 'mismatch'
    }
    reviews.push({ lineNumber: i + 1, status, expected, actual })
  }

  return { reviews, actualStatuses: reviews.slice(0, actualLines.length).map((line) => line.status) }
}

export const summarizeFlowFocusLine = (line: MultipleChoiceSpecimenFocusLine) => {
  const source = line.expected.trim() || line.actual.trim() || `line ${line.lineNumber}`
  return source.length > 44 ? `${source.slice(0, 41).trimEnd()}...` : source
}

export const toMultipleChoiceFocusLines = (reviews: LineReview[]): MultipleChoiceSpecimenFocusLine[] => (
  reviews
    .filter((line): line is LineReview & { status: 'mismatch' | 'missing' | 'extra' } => line.status !== 'match')
    .filter((line) => line.expected.trim().length > 0 || line.actual.trim().length > 0)
    .map((line) => ({
      lineNumber: line.lineNumber,
      expected: line.expected,
      actual: line.actual,
      status: line.status,
    }))
)

export const buildFlowGhostTarget = (missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  const targetLines = missedLines
    .map((line) => line.expected)
    .filter((line) => line.trim().length > 0)

  return normalizeTyping(targetLines.join('\n'))
}

export const buildFlowGhostScaffold = (fullTarget: string, missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  const fullTargetLines = fullTarget.replace(/\r\n/g, '\n').split('\n')
  const missedLineNumbers = new Set(
    missedLines
      .filter((line) => line.expected.trim().length > 0)
      .map((line) => line.lineNumber)
  )

  return fullTargetLines
    .map((line, index) => {
      if (!missedLineNumbers.has(index + 1)) return line.trimEnd()
      const indentation = line.match(/^\s*/)?.[0] ?? ''
      return indentation
    })
    .join('\n')
}

export const extractFlowGhostFocusedInput = (fullInput: string, missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  const inputLines = fullInput.replace(/\r\n/g, '\n').split('\n')
  const focusedLineNumbers = missedLines
    .filter((line) => line.expected.trim().length > 0)
    .map((line) => line.lineNumber)
  if (focusedLineNumbers.length === 0) return normalizeTyping(fullInput)
  const focusedLines = focusedLineNumbers.map((lineNumber) => inputLines[lineNumber - 1] ?? '')

  return normalizeTyping(focusedLines.join('\n'))
}

export const firstIncompleteGhostLineNumber = (fullInput: string, missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  const inputLines = fullInput.replace(/\r\n/g, '\n').split('\n')
  return missedLines
    .filter((line) => line.expected.trim().length > 0)
    .map((line) => line.lineNumber)
    .find((lineNumber) => (inputLines[lineNumber - 1] ?? '').trim().length === 0) ?? null
}

export const nextGhostLineNumber = (
  currentLineNumber: number,
  fullInput: string,
  missedLines: MultipleChoiceSpecimenFocusLine[]
) => {
  const inputLines = fullInput.replace(/\r\n/g, '\n').split('\n')
  const targetLineNumbers = missedLines
    .filter((line) => line.expected.trim().length > 0)
    .map((line) => line.lineNumber)
  const nextAfterCurrent = targetLineNumbers.find((lineNumber) =>
    lineNumber > currentLineNumber && (inputLines[lineNumber - 1] ?? '').trim().length === 0
  )

  if (nextAfterCurrent) return nextAfterCurrent

  return targetLineNumbers.find((lineNumber) => (inputLines[lineNumber - 1] ?? '').trim().length === 0) ?? null
}

export const buildFlowFocusSummary = (cardTitle: string, missedLines: MultipleChoiceSpecimenFocusLine[]) => {
  if (missedLines.length === 0) {
    return `${cardTitle}: full recall was sound, so there is no targeted remediation slice right now.`
  }

  const preview = missedLines
    .slice(0, 2)
    .map((line) => summarizeFlowFocusLine(line))
    .join(' | ')

  return `${cardTitle}: target ${missedLines.length} drifted line${missedLines.length === 1 ? '' : 's'}${preview ? `, starting with ${preview}` : ''}.`
}

export const flowTargetForCard = (card: Flashcard) => {
  const generatedTarget = card.templateTargets?.algorithm?.trim()
  const resolvedTarget = (generatedTarget || card.solution).replace('{{missing}}', card.missing)
  return normalizeTyping(stripHashAnnotationComments(stripInlineAnnotationNotes(resolvedTarget)))
}

export const initialFlowFocus = (card: Flashcard): MultipleChoiceSpecimenFocus => {
  const target = flowTargetForCard(card)
  return {
    sequenceStage: 'recall',
    focusSummary: `Establish the core decisions in ${card.title}.`,
    missedLines: target.split('\n').flatMap((expected, index) => expected.trim()
      ? [{ lineNumber: index + 1, expected, actual: '', status: 'missing' as const }]
      : []),
  }
}

export const nextFlowAnchor = (deck: Flashcard[], currentCardId: string, completedAnchorIds: string[]) => {
  if (deck.length < 2) return null
  const currentIndex = Math.max(0, deck.findIndex((item) => item.id === currentCardId))
  const completed = new Set([...completedAnchorIds, currentCardId])
  for (let offset = 1; offset < deck.length; offset += 1) {
    const candidate = deck[(currentIndex + offset) % deck.length]
    if (!completed.has(candidate.id)) return candidate
  }
  return deck[(currentIndex + 1) % deck.length]
}
