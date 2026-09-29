export type PracticeFlowStage = 'recall' | 'ghost' | 'multiple-choice' | 'microdrill'

export type HotkeyId =
  | 'flow-full-recall'
  | 'flow-targeted-ghost'
  | 'flow-targeted-mcq'
  | 'flow-targeted-microdrill'
  | 'primary-card-action'
  | 'next-targeted-line'
  | 'toggle-ghost-reps'
  | 'move-cards'
  | 'indent-outdent'
  | 'stuck-hint'
  | 'toggle-live-feedback'
  | 'toggle-inline-feedback'

type HotkeyBinding = {
  key: string
  modifier?: 'mod' | 'meta'
  shift?: boolean
}

type HotkeyDefinition = {
  id: HotkeyId
  group: 'Card modalities' | 'Recall and Ghost Reps' | 'Editor and coaching'
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
    id: 'flow-full-recall',
    group: 'Card modalities',
    displayKeys: ['Mod', 'D'],
    label: 'Recall from right',
    description: 'Bring Recall in from the right, anchored to the current card.',
    bindings: [{ key: 'd', modifier: 'mod' }],
    flowStage: 'recall',
  },
  {
    id: 'flow-targeted-ghost',
    group: 'Card modalities',
    displayKeys: ['Mod', 'W'],
    label: 'Ghost from top',
    description: 'Drop Ghost in from the top, anchored to the current card.',
    bindings: [{ key: 'w', modifier: 'mod' }],
    flowStage: 'ghost',
  },
  {
    id: 'flow-targeted-mcq',
    group: 'Card modalities',
    displayKeys: ['Mod', 'A'],
    label: 'MCQ from left',
    description: 'Bring MCQ in from the left, anchored to the current card.',
    bindings: [{ key: 'a', modifier: 'mod' }],
    flowStage: 'multiple-choice',
  },
  {
    id: 'flow-targeted-microdrill',
    group: 'Card modalities',
    displayKeys: ['Mod', 'S'],
    label: 'Microdrill from bottom',
    description: 'Raise Microdrill from the bottom, anchored to the current card.',
    bindings: [{ key: 's', modifier: 'mod' }],
    flowStage: 'microdrill',
  },
  {
    id: 'primary-card-action',
    group: 'Card modalities',
    displayKeys: ['Mod', 'Enter'],
    label: 'Primary card action',
    description: 'Activate the bottom-right card button, such as Start, Submit, or Next.',
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
    id: 'move-cards',
    group: 'Recall and Ghost Reps',
    displayKeys: ['Mod + ← ← / Mod + → →'],
    label: 'Move cards',
    description: 'Double-tap the modified arrow shortcut to move between cards outside a Flow.',
    bindings: [],
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
    id: 'stuck-hint',
    group: 'Editor and coaching',
    displayKeys: ['Mod', 'Shift', 'H'],
    label: 'Stuck hint',
    description: 'Currently unavailable while live feedback is disabled.',
    bindings: [{ key: 'h', modifier: 'meta', shift: true }],
  },
  {
    id: 'toggle-live-feedback',
    group: 'Editor and coaching',
    displayKeys: ['Mod', 'L'],
    label: 'Toggle live feedback',
    description: 'Currently disabled in this build.',
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
  const groupTitles: HotkeyDefinition['group'][] = ['Card modalities', 'Recall and Ghost Reps', 'Editor and coaching']

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
