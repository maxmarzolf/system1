import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './App.css'
import { flashcards as baseFlashcards } from './data/flashcards'
import { cardOptions as baseCardOptions } from './data/flashcard-options'
import { top150Flashcards } from './data/flashcards-top150'
import { top150CardOptions } from './data/flashcard-options-top150'

const flashcards = [...baseFlashcards, ...top150Flashcards]
const cardOptions: Record<string, { code: string; correct: boolean }[]> = { ...baseCardOptions, ...top150CardOptions }

type CheckState = 'correct' | 'incorrect' | null
type GameMode = 'multiple-choice' | 'full-solution' | 'typing-race'

/** Minimal Python logo SVG — high-contrast monochrome */
function PythonIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 110 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="vscode-tab-icon"
      aria-hidden="true"
    >
      <path
        d="M54.5 2C36.3 2 25 7.5 25 20.5v13h30v5H18C8.6 38.5 1 47.5 1 63.5c0 16 7.6 23 17 23h11v-16c0-10.5 8.8-19 19-19h30c9 0 16-7.3 16-16.5V20.5C94 8.2 83.2 2 54.5 2ZM39 13a5 5 0 110 10 5 5 0 010-10Z"
        fill="var(--hc-accent)"
        opacity="0.85"
      />
      <path
        d="M55.5 108C73.7 108 85 102.5 85 89.5v-13H55v-5h37c9.4 0 17-9 17-25s-7.6-23-17-23H81v16c0 10.5-8.8 19-19 19H32c-9 0-16 7.3-16 16.5v14.5C16 101.8 26.8 108 55.5 108ZM71 97a5 5 0 110-10 5 5 0 010 10Z"
        fill="var(--hc-accent)"
        opacity="0.55"
      />
    </svg>
  )
}

/** Diff/compare icon SVG — high-contrast monochrome */
function DiffIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="vscode-tab-icon"
      aria-hidden="true"
    >
      <path d="M3 1h4l5 5v9H3V1z" stroke="var(--hc-accent)" strokeWidth="1.2" opacity="0.6" />
      <path d="M5.5 7.5h5M8 5v5" stroke="var(--hc-accent)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
type QuestionType = 'tree' | 'stack' | 'top150'
type SolutionOption = {
  code: string
  correct: boolean
  full: string
}

const normalizeTyping = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd()

/**
 * Normalize indentation to PEP 8 (4-space) levels.
 * Detects the smallest indent unit used in the code and re-maps
 * every line so each indent level becomes exactly 4 spaces.
 */
function normalizePep8(code: string): string {
  const lines = code.split('\n')
  const indents: number[] = []
  for (const line of lines) {
    const match = line.match(/^( +)\S/)
    if (match) indents.push(match[1].length)
  }
  if (indents.length === 0) return code
  // Already PEP 8 if every indented line is a multiple of 4
  if (indents.every((n) => n % 4 === 0)) return code
  // Map each unique indent depth to a PEP 8 level (1, 2, 3…)
  const unique = [...new Set(indents)].sort((a, b) => a - b)
  const levelMap = new Map<number, number>()
  unique.forEach((indent, i) => levelMap.set(indent, i + 1))
  return lines
    .map((line) => {
      const match = line.match(/^( +)/)
      if (!match) return line
      const spaces = match[1].length
      const level = levelMap.get(spaces) ?? Math.round(spaces / unique[0])
      return '    '.repeat(level) + line.slice(spaces)
    })
    .join('\n')
}

type DiffSegment = { type: 'correct' | 'wrong' | 'missing' | 'extra'; text: string }
type DiffLine = {
  lineNum: number
  expectedNum: number | null
  segments: DiffSegment[]
  status: 'correct' | 'wrong' | 'missing' | 'extra'
}

