export type CodeEditorLanguage =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'java'
  | 'cpp'
  | 'go'
  | 'sql'
  | 'rust'

export type CodeEditorStyleGuide = 'none' | 'python-pep8'

export type CodeEditorTuning = {
  language: CodeEditorLanguage
  intellisense: boolean
  styleGuide: CodeEditorStyleGuide
  commonPatterns: boolean
  foldControls: boolean
}

export const CODE_EDITOR_TUNING_STORAGE_KEY = 'system1-code-editor-tuning-v1'

export const defaultCodeEditorTuning: CodeEditorTuning = {
  language: 'python',
  intellisense: true,
  styleGuide: 'python-pep8',
  commonPatterns: true,
  foldControls: false,
}

const CODE_EDITOR_LANGUAGES: readonly CodeEditorLanguage[] = [
  'python',
  'javascript',
  'typescript',
  'java',
  'cpp',
  'go',
  'sql',
  'rust',
]
const CODE_EDITOR_STYLE_GUIDES: readonly CodeEditorStyleGuide[] = ['none', 'python-pep8']

const isCodeEditorLanguage = (value: unknown): value is CodeEditorLanguage =>
  typeof value === 'string' && CODE_EDITOR_LANGUAGES.includes(value as CodeEditorLanguage)

const isCodeEditorStyleGuide = (value: unknown): value is CodeEditorStyleGuide =>
  typeof value === 'string' && CODE_EDITOR_STYLE_GUIDES.includes(value as CodeEditorStyleGuide)

export const loadStoredCodeEditorTuning = (): CodeEditorTuning => {
  if (typeof window === 'undefined') return defaultCodeEditorTuning

  try {
    const raw = window.localStorage.getItem(CODE_EDITOR_TUNING_STORAGE_KEY)
    if (!raw) return defaultCodeEditorTuning

    const parsed = JSON.parse(raw) as Partial<CodeEditorTuning>
    return {
      ...defaultCodeEditorTuning,
      ...parsed,
      language: isCodeEditorLanguage(parsed.language)
        ? parsed.language
        : defaultCodeEditorTuning.language,
      intellisense: typeof parsed.intellisense === 'boolean'
        ? parsed.intellisense
        : defaultCodeEditorTuning.intellisense,
      styleGuide: isCodeEditorStyleGuide(parsed.styleGuide)
        ? parsed.styleGuide
        : defaultCodeEditorTuning.styleGuide,
      commonPatterns: typeof parsed.commonPatterns === 'boolean'
        ? parsed.commonPatterns
        : defaultCodeEditorTuning.commonPatterns,
      foldControls: typeof parsed.foldControls === 'boolean'
        ? parsed.foldControls
        : defaultCodeEditorTuning.foldControls,
    }
  } catch {
    return defaultCodeEditorTuning
  }
}

export const saveStoredCodeEditorTuning = (tuning: CodeEditorTuning) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CODE_EDITOR_TUNING_STORAGE_KEY, JSON.stringify(tuning))
}
