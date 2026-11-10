import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Icon from './Icon'
import IconToggle from './IconToggle'
import Skeleton from './Skeleton'

describe('Icon', () => {
  it('draws on its own grid and stroke, sized by CSS unless a size is given', () => {
    const { container, rerender } = render(<Icon name="ghost" className="flow-ghost-icon" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '0 0 14 14')
    expect(svg).toHaveAttribute('stroke-width', '1.4')
    expect(svg).toHaveClass('flow-ghost-icon')
    expect(svg).not.toHaveAttribute('width')
    rerender(<Icon name="check" size={16} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '16')
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24')
  })
})

describe('IconToggle', () => {
  it('reflects its state in the class and ARIA attributes', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <IconToggle icon="flow" className="card-side-drawer-toggle" active={false} expanded={false} controls="panel" label="Show Flow" title="Flow" srLabel="Flow" onClick={onClick} />,
    )
    const button = screen.getByRole('button', { name: 'Show Flow' })
    expect(button).toHaveClass('card-side-drawer-toggle')
    expect(button).not.toHaveClass('active')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).not.toHaveAttribute('aria-pressed')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()
    rerender(<IconToggle icon="ghost" className="navbar-toggle" active pressed label="Turn off" title="Ghost" onClick={onClick} />)
    expect(screen.getByRole('button', { name: 'Turn off' })).toHaveClass('navbar-toggle active')
    expect(screen.getByRole('button', { name: 'Turn off' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Skeleton', () => {
  it('renders one placeholder line per width', () => {
    const { container } = render(<Skeleton lines={['w95 tall', 'w60']} />)
    expect([...container.querySelectorAll('.skeleton-line')].map((line) => line.className)).toEqual(['skeleton-line w95 tall', 'skeleton-line w60'])
  })
})
