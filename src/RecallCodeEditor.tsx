import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { Compartment, EditorSelection, EditorState, Prec, RangeSetBuilder, type Extension } from '@codemirror/state'
import {
  crosshairCursor,
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  WidgetType,
  keymap,
  lineNumbers,
  placeholder as editorPlaceholder,
  rectangularSelection,
  type DecorationSet,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completeFromList,
  completionKeymap,
  type Completion,
} from '@codemirror/autocomplete'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { lintKeymap } from '@codemirror/lint'
import { oneDark } from '@codemirror/theme-one-dark'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { go } from '@codemirror/lang-go'
import { sql } from '@codemirror/lang-sql'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { rust } from '@codemirror/lang-rust'
import type { AppTheme } from './theme'
import type { CodeEditorStyleGuide } from './codeEditorTuning'

export type RecallEditorLineStatus = 'match' | 'mismatch' | 'missing' | 'extra'
export type RecallEditorLiveTone = 'positive' | 'negative' | 'neutral'

export type RecallEditorLineMeta = {
  sourceLineNumber: number | null
  status?: RecallEditorLineStatus | null
  liveTone?: RecallEditorLiveTone | null
  inlineDecision?: boolean
  inlineNote?: string
}

export type RecallCodeEditorHandle = {
  focus: () => void
  focusEnd: () => void
  getCursorPosition: () => number
}

type RecallCodeEditorProps = {
  value: string
  language: string
  theme: AppTheme
  editable: boolean
  disabled?: boolean
  placeholder: string
  ghostTarget?: string
  lineMeta: RecallEditorLineMeta[]
  minHeight?: number
  intellisense?: boolean
  styleGuide?: CodeEditorStyleGuide
  commonPatterns?: boolean
  onChange: (nextValue: string) => void
  onSubmitHotkey: () => void
}

const resolveLanguageExtension = (language: string): Extension => {
  const normalized = language.trim().toLowerCase()

  if (normalized === 'python' || normalized === 'py') return python()
  if (normalized === 'javascript' || normalized === 'js') return javascript()
  if (normalized === 'typescript' || normalized === 'ts') return javascript({ typescript: true })
  if (normalized === 'jsx') return javascript({ jsx: true })
  if (normalized === 'tsx') return javascript({ jsx: true, typescript: true })
  if (normalized === 'java') return java()
  if (normalized === 'c' || normalized === 'cpp' || normalized === 'c++') return cpp()
  if (normalized === 'go' || normalized === 'golang') return go()
  if (normalized === 'sql') return sql()
  if (normalized === 'html') return html()
  if (normalized === 'css') return css()
  if (normalized === 'json') return json()
  if (normalized === 'markdown' || normalized === 'md') return markdown()
  if (normalized === 'rust' || normalized === 'rs') return rust()

  return python()
}

const resolveIndentationExtension = (language: string): Extension => {
  const normalized = language.trim().toLowerCase()
  if (normalized === 'python' || normalized === 'py') {
    return [EditorState.tabSize.of(4), indentUnit.of('    ')]
  }
  return EditorState.tabSize.of(4)
}

const normalizedLanguage = (language: string) => language.trim().toLowerCase()

const pythonBaseCompletions: Completion[] = [
  { label: 'def', type: 'keyword', detail: 'function' },
  { label: 'return', type: 'keyword' },
  { label: 'for', type: 'keyword' },
  { label: 'while', type: 'keyword' },
  { label: 'if', type: 'keyword' },
  { label: 'elif', type: 'keyword' },
  { label: 'else', type: 'keyword' },
  { label: 'enumerate', type: 'function' },
  { label: 'range', type: 'function' },
  { label: 'len', type: 'function' },
  { label: 'sorted', type: 'function' },
  { label: 'set', type: 'type' },
  { label: 'dict', type: 'type' },
  { label: 'list', type: 'type' },
]

