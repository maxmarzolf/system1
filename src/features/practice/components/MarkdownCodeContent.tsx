import type { CSSProperties } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import type { AppTheme } from '@/app/theme'
import RecallCodeEditor from '../editor/RecallCodeEditor'
import { normalizePythonCodeForDisplay, parseMarkdownCodeSegments, renderInlineMarkdownText } from '../lib/markdownText'

/** Text with fenced code blocks: prose rendered inline, code highlighted (or as a read-only editor). */
export default function MarkdownCodeContent({
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
