import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { api, unwrap } from '../../api/client'
import { CARD_MOVE_DOUBLE_TAP_WINDOW_MS, type CoachSessionPlan, type Flashcard } from '../types'

/**
 * A pass through a deck: which card is showing, which were answered and how, and when the
 * pass is finished. Cmd/Ctrl + a double-tapped arrow key moves between cards.
 */
export function usePracticeSession({ disabled, onMove }: { disabled: boolean; onMove: () => void }) {
  const [order, setOrder] = useState<number[]>([])
  const [position, setPosition] = useState(0)
  const [finished, setFinished] = useState(false)
  const [results, setResults] = useState<Record<string, boolean>>({})
  const [elapsedByCard, setElapsedByCard] = useState<Record<string, number>>({})
  const lastMoveKey = useRef<{ key: string; pressedAt: number } | null>(null)

  const canGoNext = !disabled && position < order.length - 1
  const canGoPrev = !disabled && position > 0

  const start = (deckLength: number) => {
    setOrder(Array.from({ length: deckLength }, (_, index) => index))
    setPosition(0)
    setFinished(false)
    setResults({})
    setElapsedByCard({})
  }

  /** Record a graded card; the pass finishes once every card has a result. */
  const complete = (cardId: string, correct: boolean, elapsedMs?: number) => {
    if (!cardId) return
    setResults((previous) => {
      const next = { ...previous, [cardId]: correct }
      if (Object.keys(next).length >= order.length) setFinished(true)
      return next
    })
    if (elapsedMs !== undefined) setElapsedByCard((previous) => ({ ...previous, [cardId]: elapsedMs }))
  }

  const next = () => {
    if (disabled || finished) return
    onMove()
    setPosition((current) => Math.min(current + 1, Math.max(order.length - 1, 0)))
  }

  const prev = () => {
    if (disabled) return
    onMove()
    setPosition((current) => Math.max(current - 1, 0))
  }

  const moveFromKey = useEffectEvent((key: string) => {
    if (key === 'ArrowLeft' && canGoPrev) prev()
    if (key === 'ArrowRight' && canGoNext) next()
  })

  useEffect(() => {
    if (disabled) return
    const handler = (event: KeyboardEvent) => {
      if (
        event.repeat
        || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
        || (!event.metaKey && !event.ctrlKey)
        || event.altKey
        || event.shiftKey
      ) return
      event.preventDefault()
      const now = performance.now()
      const previous = lastMoveKey.current
      const doubleTapped = previous?.key === event.key && now - previous.pressedAt <= CARD_MOVE_DOUBLE_TAP_WINDOW_MS
      lastMoveKey.current = doubleTapped ? null : { key: event.key, pressedAt: now }
      if (!doubleTapped) return
      moveFromKey(event.key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [disabled])

  return {
    position,
    total: order.length,
    currentIndex: order[position] ?? 0,
    finished,
    results,
    elapsedByCard,
    attempts: Object.keys(results).length,
    correctCount: Object.values(results).filter(Boolean).length,
    canGoNext,
    canGoPrev,
    hasResult: (cardId: string) => Boolean(cardId && Object.prototype.hasOwnProperty.call(results, cardId)),
    start,
    complete,
    next,
    prev,
  }
}

export type PracticeSession = ReturnType<typeof usePracticeSession>

/** The coach's plan for the next session, requested once when a recall pass finishes. */
export function useSessionPlan({
  session,
  enabled,
  deck,
  questionType,
  llmProvider,
}: {
  session: PracticeSession
  enabled: boolean
  deck: Flashcard[]
  questionType: string
  llmProvider: string
}) {
  const [plan, setPlan] = useState<CoachSessionPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requested = useRef(false)

  const reset = () => {
    requested.current = false
    setPlan(null)
    setLoading(false)
    setError('')
  }

  const request = async () => {
    if (requested.current) return
    requested.current = true
    setLoading(true)
    setError('')
    const { results, elapsedByCard, attempts, correctCount } = session
    try {
      const weakestCards = Object.entries(results)
        .filter(([, successful]) => !successful)
        .map(([cardId]) => ({
          cardId,
          cardTitle: deck.find((item) => item.id === cardId)?.title ?? '',
          elapsedMs: elapsedByCard[cardId] ?? 0,
        }))
        .slice(0, 5)
      const totalElapsed = Object.values(elapsedByCard).reduce((sum, value) => sum + value, 0)
      const result = await api.POST('/api/coach/session-plan', {
        body: {
          mode: 'main-recall',
          questionType,
          attempts,
          correctCount,
          avgElapsedMs: attempts > 0 ? Math.round(totalElapsed / attempts) : 0,
          weakestCards,
          llmProvider,
        },
      })
      setPlan(unwrap(result, 'Unable to load coach session plan') as unknown as CoachSessionPlan)
    } catch {
      setError('Coach session plan unavailable right now.')
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }

  const requestWhenFinished = useEffectEvent(() => void request())
  useEffect(() => {
    if (session.finished && enabled) requestWhenFinished()
  }, [enabled, session.finished])

  return { plan, loading, error, reset }
}
