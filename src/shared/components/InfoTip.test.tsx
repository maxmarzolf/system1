import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import InfoTip from './InfoTip'

describe('InfoTip', () => {
  it('opens on click, closes on Escape or an outside click', async () => {
    render(
      <div>
        <InfoTip label="weight">How much it counts.</InfoTip>
        <button type="button">outside</button>
      </div>,
    )
    const button = screen.getByRole('button', { name: 'About weight' })
    await userEvent.click(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('How much it counts.')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(button).toHaveFocus()
    await userEvent.click(button)
    await userEvent.keyboard('a')
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('tooltip'))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shifts the bubble left when it would overflow the window', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 900 } as DOMRect)
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000)
    render(<InfoTip label="x">tip</InfoTip>)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('tooltip').style.left).toBe('-312px')
  })

  it('does not toggle a surrounding label control', async () => {
    const onChange = vi.fn()
    render(
      <label>
        <input type="checkbox" onChange={onChange} />
        <InfoTip label="box">tip</InfoTip>
      </label>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'About box' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