function computeLineDiff(input: string, target: string): DiffLine[] {
  const inputLines = normalizeTyping(input).split('\n')
  const targetLines = normalizeTyping(target).split('\n')
  const maxLen = Math.max(inputLines.length, targetLines.length)
  const result: DiffLine[] = []

  for (let i = 0; i < maxLen; i++) {
    const got = inputLines[i]
    const expected = targetLines[i]

    if (got === undefined) {
      result.push({
        lineNum: i + 1,
        expectedNum: i + 1,
        segments: [{ type: 'missing', text: expected }],
        status: 'missing',
      })
    } else if (expected === undefined) {
      result.push({
        lineNum: i + 1,
        expectedNum: null,
        segments: [{ type: 'extra', text: got }],
        status: 'extra',
      })
    } else if (got === expected) {
      result.push({
        lineNum: i + 1,
        expectedNum: i + 1,
        segments: [{ type: 'correct', text: got }],
        status: 'correct',
      })
    } else {
      const segments: DiffSegment[] = []
      const mLen = Math.max(got.length, expected.length)
      let runType: DiffSegment['type'] | null = null
      let runText = ''
      for (let j = 0; j < mLen; j++) {
        const g = got[j]
        const e = expected[j]
        let segType: DiffSegment['type']
        if (g === undefined) segType = 'missing'
        else if (e === undefined) segType = 'extra'
        else if (g === e) segType = 'correct'
        else segType = 'wrong'
        if (segType === runType) {
          runText += g ?? e
        } else {
          if (runType !== null) segments.push({ type: runType, text: runText })
          runType = segType
          runText = g ?? e ?? ''
        }
      }
      if (runType !== null) segments.push({ type: runType, text: runText })
      result.push({ lineNum: i + 1, expectedNum: i + 1, segments, status: 'wrong' })
    }
  }
  return result
}