const pythonPatternCompletions: Completion[] = [
  {
    label: 'def solve',
    type: 'function',
    detail: 'PEP 8 function skeleton',
    apply: 'def solve(nums):\n    \n    return',
  },
  {
    label: 'two pointers',
    type: 'text',
    detail: 'left/right scan',
    apply: 'left, right = 0, len(nums) - 1\nwhile left < right:\n    ',
  },
  {
    label: 'sliding window',
    type: 'text',
    detail: 'expand/shrink',
    apply: 'left = 0\nfor right, value in enumerate(nums):\n    while False:\n        left += 1',
  },
  {
    label: 'frequency map',
    type: 'text',
    detail: 'counts dictionary',
    apply: 'counts = {}\nfor value in nums:\n    counts[value] = counts.get(value, 0) + 1',
  },
  {
    label: 'heap',
    type: 'text',
    detail: 'priority queue import',
    apply: 'import heapq\nheap = []\nheapq.heappush(heap, item)',
  },
]

const javascriptCompletions: Completion[] = [
  { label: 'function', type: 'keyword' },
  { label: 'const', type: 'keyword' },
  { label: 'let', type: 'keyword' },
  { label: 'return', type: 'keyword' },
  { label: 'for', type: 'keyword' },
  { label: 'while', type: 'keyword' },
  { label: 'Map', type: 'type' },
  { label: 'Set', type: 'type' },
]

const sqlCompletions: Completion[] = [
  { label: 'SELECT', type: 'keyword' },
  { label: 'FROM', type: 'keyword' },
  { label: 'WHERE', type: 'keyword' },
  { label: 'GROUP BY', type: 'keyword' },
  { label: 'ORDER BY', type: 'keyword' },
  { label: 'JOIN', type: 'keyword' },
]

const completionsForLanguage = (language: string, commonPatterns: boolean) => {
  const normalized = normalizedLanguage(language)
  if (normalized === 'python' || normalized === 'py') {
    return [...pythonBaseCompletions, ...(commonPatterns ? pythonPatternCompletions : [])]
  }
  if (['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx'].includes(normalized)) {
    return javascriptCompletions
  }
  if (normalized === 'sql') return sqlCompletions
  return []
}

const editorAssistanceExtension = (
  language: string,
  intellisense: boolean,
  commonPatterns: boolean
): Extension => {
  if (!intellisense) return []
  const completions = completionsForLanguage(language, commonPatterns)
  return [
    closeBrackets(),
    autocompletion(completions.length > 0 ? { override: [completeFromList(completions)] } : undefined),
    keymap.of([...completionKeymap, ...closeBracketsKeymap]),
  ]
}

const editorStyleGuideExtension = (language: string, styleGuide: CodeEditorStyleGuide): Extension => {
  const normalized = normalizedLanguage(language)
  if (styleGuide !== 'python-pep8' || (normalized !== 'python' && normalized !== 'py')) return []

  return EditorView.theme({
    '.cm-content': {
      position: 'relative',
    },
    '.cm-content::after': {
      content: '""',
      position: 'absolute',
      top: '0',
      bottom: '0',
      left: 'calc(1.5rem + 79ch)',
      borderLeft: '1px dotted color-mix(in srgb, var(--hc-border-dim) 72%, transparent)',
      pointerEvents: 'none',
    },
  })
}

