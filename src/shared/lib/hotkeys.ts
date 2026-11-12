export type PracticeFlowStage = 'recall' | 'ghost' | 'multiple-choice' | 'microdrill'

export type HotkeyId =
  | 'flow-full-recall'
  | 'flow-targeted-ghost'
  | 'flow-targeted-mcq'
  | 'flow-targeted-microdrill'
  | 'primary-card-action'
  | 'next-targeted-line'
  | 'toggle-ghost-reps'
  | 'move-pages'
  | 'journey-start-practice'
  | 'start-total-recall'
  | 'submit-card'
  | 'mcq-choice'
  | 'indent-outdent'
  | 'toggle-ai-completion'
  | 'toggle-inline-feedback'

type HotkeyBinding = {
  key: string
  modifier?: 'mod' | 'meta'
  shift?: boolean
}

type HotkeyDefinition = {
  id: HotkeyId
  group: 'Navigation' | 'Card modalities' | 'Recall and Ghost Reps' | 'Editor and coaching'
  displayKeys: string[]
  label: string
  description: string
  bindings: HotkeyBinding[]
  flowStage?: PracticeFlowStage
  editorKey?: string
}

export type PracticeHotkey = {
  id: HotkeyId
  keys: string[]
  label: string
  description: string
  flowStage?: PracticeFlowStage
}

const hotkeyDefinitions: HotkeyDefinition[] = [
  {
    id: 'move-pages',
    group: 'Navigation',
    displayKeys: ['Mod + A / Mod + D'],
    label: 'Move between pages',
    description: 'Move left or right through the navbar, wrapping at either end.',
    bindings: [{ key: 'a', modifier: 'mod' }, { key: 'd', modifier: 'mod' }],
  },
  {
    id: 'start-total-recall',
    group: 'Navigation',
    displayKeys: ['Mod + Enter'],
    label: 'Jump to Total Recall',
    description: 'From any other page, open Practice and focus the Total Recall editor.',
    bindings: [{ key: 'Enter', modifier: 'mod' }],
  },
  {
    id: 'journey-start-practice',
    group: 'Navigation',
    displayKeys: ['Enter'],
    label: 'Start practicing',
    description: 'On Journey, open the practice page (unless a button or field has focus).',
    bindings: [],
  },
  {
    id: 'submit-card',
    group: 'Card modalities',
    displayKeys: ['Mod', 'Shift', 'Enter'],
    label: 'Start or submit',
    description: 'Start or submit Recall, Ghost, MCQ or Microdrill from the keyboard.',
    bindings: [{ key: 'Enter', modifier: 'mod', shift: true }],
  },
  {
    id: 'mcq-choice',
    group: 'Card modalities',
    displayKeys: ['A–D / 1–4'],
    label: 'Choose an MCQ answer',
    description: 'Pick the first to fourth answer. MCQ only.',
    bindings: [],
  },
  {
    id: 'flow-full-recall',
    group: 'Card modalities',
    displayKeys: ['Mod + ↑ ↑'],
    label: 'Total Recall',
    description: 'Open Total Recall on the current card.',
    bindings: [],
    flowStage: 'recall',
  },
  {
    id: 'flow-targeted-ghost',
    group: 'Card modalities',
    displayKeys: ['Mod + → →'],
    label: 'Ghost',
    description: 'Open Ghost on the current card.',
    bindings: [],
    flowStage: 'ghost',
  },
  {
    id: 'flow-targeted-mcq',
    group: 'Card modalities',
    displayKeys: ['Mod + ↓ ↓'],
    label: 'MCQ',
    description: 'Open MCQ on the current card.',
    bindings: [],
    flowStage: 'multiple-choice',
  },
  {
    id: 'flow-targeted-microdrill',
    group: 'Card modalities',
    displayKeys: ['Mod + ← ←'],
    label: 'Microdrill',
    description: 'Open Microdrill on the current card.',
    bindings: [],
    flowStage: 'microdrill',
  },
  {
    id: 'primary-card-action',
    group: 'Card modalities',
    displayKeys: ['Mod', 'Enter'],
    label: 'Advance Flow / card button',
    description: 'Advance a Flow after Recall or Ghost, or press the button under the card when one is visible.',
    bindings: [{ key: 'Enter', modifier: 'mod' }],
  },
  {
    id: 'next-targeted-line',
    group: 'Recall and Ghost Reps',
    displayKeys: ['Enter'],
    label: 'Next targeted line',
    description: 'During a targeted Ghost Rep, jump to the next incomplete line.',
    bindings: [{ key: 'Enter' }],
    editorKey: 'Enter',
  },
  {
    id: 'toggle-ghost-reps',
    group: 'Recall and Ghost Reps',
    displayKeys: ['Mod', 'G'],
    label: 'Toggle Ghost Reps',
    description: 'Available outside a Flow.',
    bindings: [{ key: 'g', modifier: 'mod' }],
  },
  {
    id: 'indent-outdent',
    group: 'Editor and coaching',
    displayKeys: ['Tab / Shift+Tab'],
    label: 'Indent or outdent',
    description: 'Adjust indentation in the recall editor.',
    bindings: [{ key: 'Tab' }, { key: 'Tab', shift: true }],
    editorKey: 'Tab',
  },
  {
    id: 'toggle-ai-completion',
    group: 'Editor and coaching',
    displayKeys: ['Mod', 'L'],
    label: 'Toggle AI completion',
    description: 'Show or hide inline code suggestions in the recall editor.',
    bindings: [{ key: 'l', modifier: 'mod' }],
  },
  {
    id: 'toggle-inline-feedback',
    group: 'Editor and coaching',
    displayKeys: ['Mod', 'I'],
    label: 'Toggle inline feedback',
    description: 'Currently disabled in this build.',
    bindings: [{ key: 'i', modifier: 'mod' }],
  },
]

