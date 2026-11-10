import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import type { AppTheme } from '../theme'
import RecallCodeEditor from '../RecallCodeEditor'
import { parseMarkdownCodeSegments, normalizePythonCodeForDisplay, renderInlineMarkdownText } from './markdownText'

export function MicroDrillBlankEditor({ template, language, syntaxTheme, theme, onAnswerChange, disabled = false }: {
  template: string
  language: string
  syntaxTheme: Record<string, CSSProperties>
  theme: AppTheme
  onAnswerChange?: (answer: { code: string; complete: boolean }) => void
  disabled?: boolean
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [fallbackValue, setFallbackValue] = useState(template)
  const lines = useMemo(() => template.split('\n'), [template])
  const blankCount = useMemo(() => (template.match(/_{3,}/g) ?? []).length, [template])

  useEffect(() => {
    let index = 0
    const code = template.replace(/_{3,}/g, () => answers[index++] ?? '')
    onAnswerChange?.({ code: blankCount ? code : fallbackValue, complete: blankCount ? Array.from({ length: blankCount }, (_, i) => answers[i]?.trim()).every(Boolean) : Boolean(fallbackValue.trim()) })
  }, [answers, blankCount, fallbackValue, onAnswerChange, template])

  if (blankCount === 0) {
    return (
      <RecallCodeEditor
        value={fallbackValue}
        language={language}
        theme={theme}
        editable={!disabled}
        placeholder="Complete the code"
        lineMeta={[]}
        minHeight={Math.max(lines.length * 20 + 30, 180)}
        intellisense={false}
        commonPatterns={false}
        onChange={setFallbackValue}
      />
    )
  }

  return (
    <div className="micro-drill-code" role="group" aria-label={`Editable ${language} fill-in-the-blank code`}>
      <SyntaxHighlighter
        language={language}
        style={syntaxTheme}
        customStyle={{ margin: 0, padding: 0, background: 'transparent', font: 'inherit' }}
        codeTagProps={{ style: { font: 'inherit' } }}
        wrapLines
        renderer={({ rows, stylesheet }) => {
          let blankIndex = 0
          const renderNode = (node: rendererNode, key: string, lineIndex: number): ReactNode => {
            if (node.type === 'text') {
              return String(node.value ?? '').split(/(_{3,})/g).map((part, partIndex) => {
                if (!/^_{3,}$/.test(part)) return part
                const currentBlank = blankIndex++
                const value = answers[currentBlank] ?? ''
                return (
                  <input
                    key={`${key}-${partIndex}`}
                    className="micro-drill-blank"
                    disabled={disabled}
                    value={value}
                    onChange={(event) => setAnswers((current) => ({ ...current, [currentBlank]: event.target.value }))}
                    aria-label={`Blank ${currentBlank + 1}, line ${lineIndex + 1}`}
                    autoCapitalize="off"
                    autoComplete="off"
                    spellCheck={false}
                    style={{ width: `${Math.max(value.length + 1, Math.ceil(part.length * 0.72))}ch` }}
                  />
                )
              })
            }
            const classes = node.properties?.className ?? []
            const style = Object.assign({}, ...classes.map((name: string) => stylesheet[name]))
            return (
              <span key={key} style={style}>
                {node.children?.map((child, index) => renderNode(child, `${key}-${index}`, lineIndex))}
              </span>
            )
          }
          return rows.map((row, lineIndex) => (
            <span className="micro-drill-code-line" key={lineIndex}>
              <span className="micro-drill-line-number" aria-hidden="true">{lineIndex + 1}</span>
              <span className="micro-drill-code-content">{renderNode(row, `${lineIndex}`, lineIndex)}</span>
            </span>
          ))
        }}
      >
        {template}
      </SyntaxHighlighter>
    </div>
  )
}

export function MicroDrillInstructions({ text }: { text: string }) {
  return (
    <div className="micro-drill-instructions">
      {text.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
        const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*$/)
        if (heading) {
          return (
            <h3 className="micro-drill-instruction-heading" key={index}>
              {renderInlineMarkdownText(heading[1].replace(/\s+#+\s*$/, ''))}
            </h3>
          )
        }
        return <span key={index}>{renderInlineMarkdownText(line)}</span>
      })}
    </div>
  )
}

export function MarkdownCodeContent({
  text,
  syntaxTheme,
  theme,
  compact = false,
  editorBlocks = false,
}: {
  text: string
  syntaxTheme: Record<string, CSSProperties>
  theme?: AppTheme
  compact?: boolean
  editorBlocks?: boolean
}) {
  const Wrapper = editorBlocks ? 'div' : 'span'

  return (
    <Wrapper className={compact ? 'multiple-choice-markdown compact' : 'multiple-choice-markdown'}>
      {parseMarkdownCodeSegments(text).map((segment, index) => {
        if (segment.type === 'code') {
          const normalizedCode = normalizePythonCodeForDisplay(segment.code, segment.language)
          if (!normalizedCode) return null
          const lineCount = Math.max(normalizedCode.split('\n').length, 1)
          const snippetMinHeight = Math.min(Math.max(lineCount * 19 + 30, 82), 240)

          if (editorBlocks && theme) {
            return (
              <div key={index} className="multiple-choice-code-editor-block">
                <RecallCodeEditor
                  value={normalizedCode}
                  language={segment.language}
                  theme={theme}
                  editable={false}
                  placeholder=""
                  lineMeta={[]}
                  minHeight={snippetMinHeight}
                  intellisense={false}
                  commonPatterns={false}
                  className="recall-code-editor-snippet"
                  onChange={() => undefined}
                />
              </div>
            )
          }

          return (
            <span key={index} className="multiple-choice-code-text-block">
              <SyntaxHighlighter
                language={segment.language}
                style={syntaxTheme}
                PreTag="span"
                CodeTag="span"
                customStyle={{
                  margin: 0,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  display: 'block',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  lineHeight: 'inherit',
                  whiteSpace: 'pre-wrap',
                }}
                codeTagProps={{
                  style: {
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    lineHeight: 'inherit',
                    whiteSpace: 'pre-wrap',
                  },
                }}
              >
                {normalizedCode}
              </SyntaxHighlighter>
            </span>
          )
        }

        return (
          <span key={index} className="multiple-choice-text-block">
            {renderInlineMarkdownText(segment.text)}
          </span>
        )
      })}
    </Wrapper>
  )
}
