import { useState } from 'react'

export type McqPreview = {
  pattern: string
  skill: string
  score: number
  raw: string
  drill: unknown
  nextProbe?: string
  jev?: JevResult | null
}

export type JevFeedback = { question: string; id?: string | null; rating?: string; note?: string; signal?: string; score: number }
export type AnswerSignal = { kind: string; label: string; confidence: number; ambiguity: number; probabilities: Record<string, number> }
export type JevResult = { model: string; score: number; scores: Record<string, number>; feedback?: JevFeedback[]; answerSignal?: AnswerSignal | null }

export type McqAnswer = {
  candidateId: string
  caseIndex: number
  choiceId: string
  choiceText: string
  correctChoiceId: string
  correct: boolean
  createdAt: string
  jev?: JevResult
}

type McqDrill = {
  title?: string
  difficulty?: string
  question: string
  choices: { id: string; text: string }[]
  correctChoiceId: string
  explanation: string
}

const isDrill = (value: unknown): value is McqDrill => {
  if (!value || typeof value !== 'object') return false
  const drill = value as Record<string, unknown>
  return typeof drill.question === 'string'
    && Array.isArray(drill.choices)
    && drill.choices.length === 4
    && drill.choices.every((choice: unknown) => {
      if (!choice || typeof choice !== 'object') return false
      const item = choice as Record<string, unknown>
      return typeof item.id === 'string' && typeof item.text === 'string'
    })
    && typeof drill.correctChoiceId === 'string'
    && typeof drill.explanation === 'string'
}

function FormattedText({ text }: { text: string }) {
  return <>{text.split(/(```[\s\S]*?```)/g).map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const body = part.slice(3, -3).replace(/^[^\n]*\n/, '')
      return <pre className="evolve-mcq-code" key={index}><code>{body}</code></pre>
    }
    return <span key={index} className="evolve-mcq-text">{part.split(/(`[^`]+`)/g).map((piece, inner) =>
      piece.startsWith('`') && piece.endsWith('`') && piece.length > 2
        ? <code key={inner} className="multiple-choice-inline-code">{piece.slice(1, -1)}</code>
        : <span key={inner}>{piece}</span>,
    )}</span>
  })}</>
}

type AnswerProps = {
  preview: McqPreview
  caseIndex: number
  answer?: McqAnswer
  jevReady: boolean
  answerEnabled: boolean
  answerHint: string
  onAnswer: (caseIndex: number, choiceId: string) => Promise<void>
}

function EvolveQuestion({ preview, caseIndex, answer, jevReady, answerEnabled, answerHint, onAnswer }: AnswerProps) {
  const [selected, setSelected] = useState(answer?.choiceId ?? '')
  const [submitted, setSubmitted] = useState(Boolean(answer))
  const [saving, setSaving] = useState(false)
  const [answerError, setAnswerError] = useState('')
  const drill = isDrill(preview.drill) ? preview.drill : null

  if (!drill) return <>
    <div className="evolve-mcq-invalid">
      <strong>The model did not return a complete MCQ.</strong>
      <p>Its response is shown below so you can inspect what this prompt produced.</p>
      <pre>{preview.raw || '(empty response)'}</pre>
    </div>
  </>

  const correct = (answer?.choiceId ?? selected) === drill.correctChoiceId
  const checkAnswer = () => {
    if (!selected || saving || answer) return
    setSubmitted(true)
    setSaving(true)
    setAnswerError('')
    void onAnswer(caseIndex, selected)
      .catch((cause) => setAnswerError(cause instanceof Error ? cause.message : 'Could not save this answer.'))
      .finally(() => setSaving(false))
  }
  return <><div className="evolve-mcq-exercise">
    <div className="evolve-mcq-question-pane">
      <span className="prompt-section-label">Question</span>
      {drill.title && <h3>{drill.title}</h3>}
      <div className="evolve-mcq-question"><FormattedText text={drill.question} /></div>
      <div className="evolve-mcq-question-meta"><span>{preview.pattern}</span><span>{drill.difficulty || 'MCQ'}</span></div>
    </div>
    <div className="evolve-mcq-answer-pane">
      <span className="prompt-section-label">Choose one answer</span>
      <div className="evolve-mcq-options" role="radiogroup" aria-label="Answer choices">
        {drill.choices.map((choice) => {
          const result = submitted && choice.id === drill.correctChoiceId ? ' correct'
            : submitted && choice.id === selected ? ' incorrect' : ''
          return <button type="button" key={choice.id}
            className={`evolve-mcq-option${selected === choice.id ? ' selected' : ''}${result}`}
            role="radio" aria-checked={selected === choice.id}
            disabled={submitted}
            onClick={() => setSelected(choice.id)}>
            <span className="evolve-mcq-option-id">{choice.id}</span>
            <span className="evolve-mcq-option-text"><FormattedText text={choice.text} /></span>
          </button>
        })}
      </div>
      {submitted ? <div className={`evolve-mcq-feedback ${correct ? 'correct' : 'incorrect'}`} role="status">
        <strong>{correct ? '✓ Correct' : `↗ ${selected ? 'Not quite' : 'Answer shown'}`}</strong>
        <div><FormattedText text={drill.explanation} /></div>
      </div> : <div className="evolve-mcq-actions">
        <button type="button" className="evolve-primary-button" disabled={!selected || !answerEnabled} onClick={checkAnswer}>Check answer <span aria-hidden="true">↗</span></button>
      </div>}
      {!jevReady && <p className="evolve-answer-hint">Set TYPESAFE_API_KEY on the Evolve service to enable answer-guided evolution.</p>}
      {jevReady && !answerEnabled && !submitted && <p className="evolve-answer-hint">{answerHint}</p>}
      {saving && <p className="evolve-answer-hint" role="status">Saving your answer…</p>}
      {answerError && <div className="evolve-answer-error" role="alert"><p>{answerError}</p>
        <button type="button" className="evolve-text-button" onClick={checkAnswer}>Retry saving</button></div>}
      {answer && <p className="evolve-answer-hint" role="status">Answer recorded. OpenEvolve will propose the next question probe.</p>}
    </div>
  </div></>
}

export default function EvolveMcqPreview({ previews, answers, jevReady, answerEnabled, answerHint, onAnswer }: {
  previews: McqPreview[]
  answers: McqAnswer[]
  jevReady: boolean
  answerEnabled: boolean
  answerHint: string
  onAnswer: (caseIndex: number, choiceId: string) => Promise<void>
}) {
  const [index, setIndex] = useState(0)
  if (previews.length === 0) return null
  const active = previews[Math.min(index, previews.length - 1)]
  return <>
    <div className="evolve-mcq-cases" role="tablist" aria-label="Evaluation cases">
      {previews.map((preview, caseIndex) => <button type="button" role="tab"
        aria-selected={index === caseIndex} key={`${preview.pattern}-${caseIndex}`}
        className={index === caseIndex ? 'selected' : ''} onClick={() => setIndex(caseIndex)}>
        <span>{String(caseIndex + 1).padStart(2, '0')}</span>{preview.pattern}
      </button>)}
    </div>
    <EvolveQuestion key={index} preview={active} caseIndex={index}
      answer={answers.find((item) => item.caseIndex === index)} jevReady={jevReady}
      answerEnabled={answerEnabled} answerHint={answerHint} onAnswer={onAnswer} />
  </>
}