const hotkeysById = new Map(hotkeyDefinitions.map((hotkey) => [hotkey.id, hotkey]))

const requireHotkey = (id: HotkeyId) => {
  const hotkey = hotkeysById.get(id)
  if (!hotkey) throw new Error(`Unknown hotkey: ${id}`)
  return hotkey
}

export const getHotkeyModifierLabel = (isMac: boolean) => isMac ? '⌘' : 'Ctrl'

export const getHotkeyDisplayKeys = (id: HotkeyId, isMac: boolean) => {
  const modifierLabel = getHotkeyModifierLabel(isMac)
  return requireHotkey(id).displayKeys.map((key) => key.replace(/\bMod\b/g, modifierLabel))
}

export const getEditorHotkeyKey = (id: 'next-targeted-line' | 'indent-outdent') => {
  const editorKey = requireHotkey(id).editorKey
  if (!editorKey) throw new Error(`Hotkey ${id} does not define an editor key`)
  return editorKey
}

export const matchesHotkey = (event: KeyboardEvent, id: HotkeyId) => {
  return requireHotkey(id).bindings.some((binding) => {
    const keyMatches = binding.key.length === 1
      ? event.key.toLowerCase() === binding.key.toLowerCase()
      : event.key === binding.key
    if (!keyMatches) return false
    if (binding.modifier === 'mod' && !(event.metaKey || event.ctrlKey)) return false
    if (binding.modifier === 'meta' && !event.metaKey) return false
    if (binding.shift && !event.shiftKey) return false
    return true
  })
}

export const getHotkeyReferenceGroups = (isMac: boolean) => {
  const groupTitles: HotkeyDefinition['group'][] = ['Navigation', 'Card modalities', 'Recall and Ghost Reps', 'Editor and coaching']

  return groupTitles.map((title) => ({
    title,
    hotkeys: hotkeyDefinitions
      .filter((hotkey) => hotkey.group === title)
      .map<PracticeHotkey>((hotkey) => ({
        id: hotkey.id,
        keys: getHotkeyDisplayKeys(hotkey.id, isMac),
        label: hotkey.label,
        description: hotkey.description,
        flowStage: hotkey.flowStage,
      })),
  }))
}
