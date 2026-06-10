export type PracticeFlowStage = 'recall' | 'ghost' | 'multiple-choice'

export type HotkeyId =
  | 'flow-full-recall'
  | 'flow-targeted-ghost'
  | 'flow-targeted-mcq'
  | 'primary-recall-action'
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
  group: 'Flow overrides' | 'Recall and Ghost Reps' | 'Editor and coaching'
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
    group: 'Flow overrides',
    displayKeys: ['Mod', 'Shift', 'F'],
    label: 'Full recall',
    description: 'Run a new full recall and replace the targeted lines on submit.',
    bindings: [{ key: 'f', modifier: 'mod', shift: true }],
    flowStage: 'recall',
  },
  {
    id: 'flow-targeted-ghost',
    group: 'Flow overrides',
    displayKeys: ['Mod', 'Shift', 'G'],
    label: 'Targeted Ghost Reps',
    description: 'Return to Ghost Reps for the current targeted lines.',
    bindings: [{ key: 'g', modifier: 'mod', shift: true }],
    flowStage: 'ghost',
  },
  {
    id: 'flow-targeted-mcq',
    group: 'Flow overrides',
    displayKeys: ['Mod', 'Shift', 'M'],
    label: 'Targeted MCQ',
    description: 'Jump to targeted questions while preserving flow progress.',
    bindings: [{ key: 'm', modifier: 'mod', shift: true }],
    flowStage: 'multiple-choice',
  },
  {
    id: 'primary-recall-action',
    group: 'Recall and Ghost Reps',
    displayKeys: ['Mod', 'Enter'],
    label: 'Start, submit, or repeat',
    description: 'Uses the primary recall or Ghost Rep action.',
    bindings: [{ key: 'Enter', modifier: 'mod' }],
    editorKey: 'Mod-Enter',
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
    displayKeys: ['Mod', '← / →'],
    label: 'Move cards',
    description: 'Move between cards anytime outside a Flow.',
    bindings: [
      { key: 'ArrowLeft', modifier: 'mod' },
      { key: 'ArrowRight', modifier: 'mod' },
    ],
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
  return requireHotkey(id).displayKeys.map((key) => key === 'Mod' ? modifierLabel : key)
}

export const formatHotkey = (id: HotkeyId, isMac: boolean) => getHotkeyDisplayKeys(id, isMac).join('+')

export const getEditorHotkeyKey = (id: 'primary-recall-action' | 'next-targeted-line' | 'indent-outdent') => {
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
  const groupTitles: HotkeyDefinition['group'][] = ['Flow overrides', 'Recall and Ghost Reps', 'Editor and coaching']

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