function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function App() {
  const [questionType, setQuestionType] = useState<QuestionType>('tree')
  const [deck, setDeck] = useState(() =>
    flashcards.filter((item) => item.tags.includes('tree'))
  )
  const [index, setIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [checkState, setCheckState] = useState<CheckState>(null)
  const [gameMode, setGameMode] = useState<GameMode>('multiple-choice')
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [typingInput, setTypingInput] = useState('')
  const [typingStartAt, setTypingStartAt] = useState<number | null>(null)
  const [typingElapsed, setTypingElapsed] = useState(0)
  const [typingMistakes, setTypingMistakes] = useState(0)
  const [typingBackspaces, setTypingBackspaces] = useState(0)
  const [typingScore, setTypingScore] = useState<number | null>(null)
  const [typingResult, setTypingResult] = useState<{ accuracy: number; wpm: number } | null>(null)
  const [typingFinished, setTypingFinished] = useState(false)
  const typingInputRef = useRef<HTMLTextAreaElement | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.currentTarget.scrollTop
      highlightRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop
    }
  }

  const card = deck[index] ?? deck[0] ?? flashcards[0]

  const rawOptions = useMemo(() => cardOptions[card.id] || [], [card.id])

  const shuffledOptions = useMemo(
    () => shuffle(rawOptions),
    [rawOptions]
  )

  const solutionOptions = useMemo<SolutionOption[]>(
    () =>
      rawOptions.map((option) => ({
        ...option,
        full: card.solution.replace('{{missing}}', option.code),
      })),
    [card.solution, rawOptions]
  )

  const shuffledSolutionOptions = useMemo(
    () => shuffle(solutionOptions),
    [solutionOptions]
  )

  const typingTarget = useMemo(
    () => normalizePep8(card.solution.replace('{{missing}}', card.missing)),
    [card.missing, card.solution]
  )

  const resetInteraction = () => {
    setShowAnswer(false)
    setShowHint(false)
    setCheckState(null)
    setSelectedOption(null)
    setTypingInput('')
    setTypingStartAt(null)
    setTypingElapsed(0)
    setTypingMistakes(0)
    setTypingBackspaces(0)
    setTypingScore(null)
    setTypingResult(null)
    setTypingFinished(false)
  }

  useEffect(() => {
    const filteredCards = flashcards.filter((item) => item.tags.includes(questionType))
    setDeck(filteredCards)
    setIndex(0)
    resetInteraction()
  }, [questionType])

  const submitAttemptToServer = async (correct: boolean) => {
    try {
      await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          mode: gameMode,
          correct,
        }),
      })
    } catch {
      // silently fail
    }
  }

  const submitAttempt = (correct: boolean) => {
    void submitAttemptToServer(correct)
  }

  const goNext = () => {
    setIndex((prev) => (prev + 1) % deck.length)
    resetInteraction()
  }

  const goPrev = () => {
    setIndex((prev) => (prev - 1 + deck.length) % deck.length)
    resetInteraction()
  }

  const shuffleDeck = () => {
    const shuffled = [...deck]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setDeck(shuffled)
    setIndex(0)
    resetInteraction()
  }

  const selectOption = (
    idx: number,
    options: Array<{ correct: boolean }>,
    revealAnswer = true
  ) => {
    if (selectedOption !== null) return
    setSelectedOption(idx)
    const option = options[idx]
    setCheckState(option.correct ? 'correct' : 'incorrect')
    void submitAttempt(option.correct)
    if (revealAnswer) setShowAnswer(true)
  }

  const switchMode = (mode: GameMode) => {
    setGameMode(mode)
    resetInteraction()
  }

  useEffect(() => {
    if (gameMode !== 'typing-race' || typingStartAt === null || typingFinished) return
    const timer = window.setInterval(() => {
      setTypingElapsed(Date.now() - typingStartAt)
    }, 100)

    return () => {
      window.clearInterval(timer)
    }
  }, [gameMode, typingFinished, typingStartAt])

  const countTypingMistakes = (value: string) => {
    let mismatches = 0
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] !== typingTarget[i]) mismatches += 1
    }
    return mismatches
  }

  const finalizeTypingAttempt = (
    inputValue: string,
    mistakes = countTypingMistakes(inputValue),
    backspaces = typingBackspaces
  ) => {
    if (typingFinished) return
    const completedAt = Date.now()
    const elapsedMs = typingStartAt ? completedAt - typingStartAt : 0
    const normalizedInput = normalizeTyping(inputValue)
    const normalizedTarget = normalizeTyping(typingTarget)
    const isCorrect = normalizedInput === normalizedTarget

    const compareLength = Math.max(normalizedTarget.length, normalizedInput.length, 1)
    let exactMatches = 0
    for (let i = 0; i < compareLength; i += 1) {
      if (normalizedInput[i] === normalizedTarget[i]) exactMatches += 1
    }

    const accuracy = Math.round((exactMatches / compareLength) * 100)
    const secondsUsed = Math.max(elapsedMs / 1000, 1)
    const typedWords = inputValue.trim() ? inputValue.trim().split(/\s+/).length : 0
    const wpm = Math.round((typedWords / secondsUsed) * 60)

    const baseScore = 1000
    const accuracyBonus = Math.round((accuracy / 100) * 500)
    const speedBonus = Math.max(0, Math.round((120 - secondsUsed) * 10))
    const penalty = mistakes * 15 + backspaces * 2
    const computedScore = Math.max(0, baseScore + accuracyBonus + speedBonus - penalty)

    setTypingElapsed(elapsedMs)
    setTypingFinished(true)
    setTypingScore(computedScore)
    setTypingResult({ accuracy, wpm })
    setCheckState(isCorrect ? 'correct' : 'incorrect')
    submitAttempt(isCorrect)

    // Persist detailed typing session to SQLite
    void fetch('/api/typing-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: card.id,
        cardTitle: card.title,
        questionType,
        categoryTags: card.tags.join(','),
        correct: isCorrect,
        accuracy,
        wpm,
        score: computedScore,
        elapsedMs,
        mistakes,
        backspaces,
        charsTyped: inputValue.length,
      }),
    }).catch(() => { /* silently fail */ })
  }

  const handleTypingInputChange = (nextValue: string) => {
    if (typingFinished) return

    if (typingStartAt === null && nextValue.length > 0) {
      setTypingStartAt(Date.now())
    }

    setTypingInput(nextValue)
    setTypingMistakes(countTypingMistakes(nextValue))
  }

  const applyTypingEdit = (nextValue: string, cursorPosition: number) => {
    handleTypingInputChange(nextValue)
    window.requestAnimationFrame(() => {
      if (!typingInputRef.current) return
      typingInputRef.current.selectionStart = cursorPosition
      typingInputRef.current.selectionEnd = cursorPosition
    })
  }

  const handleTypingKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (typingFinished) return

    const inputElement = event.currentTarget
    const start = inputElement.selectionStart
    const end = inputElement.selectionEnd

    if (event.key === 'Backspace') {
      setTypingBackspaces((prev) => prev + 1)
      // Dedent: if cursor is in leading whitespace, delete back to previous 4-space boundary
      if (start === end && start > 0) {
        const lineStart = typingInput.lastIndexOf('\n', Math.max(0, start - 1)) + 1
        const beforeCursor = typingInput.slice(lineStart, start)
        if (beforeCursor.length > 0 && /^ +$/.test(beforeCursor)) {
          const currentIndent = beforeCursor.length
          const newIndent = Math.max(0, (Math.ceil(currentIndent / 4) - 1) * 4)
          if (newIndent < currentIndent) {
            event.preventDefault()
            const nextValue = typingInput.slice(0, lineStart) + ' '.repeat(newIndent) + typingInput.slice(start)
            applyTypingEdit(nextValue, lineStart + newIndent)
            return
          }
        }
      }
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      const spaces = '    '
      const nextValue = `${typingInput.slice(0, start)}${spaces}${typingInput.slice(end)}`
      applyTypingEdit(nextValue, start + 4)
      return
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (typingInput.length > 0 && !typingFinished) {
        finalizeTypingAttempt(typingInput)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const lineStart = typingInput.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      const currentLine = typingInput.slice(lineStart, start)
      const indent = currentLine.match(/^\s*/)?.[0] ?? ''
      const insertion = `\n${indent}`
      const nextValue = `${typingInput.slice(0, start)}${insertion}${typingInput.slice(end)}`
      applyTypingEdit(nextValue, start + insertion.length)
    }
  }

  const typingExactMatch = normalizeTyping(typingInput) === normalizeTyping(typingTarget)
  const typingProgress = Math.min(100, Math.round((typingInput.length / Math.max(typingTarget.length, 1)) * 100))

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      // Arrow keys for prev/next (only when not typing in an input)
      if (!isInput && e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        goPrev()
      }
      if (!isInput && e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  })

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-left">
          <span className="navbar-brand">LC Flashcards</span>
          <span className="navbar-divider" />
          <div className="navbar-group">
            {(['tree', 'stack', 'top150'] as QuestionType[]).map((qt) => (
              <button
                key={qt}
                className={questionType === qt ? 'nav-tab active' : 'nav-tab'}
                onClick={() => setQuestionType(qt)}
              >
                {qt === 'tree' ? 'Tree' : qt === 'stack' ? 'Stack' : 'Top 150'}
              </button>
            ))}
          </div>
          <span className="navbar-divider" />
          <div className="navbar-group">
            {(['multiple-choice', 'full-solution', 'typing-race'] as GameMode[]).map((gm) => (
              <button
                key={gm}
                className={gameMode === gm ? 'nav-tab active' : 'nav-tab'}
                onClick={() => switchMode(gm)}
              >
                {gm === 'multiple-choice' ? 'MC' : gm === 'full-solution' ? 'Full' : 'Type'}
              </button>
            ))}
          </div>
        </div>
        <div className="navbar-right">
          <span className="navbar-counter">{index + 1} / {deck.length}</span>
          <Link to="/dashboard" className="navbar-dashboard">Dashboard</Link>
        </div>
      </nav>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>{card.title}</h2>
            <p className="difficulty"><span className="leetcode-num">#{card.id}</span> {card.difficulty}</p>
          </div>
          <div className="tags">
            {card.tags.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        </div>

        <div className="card-grid">
          <div className="panel">
            <h3>Prompt</h3>
            <p className="prompt">{card.prompt}</p>
            <button className="link" onClick={() => setShowHint((prev) => !prev)}>
              {showHint ? 'Hide hint' : 'Show hint'}
            </button>
            {showHint && <p className="hint">{card.hint}</p>}
          </div>

          <div className="panel">
            {gameMode === 'multiple-choice' && (
              <>
                <h3>Solution (missing one key step)</h3>
                <div className="code-container">
                  {card.solution
                    .split('{{missing}}')
                    .map((part, index, array) => {
                      return (
                        <div key={index} style={{ display: 'contents' }}>
                          <SyntaxHighlighter
                            language="python"
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: 0,
                              background: 'transparent', // Make background transparent so container handles it
                              display: 'inline',
                            }}
                            codeTagProps={{
                              style: {
                                background: 'transparent',
                              },
                            }}
                            PreTag="span"
                          >
                            {part}
                          </SyntaxHighlighter>
                          {index < array.length - 1 && (
                            <span className={showAnswer ? 'missing filled' : 'missing'}>
                              {showAnswer ? card.missing : '____'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                </div>
              </>
            )}

            {gameMode === 'typing-race' ? (
              <>
                <h3>Reference solution</h3>
                <div className="vscode-editor-container">
                  <div className="vscode-tabs">
                    <div className="vscode-tab active">
                      <PythonIcon />
                      reference.py
                    </div>
                  </div>
                  <div className="code-container" style={{ margin: 0, padding: 0, border: 'none', borderRadius: 0, boxShadow: 'none' }}>
                    <SyntaxHighlighter
                      language="python"
                      style={vscDarkPlus}
                      showLineNumbers={true}
                      lineNumberStyle={{
                        minWidth: '2.5rem',
                        paddingRight: '1rem',
                        color: '#858585',
                        textAlign: 'right',
                        fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                        fontSize: '0.95rem'
                      }}
                      customStyle={{
                        margin: 0,
                        padding: '1rem 1.25rem',
                        background: 'transparent',
                        fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                        fontSize: '0.95rem',
                        lineHeight: 1.6
                      }}
                      codeTagProps={{
                        style: {
                          background: 'transparent',
                          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                          fontSize: '0.95rem',
                          lineHeight: 1.6,
                          tabSize: 4,
                          MozTabSize: 4
                        },
                      }}
                    >
                      {typingTarget}
                    </SyntaxHighlighter>
                  </div>
                </div>
                <label className="answer-label" htmlFor="typing-race-input" style={{ marginTop: '1.5rem' }}>
                  Type the solution exactly
                </label>
                <div className="vscode-editor-container">
                  <div className="vscode-tabs">
                    <div className="vscode-tab active">
                      <PythonIcon />
                      solution.py
                    </div>
                  </div>
                  <div className="typing-editor">
                    <div className="typing-gutter" aria-hidden="true" ref={gutterRef}>
                      {(typingInput || ' ').split('\n').map((_, i) => (
                        <div key={i} className="typing-line-number">{i + 1}</div>
                      ))}
                    </div>
                    <div className="typing-code-area">
                      <div className="typing-highlight" aria-hidden="true" ref={highlightRef}>
                        <SyntaxHighlighter
                          language="python"
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                            padding: 0,
                            background: 'transparent',
                            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                            fontSize: '0.95rem',
                            lineHeight: '1.6',
                            whiteSpace: 'pre',
                            wordSpacing: 'normal',
                            letterSpacing: 'normal',
                          }}
                          codeTagProps={{
                            style: {
                              background: 'transparent',
                              fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                              fontSize: '0.95rem',
                              lineHeight: '1.6',
                              whiteSpace: 'pre',
                              wordSpacing: 'normal',
                              letterSpacing: 'normal',
                            },
                          }}
                        >
                          {typingInput || '# Start typing the full solution...'}
                        </SyntaxHighlighter>
                      </div>
                      <textarea
                        id="typing-race-input"
                        ref={typingInputRef}
                        className="typing-answer-overlay"
                        rows={10}
                        value={typingInput}
                        onChange={(event) => handleTypingInputChange(event.target.value)}
                        onKeyDown={handleTypingKeyDown}
                        onScroll={handleScroll}
                        placeholder="Start typing the full solution..."
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        autoComplete="off"
                        disabled={typingFinished}
                      />
                    </div>
                  </div>
                </div>

                {typingFinished && checkState === 'incorrect' && (
                  <div className="vscode-editor-container" style={{ marginTop: '1rem' }}>
                    <div className="vscode-tabs">
                      <div className="vscode-tab active">
                        <DiffIcon />
                        diff-view.py
                      </div>
                    </div>
                    <div className="diff-view">
                      {computeLineDiff(typingInput, typingTarget).map((line) => (
                        <div
                          key={`${line.status}-${line.lineNum}`}
                          className={`diff-line diff-${line.status}`}
                        >
                          <span className="diff-line-num">{line.expectedNum ?? '+'}</span>
                          <span className="diff-indicator">
                            {line.status === 'missing' ? '-' : line.status === 'extra' ? '+' : line.status === 'correct' ? ' ' : '~'}
                          </span>
                          <span className="diff-content">
                            {line.segments.map((seg, si) => (
                              <span key={si} className={`diff-seg diff-seg-${seg.type}`}>
                                {seg.text || ' '}
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="typing-help">
                  Tab inserts 4 spaces &middot; Enter auto-indents &middot; <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to submit
                </p>
                <div className="typing-metrics">
                  <p><strong>Time:</strong> {(typingElapsed / 1000).toFixed(1)}s</p>
                  <p><strong>Progress:</strong> {typingProgress}%</p>
                  <p><strong>Mistakes:</strong> {typingMistakes}</p>
                  <p><strong>Backspaces:</strong> {typingBackspaces}</p>
                  <p><strong>Exact match:</strong> {typingExactMatch ? 'Yes' : 'No'}</p>
                  <p><strong>Accuracy:</strong> {typingResult ? `${typingResult.accuracy}%` : '—'}</p>
                  <p><strong>WPM:</strong> {typingResult ? typingResult.wpm : '—'}</p>
                  <p><strong>Score:</strong> {typingScore ?? '—'}</p>
                </div>
                <div className="actions">
                  <button
                    onClick={() => finalizeTypingAttempt(typingInput)}
                    disabled={typingFinished || typingInput.length === 0}
                  >
                    Submit typing run
                  </button>
                  <button className="secondary" onClick={resetInteraction}>
                    Reset run
                  </button>
                  {typingFinished && (
                    <button className="secondary" onClick={goNext}>
                      Next card →
                    </button>
                  )}
                </div>
              </>
            ) : gameMode === 'multiple-choice' ? (
              <>
                <label className="answer-label">
                  Pick the correct missing line
                </label>
                <div className="options-list">
                  {shuffledOptions.map((option, idx) => {
                    const letter = String.fromCharCode(65 + idx)
                    let cls = 'option-btn'
                    if (selectedOption !== null) {
                      if (option.correct) cls += ' option-correct'
                      else if (idx === selectedOption) cls += ' option-incorrect'
                      else cls += ' option-dimmed'
                    }
                    return (
                      <button
                        key={idx}
                        className={cls}
                        onClick={() => selectOption(idx, shuffledOptions)}
                        disabled={selectedOption !== null}
                      >
                        <span className="option-letter">{letter}</span>
                        <SyntaxHighlighter
                          language="python"
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                            padding: '0.5rem 0.75rem',
                            borderRadius: '4px',
                            flex: 1, // Ensure it takes remaining space
                            minWidth: 0, // Allow flex shrinking
                          }}
                          PreTag="div"
                        >
                          {option.code}
                        </SyntaxHighlighter>
                      </button>
                    )
                  })}
                </div>
                {selectedOption !== null && (
                  <div className="actions" style={{ marginTop: '0.5rem' }}>
                    <button className="secondary" onClick={goNext}>
                      Next card →
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3>Solution options</h3>
                <label className="answer-label">
                  Pick the correct full solution
                </label>
                <div className="options-list">
                  {shuffledSolutionOptions.map((option, idx) => {
                    const letter = String.fromCharCode(65 + idx)
                    let cls = 'option-btn solution-option'
                    if (selectedOption !== null) {
                      if (option.correct) cls += ' option-correct'
                      else if (idx === selectedOption) cls += ' option-incorrect'
                      else cls += ' option-dimmed'
                    }
                    return (
                      <button
                        key={idx}
                        className={cls}
                        onClick={() => selectOption(idx, shuffledSolutionOptions, false)}
                        disabled={selectedOption !== null}
                      >
                        <span className="option-letter">{letter}</span>
                        <div className="option-solution">
                          <SyntaxHighlighter
                            language="python"
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: 0,
                              background: 'transparent',
                            }}
                            codeTagProps={{
                              style: {
                                background: 'transparent',
                              },
                            }}
                          >
                            {option.full}
                          </SyntaxHighlighter>
                        </div>
                      </button>
                    )
                  })}
                </div>
                {selectedOption !== null && (
                  <div className="actions" style={{ marginTop: '0.5rem' }}>
                    <button className="secondary" onClick={goNext}>
                      Next card →
                    </button>
                  </div>
                )}
              </>
            )}
            {checkState && (
              <p className={checkState === 'correct' ? 'status success' : 'status error'}>
                {checkState === 'correct'
                  ? 'Correct! Great job.'
                  : gameMode === 'multiple-choice'
                      ? 'Not quite — the correct answer is highlighted above.'
                      : gameMode === 'typing-race'
                        ? 'Not quite — keep practicing accuracy and speed.'
                      : 'Not quite — the correct solution is highlighted above.'}
              </p>
            )}
          </div>
        </div>

        <div className="card-footer">
          <div className="card-footer-left">
            <button className="secondary" onClick={goPrev}>
              <kbd>←</kbd> Previous
            </button>
            <button className="secondary" onClick={goNext}>
              Next <kbd>→</kbd>
            </button>
            <button className="secondary" onClick={shuffleDeck}>Shuffle</button>
          </div>
          <p className="card-footer-hint">
            Use <kbd>←</kbd> <kbd>→</kbd> arrow keys to navigate
          </p>
        </div>
      </section>
    </div>
  )
}

export default App
