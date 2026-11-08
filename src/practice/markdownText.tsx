export type MarkdownCodeSegment =
  | { type: 'text'; text: string }
  | { type: 'code'; code: string; language: string }

export const normalizeCodeLanguage = (language: string) => {
  const normalized = language.trim().toLowerCase()
  if (normalized === 'py') return 'python'
  return normalized || 'python'
}

export const parseMarkdownCodeSegments = (text: string): MarkdownCodeSegment[] => {
  const segments: MarkdownCodeSegment[] = []
  const fencePattern = /```([A-Za-z0-9_-]+)?\s*\n?([\s\S]*?)```/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = fencePattern.exec(text)) !== null) {
    if (match.index > cursor) {
      const textContent = text.slice(cursor, match.index).trim()
      if (textContent) segments.push({ type: 'text', text: textContent })
    }
    segments.push({
      type: 'code',
      language: normalizeCodeLanguage(match[1] ?? 'python'),
      code: match[2].trim(),
    })
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    const textContent = text.slice(cursor).trim()
    if (textContent) segments.push({ type: 'text', text: textContent })
  }

  return segments.length > 0 ? segments : [{ type: 'text', text }]
}

export const focusMicroDrillInput = (container: HTMLElement | null) => {
  container?.querySelector<HTMLElement>(
    '.micro-drill-blank:not(:disabled), .micro-drill-answer-card .cm-content[contenteditable="true"]'
  )?.focus()
}

export const normalizePythonCodeForDisplay = (code: string, language: string) => {
  if (normalizeCodeLanguage(language) !== 'python') return code.trim()

  return code
    .replace(/\t/g, '    ')
    .split('\n')
    .map((line) => {
      const trimmedRight = line.trimEnd()
      const leadingWhitespace = trimmedRight.match(/^\s*/)?.[0] ?? ''
      const content = trimmedRight.slice(leadingWhitespace.length)
      const indentationWidth = leadingWhitespace.length > 0
        ? Math.max(4, Math.ceil(leadingWhitespace.length / 4) * 4)
        : 0
      const paddedContent = content
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*(==|!=|<=|>=|\+=|-=|\*=|\/=|%=|\/\/|\*\*|[+\-*/%<>])\s*/g, ' $1 ')
        .replace(/(?<![<>=!+\-*/%])\s*=\s*(?![=])/g, ' = ')
        .replace(/\s+/g, ' ')
        .trim()
      return `${' '.repeat(indentationWidth)}${paddedContent}`
    })
    .join('\n')
    .trim()
}

export const renderInlineMarkdownText = (text: string) => {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index} className="multiple-choice-inline-code">{part.slice(1, -1)}</code>
    }
    return <span key={index}>{part}</span>
  })
}
