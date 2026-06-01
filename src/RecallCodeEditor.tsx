import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { Compartment, EditorSelection, EditorState, Prec, RangeSetBuilder, type Extension } from '@codemirror/state'
import {
  Decoration,
  WidgetType,
  keymap,
  placeholder as editorPlaceholder,
  type DecorationSet,
} from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
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

class InlineNoteWidget extends WidgetType {
  readonly note: string

  constructor(note: string) {
    super()
    this.note = note
  }

  eq(widget: InlineNoteWidget) {
    return widget.note === this.note
  }

  toDOM() {
    const element = document.createElement('span')
    element.className = 'cm-recall-inline-note'
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
    element.textContent = this.text
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
        Decoration.widget({ widget: new InlineNoteWidget(meta.inlineNote), side: 2 })
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
    '.cm-focused': {
      outline: 'none',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--hc-editor-bg)',
      color: 'var(--hc-gutter-fg)',
      borderRight: '1px solid var(--hc-border-dim)',
    },
    '.cm-activeLineGutter, .cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--hc-accent) 9%, transparent)',
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
  const themeCompartment = useMemo(() => new Compartment(), [])
  const editableCompartment = useMemo(() => new Compartment(), [])
  const decorationsCompartment = useMemo(() => new Compartment(), [])
  const placeholderCompartment = useMemo(() => new Compartment(), [])

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
        basicSetup,
        languageCompartment.of(resolveLanguageExtension(language)),
        themeCompartment.of(recallTheme(theme)),
        editableCompartment.of(editableExtension(editable, disabled)),
        decorationsCompartment.of(recallDecorations(lineMeta, ghostTarget)),
        placeholderCompartment.of(createPlaceholderExtension(placeholder)),
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

  return (
    <div
      ref={hostRef}
      className="recall-code-editor"
      style={minHeight ? { minHeight } : undefined}
    />
  )
})

export default RecallCodeEditor
