import { describe, expect, it } from 'vitest'
import { getEditorHotkeyKey, getHotkeyDisplayKeys, getHotkeyModifierLabel, getHotkeyReferenceGroups, matchesHotkey } from './hotkeys'

describe('hotkeys', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

  it('labels the modifier per platform', () => {
    expect(getHotkeyModifierLabel(true)).toBe('⌘')
    expect(getHotkeyDisplayKeys('flow-full-recall', false)).toEqual(['Ctrl', 'D'])
    expect(getEditorHotkeyKey('indent-outdent')).toBe('Tab')
    expect(() => getEditorHotkeyKey('toggle-ghost-reps' as never)).toThrow('does not define an editor key')
    expect(() => getHotkeyDisplayKeys('nope' as never, true)).toThrow('Unknown hotkey')
  })

  it('matches key, modifier and shift bindings', () => {
    expect(matchesHotkey(key({ key: 'D', metaKey: true }), 'flow-full-recall')).toBe(true)
    expect(matchesHotkey(key({ key: 'd', ctrlKey: true }), 'flow-full-recall')).toBe(true)
    expect(matchesHotkey(key({ key: 'd' }), 'flow-full-recall')).toBe(false)
    expect(matchesHotkey(key({ key: 'x', metaKey: true }), 'flow-full-recall')).toBe(false)
    expect(matchesHotkey(key({ key: 'Enter' }), 'next-targeted-line')).toBe(true)
    expect(matchesHotkey(key({ key: 'Tab', shiftKey: true }), 'indent-outdent')).toBe(true)
    expect(matchesHotkey(key({ key: 'ArrowLeft', metaKey: true }), 'move-pages')).toBe(false)
  })

  it('groups the reference sheet', () => {
    const groups = getHotkeyReferenceGroups(true)
    expect(groups.map((group) => group.title)).toEqual(['Navigation', 'Card modalities', 'Recall and Ghost Reps', 'Editor and coaching'])
    expect(groups[0].hotkeys[0]).toMatchObject({ id: 'move-pages', keys: ['⌘ + ← ← / ⌘ + → →'] })
    expect(groups[1].hotkeys[0]).toMatchObject({ keys: ['⌘', 'D'], flowStage: 'recall' })
  })
})
