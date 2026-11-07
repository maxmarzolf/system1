import { useEffect, useState } from 'react'
import { apiUrl } from './api'
import { formatLongCalendarDate, viewerTimeZone } from './dailyWork'
import SubmissionSignalDetails from './SubmissionSignalDetails'

type HistoryChoice = { id: string; text: string; correct: boolean }

export type HistorySubmission = {
  id: number
  createdAt: string
  modality: string
  title: string
  question: string
  choices: HistoryChoice[]
  userAnswer: string
  correctAnswer: string
  successful: boolean
  elapsedMs: number
  algorithms: { slug: string; algorithm: string }[]
  evaluation: Record<string, unknown>
}

type HistoryDay = { date: string; submissions: HistorySubmission[] }

const MODALITY_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  'total-recall': 'Total recall',
  'ghost-rep': 'Ghost rep',
  microdrill: 'Microdrill',
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

const formatElapsed = (elapsedMs: number) => {
  if (!elapsedMs) return ''
  const seconds = Math.round(elapsedMs / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const overallScore = (evaluation: Record<string, unknown>) => {
  const score = evaluation.score
  const overall = score && typeof score === 'object' ? (score as Record<string, unknown>).overall : undefined
  return typeof overall === 'number' ? overall : null
}

/** Question text with ``` fenced code shown as code blocks. */
function QuestionText({ text }: { text: string }) {
  const parts = text.split(/```(?:[a-zA-Z0-9_-]+)?\n?/)
  return (
    <div className="history-day-question">
      {parts.map((part, index) => {
        const trimmed = part.replace(/\n+$/, '')
        if (!trimmed.trim()) return null
        return index % 2 === 1
          ? <pre key={index} className="history-day-code"><code>{trimmed}</code></pre>
          : <p key={index}>{trimmed}</p>
      })}
    </div>
  )
}

function SubmissionAnswer({ submission }: { submission: HistorySubmission }) {
  if (submission.choices.length) {
    const selectedId = submission.userAnswer.split('.')[0]?.trim()
    return (
      <ol className="history-day-choices" aria-label="Choices">
        {submission.choices.map((choice) => {
          const selected = choice.id === selectedId
          const className = [
            'history-day-choice',
            choice.correct ? 'history-day-choice-correct' : '',
            selected ? 'history-day-choice-selected' : '',
            selected && !choice.correct ? 'history-day-choice-wrong' : '',
          ].filter(Boolean).join(' ')
          return (
            <li key={choice.id} className={className}>
              <span className="history-day-choice-id">{choice.id}</span>
              <span className="history-day-choice-text">{choice.text}</span>
              <span className="history-day-choice-tags">
                {selected ? <span>Chosen</span> : null}
                {choice.correct ? <span>Correct</span> : null}
              </span>
            </li>
          )
        })}
      </ol>
    )
  }
  return (
    <div className="history-day-recall">
      <details>
        <summary>Answer</summary>
        <pre className="history-day-code"><code>{submission.userAnswer || '(empty)'}</code></pre>
      </details>
      {submission.correctAnswer ? (
        <details>
          <summary>Expected</summary>
          <pre className="history-day-code"><code>{submission.correctAnswer}</code></pre>
        </details>
      ) : null}
    </div>
  )
}

function SubmissionCard({ submission }: { submission: HistorySubmission }) {
  const score = overallScore(submission.evaluation)
  // Collapsed by default: the summary line (result, type, time, score, title) opens to the details.
  return (
    <details className={`history-day-submission${submission.successful ? '' : ' history-day-submission-missed'}`}>
      <summary className="history-day-submission-summary">
      <span className="history-day-submission-header">
        <span className={`history-day-result${submission.successful ? ' history-day-result-pass' : ' history-day-result-fail'}`}>
          {submission.successful ? '✓ Correct' : '✗ Missed'}
        </span>
        <span className="history-day-badge">{MODALITY_LABELS[submission.modality] ?? submission.modality}</span>
        {submission.algorithms.map((algorithm) => (
          <span key={algorithm.slug} className="history-day-badge history-day-badge-dim">{algorithm.algorithm}</span>
        ))}
        <span className="history-day-meta">
          {submission.createdAt ? <time dateTime={submission.createdAt}>{timeFormatter.format(new Date(submission.createdAt))}</time> : null}
          {formatElapsed(submission.elapsedMs) ? <span>{formatElapsed(submission.elapsedMs)}</span> : null}
          {score !== null ? <span>score {score.toFixed(1)}</span> : null}
        </span>
      </span>
      {submission.title ? <span className="history-day-title">{submission.title}</span> : null}
      </summary>
      <div className="history-day-submission-body">
        {submission.question ? <QuestionText text={submission.question} /> : null}
        <SubmissionAnswer submission={submission} />
        <details className="history-day-signals" open>
          <summary>Signals</summary>
          <SubmissionSignalDetails evaluation={submission.evaluation} />
        </details>
      </div>
    </details>
  )
}

export default function HistoryDayDetail({
  date,
  algorithmFilter,
  algorithmNames,
}: {
  date: string | null
  /** Algorithm slug to show; '' shows every algorithm. Set from the grid's algorithm labels. */
  algorithmFilter: string
  algorithmNames: Record<string, string>
}) {
  const [day, setDay] = useState<HistoryDay | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!date) return
    const controller = new AbortController()
    fetch(apiUrl(`/api/history/day?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(viewerTimeZone())}`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load this day (${response.status})`)
        setDay((await response.json()) as HistoryDay)
        setError('')
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load this day')
      })
    return () => controller.abort()
  }, [date])

  const loaded = day && day.date === date ? day : null
  const submissions = (loaded?.submissions ?? []).filter(
    (submission) => !algorithmFilter || submission.algorithms.some((algorithm) => algorithm.slug === algorithmFilter),
  )
  const correct = submissions.filter((submission) => submission.successful).length

  return (
    <section className="daily-work-history history-day" aria-label="Work completed on the selected day" aria-busy={Boolean(date && !loaded && !error)}>
      <div className="daily-work-history-header">
        <div>
          <p className="dashboard-activity-eyebrow">Day Detail</p>
          {date ? <h3 className="history-day-heading">{formatLongCalendarDate(date)}</h3> : null}
          {loaded ? (
            <p className="history-day-summary">
              {submissions.length} submission{submissions.length === 1 ? '' : 's'} · {correct} correct
              {algorithmFilter ? ` · ${algorithmNames[algorithmFilter] ?? algorithmFilter} only` : ''}
            </p>
          ) : null}
        </div>
      </div>
      {!date ? <p className="dashboard-mode-meta">Select a date on the grid, or a highlighted square, to see the work completed that day.</p> : null}
      {error ? <p className="coach-error" role="alert">{error}</p> : null}
      {date && !loaded && !error ? <p className="dashboard-mode-meta">Loading the day&rsquo;s work…</p> : null}
      {loaded && !loaded.submissions.length ? <p className="dashboard-mode-meta">No submissions recorded on this day.</p> : null}
      {loaded && loaded.submissions.length && !submissions.length ? (
        <p className="dashboard-mode-meta">
          No {algorithmNames[algorithmFilter] ?? algorithmFilter} submissions on this day.
        </p>
      ) : null}
      {loaded ? (
        <div className="history-day-list">
          {submissions.map((submission) => <SubmissionCard key={submission.id} submission={submission} />)}
        </div>
      ) : null}
    </section>
  )
}