const recallBaseSetup = [
  lineNumbers(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  rectangularSelection(),
  crosshairCursor(),
  highlightSelectionMatches(),
  keymap.of([
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...lintKeymap,
  ]),
]

class InlineNoteWidget extends WidgetType {
  readonly note: string
  readonly tone?: RecallEditorLiveTone | null

  constructor(note: string, tone?: RecallEditorLiveTone | null) {
    super()
    this.note = note
    this.tone = tone
  }

  eq(widget: InlineNoteWidget) {
    return widget.note === this.note && widget.tone === this.tone
  }

  toDOM() {
    const element = document.createElement('span')
    element.className = ['cm-recall-inline-note', this.tone ? `cm-recall-inline-note-${this.tone}` : '']
      .filter(Boolean)
      .join(' ')
    element.textContent = this.note
    return element
  }
}

class GhostTextWidget extends WidgetType {
  readonly text: string

  constructor(text: string) {
    super()
    this.text = text
  }

  eq(widget: GhostTextWidget) {
    return widget.text === this.text
  }

  toDOM() {
    const element = document.createElement('span')
    element.className = 'cm-recall-ghost-text'
    element.textContent = this.text
    return element
  }
}

class GhostBlockWidget extends WidgetType {
  readonly text: string

  constructor(text: string) {
    super()
    this.text = text
  }

  eq(widget: GhostBlockWidget) {
    return widget.text === this.text
  }

  toDOM() {
    const element = document.createElement('span')
    element.className = 'cm-recall-ghost-block'
    element.textContent = `\n${this.text}`
    return element
  }
}

const lineClassForMeta = (meta: RecallEditorLineMeta) => {
  const classes = ['cm-recall-line']
  if (meta.status) classes.push(`line-${meta.status}`)
  if (meta.inlineDecision) classes.push('inline-decision-line')
  if (meta.liveTone) {
    classes.push(`live-target-${meta.liveTone}`)
    if (meta.sourceLineNumber !== null) classes.push('live-target-source-line')
    classes.push('inline-live-note-line')
  }
  return classes.join(' ')
}

const buildRecallDecorations = (
  view: EditorView,
  lineMeta: RecallEditorLineMeta[],
  ghostTarget: string | undefined
): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const documentText = doc.toString()
  const inputLines = documentText.split('\n')
  const ghostLines = ghostTarget ? ghostTarget.split('\n') : []

  for (let index = 0; index < doc.lines; index += 1) {
    const line = doc.line(index + 1)
    const meta = lineMeta[index]

    if (meta) {
      builder.add(line.from, line.from, Decoration.line({ class: lineClassForMeta(meta) }))
    }

    const ghostLine = ghostLines[index]
    if (ghostLine !== undefined) {
      const inputLine = inputLines[index] ?? ''
      const remainder = ghostLine.startsWith(inputLine) ? ghostLine.slice(inputLine.length) : ''
      if (remainder) {
        builder.add(
          line.to,
          line.to,
          Decoration.widget({ widget: new GhostTextWidget(remainder), side: 1 })
        )
      }
    }

    if (meta?.inlineNote) {
      builder.add(
        line.to,
        line.to,
        Decoration.widget({ widget: new InlineNoteWidget(meta.inlineNote, meta.liveTone), side: 2 })
      )
    }
  }

  if (ghostLines.length > doc.lines) {
    builder.add(
      doc.length,
      doc.length,
      Decoration.widget({
        widget: new GhostBlockWidget(ghostLines.slice(doc.lines).join('\n')),
        side: 3,
      })
    )
  }

  return builder.finish()
}

const recallDecorations = (lineMeta: RecallEditorLineMeta[], ghostTarget?: string) =>
  EditorView.decorations.of((view) => buildRecallDecorations(view, lineMeta, ghostTarget))

const recallTheme = (theme: AppTheme) => [
  theme === 'dark-high-contrast' ? oneDark : [],
  EditorView.theme({
    '&': {
      minHeight: '12rem',
      backgroundColor: 'var(--hc-editor-bg)',
      color: 'var(--hc-code-fg)',
      fontSize: '0.75rem',
    },
    '.cm-scroller': {
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      lineHeight: '1.6',
    },
    '.cm-content': {
      padding: '1rem 1.5rem',
      minHeight: '12rem',
      caretColor: 'var(--hc-fg)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--hc-editor-bg)',
      color: 'var(--hc-gutter-fg)',
      borderRight: '1px solid var(--hc-border-dim)',
    },
    '.cm-activeLineGutter, .cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--hc-accent) 32%, transparent)',
    },
    '.cm-placeholder': {
      color: 'var(--hc-fg-dim)',
      opacity: '0.72',
      whiteSpace: 'pre',
    },
  })
]

const createPlaceholderExtension = (placeholderText: string) => {
  return editorPlaceholder(() => {
    const element = document.createElement('pre')
    element.className = 'cm-recall-placeholder'
    element.textContent = placeholderText
    return element
  })
}

