import { storedSetting } from './storedSetting'

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
  aiCompletion: boolean
  styleGuide: CodeEditorStyleGuide
  commonPatterns: boolean
  foldControls: boolean
  showSearchPanel: boolean
}

export const CODE_EDITOR_TUNING_STORAGE_KEY = 'system1-code-editor-tuning-v1'

export const defaultCodeEditorTuning: CodeEditorTuning = {
  language: 'python',
  intellisense: true,
  aiCompletion: true,
  styleGuide: 'python-pep8',
  commonPatterns: true,
  foldControls: false,
  showSearchPanel: false,
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

const storedBoolean = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

export const codeEditorTuningSetting = storedSetting<CodeEditorTuning>(
  CODE_EDITOR_TUNING_STORAGE_KEY,
  defaultCodeEditorTuning,
  (parsed) => ({
    ...defaultCodeEditorTuning,
    ...parsed,
    language: isCodeEditorLanguage(parsed.language) ? parsed.language : defaultCodeEditorTuning.language,
    intellisense: storedBoolean(parsed.intellisense, defaultCodeEditorTuning.intellisense),
    aiCompletion: storedBoolean(parsed.aiCompletion, defaultCodeEditorTuning.aiCompletion),
    styleGuide: isCodeEditorStyleGuide(parsed.styleGuide) ? parsed.styleGuide : defaultCodeEditorTuning.styleGuide,
    commonPatterns: storedBoolean(parsed.commonPatterns, defaultCodeEditorTuning.commonPatterns),
    foldControls: storedBoolean(parsed.foldControls, defaultCodeEditorTuning.foldControls),
    showSearchPanel: storedBoolean(parsed.showSearchPanel, defaultCodeEditorTuning.showSearchPanel),
  }),
)

export const loadStoredCodeEditorTuning = codeEditorTuningSetting.load
export const saveStoredCodeEditorTuning = codeEditorTuningSetting.save
