import { errorMessage } from '@/api/client'
import { useHistorySubmissions } from '@/api/queries'
import { formatCalendarDate, formatLongCalendarDate } from '@/shared/lib/dailyWork'
import ModelCallDetails from './ModelCallDetails'
import SubmissionSignalDetails from './SubmissionSignalDetails'
import { modalityLabel } from '@/shared/modality'

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
  /** The calendar day it was submitted on (viewer's time zone). */
  date?: string
  evaluation: Record<string, unknown>
  /** The LLM exchanges that generated the MCQ; empty for other modalities and older questions. */
  generationTrace?: Record<string, unknown>[]
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

function SubmissionCard({ submission, showDate }: { submission: HistorySubmission; showDate: boolean }) {
  const score = overallScore(submission.evaluation)
  // Collapsed by default: the summary line (result, type, time, score, title) opens to the details.
  return (
    <details className={`history-day-submission${submission.successful ? '' : ' history-day-submission-missed'}`}>
      <summary className="history-day-submission-summary">
      <span className="history-day-submission-header">
        <span className={`history-day-result${submission.successful ? ' history-day-result-pass' : ' history-day-result-fail'}`}>
          {submission.successful ? '✓ Correct' : '✗ Missed'}
        </span>
        <span className="history-day-badge">{modalityLabel(submission.modality)}</span>
        {submission.algorithms.map((algorithm) => (
          <span key={algorithm.slug} className="history-day-badge history-day-badge-dim">{algorithm.algorithm}</span>
        ))}
        <span className="history-day-meta">
          {submission.createdAt ? (
            <time dateTime={submission.createdAt}>
              {showDate && submission.date ? `${formatCalendarDate(submission.date)} · ` : ''}{timeFormatter.format(new Date(submission.createdAt))}
            </time>
          ) : null}
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
        <details className="history-day-signals">
          <summary>Model calls</summary>
          <ModelCallDetails generationTrace={submission.generationTrace} evaluation={submission.evaluation} />
        </details>
      </div>
    </details>
  )
}

const nameList = (slugs: string[], names: Record<string, string>) => slugs.map((slug) => names[slug] ?? slug).join(', ')

/**
 * The submissions behind the daily work selection: a day (optionally narrowed to some
 * algorithms), or some algorithms across the last year. A subsection of the Daily Work History.
 */
export default function SubmissionDetail({
  date,
  algorithms,
  algorithmNames,
}: {
  date: string | null
  algorithms: string[]
  algorithmNames: Record<string, string>
}) {
  const query = useHistorySubmissions(date, algorithms)
  const active = Boolean(date) || algorithms.length > 0
  const error = active && query.error ? errorMessage(query.error, 'Unable to load submissions') : ''
  // While the next selection loads, the previous results stay (dimmed) so the card keeps its size.
  const loaded = active && !error ? query.data ?? null : null
  const updating = Boolean(loaded) && query.isPlaceholderData
  const submissions = (loaded?.submissions ?? []) as HistorySubmission[]
  const correct = submissions.filter((submission) => submission.successful).length
  const heading = date ? formatLongCalendarDate(date) : algorithms.length ? nameList(algorithms, algorithmNames) : ''

  return (
    <div className={`submission-detail history-day${updating ? ' submission-detail-updating' : ''}`} aria-label="Submission detail"
      aria-busy={Boolean(active && (!loaded || updating) && !error)}>
      <div className="submission-detail-header">
        <p className="section-eyebrow">Submission Detail</p>
        {heading ? <h3 className="history-day-heading">{heading}</h3> : null}
        {loaded ? (
          <p className="history-day-summary">
            {submissions.length} submission{submissions.length === 1 ? '' : 's'} · {correct} correct
            {date && algorithms.length ? ` · ${nameList(algorithms, algorithmNames)} only` : ''}
            {!date ? ' · last year' : ''}
          </p>
        ) : null}
      </div>
      {!active ? <p className="section-meta">Select a day on the grid, or algorithms under it, to see their submissions.</p> : null}
      {error ? <p className="coach-error" role="alert">{error}</p> : null}
      {active && !loaded && !error ? <p className="section-meta">Loading submissions…</p> : null}
      {loaded && !submissions.length ? (
        <p className="section-meta">
          {date && algorithms.length ? `No ${nameList(algorithms, algorithmNames)} submissions on this day.` : date ? 'No submissions recorded on this day.' : 'No submissions in the last year.'}
        </p>
      ) : null}
      {loaded && submissions.length ? (
        <div className="history-day-list">
          {submissions.map((submission) => <SubmissionCard key={submission.id} submission={submission} showDate={!date} />)}
        </div>
      ) : null}
    </div>
  )
}
