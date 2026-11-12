import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import PageSweep from './PageSweep'
import { navPageIndex } from './navPages'
import { usePageHotkeys } from './usePageHotkeys'

function Harness() {
  usePageHotkeys()
  const location = useLocation()
  return (
    <>
      <output data-testid="path">{location.pathname}</output>
      <output data-testid="arrival">{location.state?.startTotalRecall ? 'start' : 'normal'}</output>
      <input aria-label="field" />
      <PageSweep />
    </>
  )
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>,
  )

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, metaKey: true, ...init })
  act(() => target.dispatchEvent(event))
  return event
}
const path = () => screen.getByTestId('path').textContent

describe('navPageIndex', () => {
  it('finds a page by path, ignoring a trailing slash', () => {
    expect(navPageIndex('/practice')).toBe(0)
    expect(navPageIndex('/')).toBe(1)
    expect(navPageIndex('/admin/')).toBe(5)
    expect(navPageIndex('/nowhere')).toBe(-1)
  })
})

describe('usePageHotkeys', () => {
  it('walks left with Cmd+A and wraps from Practice to Admin', () => {
    renderAt('/dashboard')
    for (const expected of ['/', '/practice', '/admin', '/evolve', '/tune', '/dashboard']) {
      expect(press('a').defaultPrevented).toBe(true)
      expect(path()).toBe(expected)
    }
  })

  it('walks right with Cmd+D and wraps from Admin to Practice', () => {
    renderAt('/dashboard')
    for (const expected of ['/tune', '/evolve', '/admin', '/practice', '/', '/dashboard']) {
      expect(press('D').defaultPrevented).toBe(true)
      expect(path()).toBe(expected)
    }
  })

  it('opens Total Recall from every other page with Cmd+Enter', () => {
    for (const source of ['/', '/dashboard', '/tune', '/evolve', '/admin', '/elsewhere']) {
      const { unmount } = renderAt(source)
      expect(press('Enter').defaultPrevented).toBe(true)
      expect(path()).toBe('/practice')
      expect(screen.getByTestId('arrival')).toHaveTextContent('start')
      unmount()
    }
  })

  it('uses Ctrl+Enter too, even from a field, but leaves Practice to its own shortcut', () => {
    const { unmount } = renderAt('/tune')
    expect(press('Enter', { metaKey: false, ctrlKey: true }, screen.getByLabelText('field')).defaultPrevented).toBe(true)
    expect(path()).toBe('/practice')
    unmount()
    renderAt('/practice')
    expect(press('Enter').defaultPrevented).toBe(false)
    expect(press('Enter', { shiftKey: true }).defaultPrevented).toBe(false)
    expect(path()).toBe('/practice')
  })

  it('accepts Ctrl, but leaves modified letters in editable fields alone', () => {
    renderAt('/tune')
    const field = screen.getByLabelText('field')
    expect(press('a', {}, field).defaultPrevented).toBe(false)
    expect(press('d', {}, field).defaultPrevented).toBe(false)
    expect(path()).toBe('/tune')
    press('d', { metaKey: false, ctrlKey: true })
    expect(path()).toBe('/evolve')
  })

  it('ignores other keys and modifiers', () => {
    renderAt('/tune')
    press('a', { shiftKey: true })
    press('d', { altKey: true })
    press('d', { metaKey: false })
    press('ArrowRight')
    press('w')
    expect(path()).toBe('/tune')
  })

  it('does nothing from a page outside the navbar', () => {
    renderAt('/somewhere')
    expect(press('d').defaultPrevented).toBe(false)
    expect(path()).toBe('/somewhere')
  })
})

describe('PageSweep', () => {
  it('uses the key direction, including at the wrap', () => {
    renderAt('/admin')
    press('d')
    expect(screen.getByTestId('page-sweep')).toHaveClass('page-sweep-right')
    press('a')
    expect(screen.getByTestId('page-sweep')).toHaveClass('page-sweep-left')
  })
})
