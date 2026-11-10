import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL } from './api/client'

type LiveAiCoachProps = {
  cardId: string
  cardTitle: string
  prompt: string
  referenceAnswer: string
  code: string
  language: string
  phase: 'typing' | 'submitted'
  feedback: object | null
  recentAttempts: object[]
  onFeedbackShown: () => void
}

type Observation = Omit<LiveAiCoachProps, 'onFeedbackShown'> & { sequence: number }

const liveCoachUrl = () => {
  const url = new URL(`${API_BASE_URL}/api/coach/live-coaching`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export default function LiveAiCoach({
  cardId, cardTitle, prompt, referenceAnswer, code, language, phase,
  feedback, recentAttempts, onFeedbackShown,
}: LiveAiCoachProps) {
  const socketRef = useRef<WebSocket | null>(null)
  const latestObservationRef = useRef<Observation | null>(null)
  const sequenceRef = useRef(0)
  const displayedSequenceRef = useRef(0)
  const responseTimeoutRef = useRef<number | null>(null)
  const lastErrorRef = useRef('')
  const onFeedbackShownRef = useRef(onFeedbackShown)
  const phaseRef = useRef(phase)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('Connecting to live coach…')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    onFeedbackShownRef.current = onFeedbackShown
    phaseRef.current = phase
  }, [onFeedbackShown, phase])

  useEffect(() => {
    const observation: Observation = {
      sequence: ++sequenceRef.current,
      cardId,
      cardTitle: cardTitle.slice(0, 200),
      prompt: prompt.slice(0, 3000),
      referenceAnswer: referenceAnswer.slice(0, 12000),
      code: code.slice(0, 12000),
      language,
      phase,
      feedback,
      recentAttempts: recentAttempts.slice(-5),
    }
    latestObservationRef.current = observation
    const timer = window.setTimeout(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        setStatus('Thinking about your next move…')
        socketRef.current.send(JSON.stringify(observation))
        if (responseTimeoutRef.current === null) {
          responseTimeoutRef.current = window.setTimeout(() => {
            responseTimeoutRef.current = null
            lastErrorRef.current = 'The live coach took too long to respond.'
            socketRef.current?.close(4000, 'Coaching response timed out')
          }, 30000)
        }
      }
    }, phase === 'submitted' ? 0 : 900)
    return () => window.clearTimeout(timer)
  }, [cardId, cardTitle, prompt, referenceAnswer, code, language, phase, feedback, recentAttempts])

  useEffect(() => {
    let stopped = false
    const socket = new WebSocket(liveCoachUrl())
    socketRef.current = socket
    socket.onopen = () => {
      setStatus('Thinking about your next move…')
      if (latestObservationRef.current) {
        socket.send(JSON.stringify(latestObservationRef.current))
        responseTimeoutRef.current = window.setTimeout(() => {
          responseTimeoutRef.current = null
          lastErrorRef.current = 'The live coach took too long to respond.'
          socket.close(4000, 'Coaching response timed out')
        }, 30000)
      }
    }
    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { type: string; sequence?: number; message?: string }
        if (payload.type === 'error') {
          lastErrorRef.current = payload.message ?? 'Live coaching is unavailable right now.'
          setStatus(lastErrorRef.current)
        } else if (payload.type === 'feedback'
          && typeof payload.message === 'string'
          && typeof payload.sequence === 'number'
          && payload.sequence > displayedSequenceRef.current) {
          displayedSequenceRef.current = payload.sequence
          setMessage(payload.message)
          const upToDate = payload.sequence >= (latestObservationRef.current?.sequence ?? 0)
          setStatus(upToDate ? '' : 'Updating guidance…')
          if (upToDate && responseTimeoutRef.current !== null) {
            window.clearTimeout(responseTimeoutRef.current)
            responseTimeoutRef.current = null
          }
          lastErrorRef.current = ''
          if (phaseRef.current === 'typing') onFeedbackShownRef.current()
        }
      } catch {
        setStatus('Live coaching sent an unreadable update.')
      }
    }
    socket.onclose = (event) => {
      if (responseTimeoutRef.current !== null) {
        window.clearTimeout(responseTimeoutRef.current)
        responseTimeoutRef.current = null
      }
      if (stopped) return
      socketRef.current = null
      if (event.code !== 1008 && retry < 2) {
        setStatus('Reconnecting to live coach…')
        window.setTimeout(() => {
          if (!stopped) setRetry((value) => value + 1)
        }, 1500)
      } else if (event.code !== 1008) {
        setStatus(lastErrorRef.current || 'Live coaching connection was interrupted.')
      }
    }
    return () => {
      stopped = true
      socketRef.current = null
      if (responseTimeoutRef.current !== null) {
        window.clearTimeout(responseTimeoutRef.current)
        responseTimeoutRef.current = null
      }
      socket.close()
    }
  }, [cardId, retry])

  return <div className="live-ai-coach" role="status" aria-live="polite">
    <span className="live-ai-coach-label">AI coach</span>
    {message && <p>{message}</p>}
    {status && <span className="live-ai-coach-status">{status}</span>}
  </div>
}