const editableExtension = (editable: boolean, disabled?: boolean) => [
  EditorState.readOnly.of(!editable || Boolean(disabled)),
  EditorView.editable.of(editable && !disabled),
]

const valueFromEditor = (view: EditorView) => view.state.doc.toString()

const RecallCodeEditor = forwardRef<RecallCodeEditorHandle, RecallCodeEditorProps>(function RecallCodeEditor(
  {
    value,
    language,
    theme,
    editable,
    disabled,
    placeholder,
    ghostTarget,
    lineMeta,
    minHeight,
    intellisense = true,
    styleGuide = 'python-pep8',
    commonPatterns = true,
    onChange,
    onSubmitHotkey,
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSubmitHotkeyRef = useRef(onSubmitHotkey)
  const languageCompartment = useMemo(() => new Compartment(), [])
  const indentationCompartment = useMemo(() => new Compartment(), [])
  const themeCompartment = useMemo(() => new Compartment(), [])
  const editableCompartment = useMemo(() => new Compartment(), [])
  const decorationsCompartment = useMemo(() => new Compartment(), [])
  const placeholderCompartment = useMemo(() => new Compartment(), [])
  const assistanceCompartment = useMemo(() => new Compartment(), [])
  const styleGuideCompartment = useMemo(() => new Compartment(), [])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSubmitHotkeyRef.current = onSubmitHotkey
  }, [onSubmitHotkey])

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    focusEnd: () => {
      const view = viewRef.current
      if (!view) return
      const end = view.state.doc.length
      view.dispatch({
        selection: EditorSelection.cursor(end),
        scrollIntoView: true,
      })
      view.focus()
    },
    getCursorPosition: () => viewRef.current?.state.selection.main.head ?? value.length,
  }), [value.length])

  useEffect(() => {
    if (!hostRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        Prec.highest(keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onSubmitHotkeyRef.current()
              return true
            },
          },
          indentWithTab,
        ])),
        recallBaseSetup,
        languageCompartment.of(resolveLanguageExtension(language)),
        indentationCompartment.of(resolveIndentationExtension(language)),
        themeCompartment.of(recallTheme(theme)),
        editableCompartment.of(editableExtension(editable, disabled)),
        decorationsCompartment.of(recallDecorations(lineMeta, ghostTarget)),
        placeholderCompartment.of(createPlaceholderExtension(placeholder)),
        assistanceCompartment.of(editorAssistanceExtension(language, intellisense, commonPatterns)),
        styleGuideCompartment.of(editorStyleGuideExtension(language, styleGuide)),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          onChangeRef.current(valueFromEditor(update.view))
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: hostRef.current,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The editor is intentionally created once; prop changes are applied through compartments below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentValue = valueFromEditor(view)
    if (currentValue === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.reconfigure(resolveLanguageExtension(language)),
    })
  }, [language, languageCompartment])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: indentationCompartment.reconfigure(resolveIndentationExtension(language)),
    })
  }, [indentationCompartment, language])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(recallTheme(theme)),
    })
  }, [theme, themeCompartment])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editableCompartment.reconfigure(editableExtension(editable, disabled)),
    })
  }, [disabled, editable, editableCompartment])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: decorationsCompartment.reconfigure(recallDecorations(lineMeta, ghostTarget)),
    })
  }, [decorationsCompartment, ghostTarget, lineMeta])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: placeholderCompartment.reconfigure(createPlaceholderExtension(placeholder)),
    })
  }, [placeholder, placeholderCompartment])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: assistanceCompartment.reconfigure(editorAssistanceExtension(language, intellisense, commonPatterns)),
    })
  }, [assistanceCompartment, commonPatterns, intellisense, language])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: styleGuideCompartment.reconfigure(editorStyleGuideExtension(language, styleGuide)),
    })
  }, [language, styleGuide, styleGuideCompartment])

  return (
    <div
      ref={hostRef}
      className="recall-code-editor"
      style={minHeight ? { minHeight } : undefined}
    />
  )
})

export default RecallCodeEditor
