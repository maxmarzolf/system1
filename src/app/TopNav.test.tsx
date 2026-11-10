import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import TopNav from './TopNav'
import { ThemeProvider } from './theme'

const renderNav = (path: string, props: Parameters<typeof TopNav>[0] = {}) =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <TopNav {...props} />
      </MemoryRouter>
    </ThemeProvider>,
  )

describe('TopNav', () => {
  it('underlines the current page only', () => {
    renderNav('/tune')
    expect(screen.getByRole('link', { name: 'Tune' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Admin' })).not.toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Journey' })).not.toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Journey' })).toHaveAttribute('href', '/')
  })

  it('lists the pages in order and marks Journey only on /', () => {
    renderNav('/')
    const links = screen.getAllByRole('link').filter((link) => link.classList.contains('navbar-dashboard'))
    expect(links.map((link) => link.textContent)).toEqual(['Practice', 'Journey', 'Dashboard', 'Tune', 'Evolve', 'Admin'])
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/practice', '/', '/dashboard', '/tune', '/evolve', '/admin'])
    expect(screen.getByRole('link', { name: 'Journey' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Practice' })).not.toHaveClass('active')
  })

  it('pins, goes solid and toggles the theme', async () => {
    const { container } = renderNav('/', { pinned: true, solid: true })
    expect(container.querySelector('nav')).toHaveClass('navbar-pinned', 'navbar-solid')
    const toggle = screen.getByRole('button', { name: /Switch theme/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.theme).toBe('light-high-contrast')
    await userEvent.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('dark-high-contrast')
  })

  it('shows the question type only when the page passes one', () => {
    const { unmount } = renderNav('/practice', { questionType: 'Ghost' })
    expect(screen.getByLabelText('Question type')).toHaveTextContent('Ghost')
    unmount()
    renderNav('/')
    expect(screen.queryByLabelText('Question type')).toBeNull()
    expect(screen.queryByText(/Auto \(/)).toBeNull()
  })

  it('slides the question type up or down with the motion it is given', () => {
    const { rerender } = renderNav('/practice', { questionType: 'Recall' })
    expect(screen.getByText('Recall')).not.toHaveClass('navbar-question-type-slide-up')
    rerender(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/practice']}>
          <TopNav questionType="MCQ" questionTypeMotion={{ direction: 'up', id: 1 }} />
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(screen.getByText('MCQ')).toHaveClass('navbar-question-type-slide-up')
    rerender(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/practice']}>
          <TopNav questionType="Recall" questionTypeMotion={{ direction: 'down', id: 2 }} />
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(screen.getByText('Recall')).toHaveClass('navbar-question-type-slide-down')
  })
})
