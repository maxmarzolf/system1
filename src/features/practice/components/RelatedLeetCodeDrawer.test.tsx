import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RelatedLeetCodeDrawer from './RelatedLeetCodeDrawer'

describe('RelatedLeetCodeDrawer', () => {
  it('lists problems and closes', async () => {
    const onClose = vi.fn()
    render(
      <RelatedLeetCodeDrawer
        open
        onClose={onClose}
        relatedSet={{ heading: 'Windows', description: 'desc', problems: [{ id: 3, title: 'Longest Substring' }] } as never}
      />,
    )
    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getByLabelText('Related LeetCode questions')).toHaveClass('related-problems-drawer-open')
    await userEvent.click(screen.getByRole('button', { name: 'Close related problems drawer' }))
    expect(onClose).toHaveBeenCalled()
  })
})
