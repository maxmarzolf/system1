import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import PageSweep from './PageSweep'
import { navPageIndex } from './navPages'
import { usePageHotkeys } from './usePageHotkeys'

function Harness() {
  usePageHotkeys()
  return (
    <>
      <output data-testid="path">{useLocation().pathname}</output>
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
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}
const doubleTap = (key: 'ArrowLeft' | 'ArrowRight') => [press(key), press(key)]
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
  it('walks the navbar order on a double-tapped Cmd/Ctrl + arrow and stops at the ends', () => {
    renderAt('/')
    press('ArrowRight')
    expect(path()).toBe('/')
    press('ArrowRight')
    expect(path()).toBe('/dashboard')
    doubleTap('ArrowLeft')
    doubleTap('ArrowLeft')
    expect(path()).toBe('/practice')
    doubleTap('ArrowLeft')
    expect(path()).toBe('/practice')

    press('ArrowRight', { metaKey: false, ctrlKey: true })
    press('ArrowRight', { metaKey: false, ctrlKey: true })
    expect(path()).toBe('/')
  })

  it('ignores other keys, modifiers and alternating arrows', () => {
    renderAt('/tune')
    press('ArrowRight')
    press('ArrowLeft')
    press('ArrowRight', { shiftKey: true })
    press('ArrowRight', { shiftKey: true })
    press('ArrowRight', { metaKey: false })
    press('ArrowRight', { metaKey: false })
    expect(path()).toBe('/tune')
  })

  it('blocks the browser Back shortcut outside fields but lets the caret move inside one', () => {
    renderAt('/tune')
    expect(press('ArrowLeft').defaultPrevented).toBe(true)
    const field = screen.getByLabelText('field')
    expect(press('ArrowRight', {}, field).defaultPrevented).toBe(false)
  })

  it('does nothing from a page outside the navbar', () => {
    renderAt('/somewhere')
    doubleTap('ArrowRight')
    expect(path()).toBe('/somewhere')
  })
})

describe('PageSweep', () => {
  it('sweeps in the direction the navbar moved', () => {
    renderAt('/tune')
    expect(screen.queryByTestId('page-sweep')).toBeNull()
    doubleTap('ArrowRight')
    expect(screen.getByTestId('page-sweep')).toHaveClass('page-sweep-right')
    doubleTap('ArrowLeft')
    expect(screen.getByTestId('page-sweep')).toHaveClass('page-sweep-left')
  })
})
