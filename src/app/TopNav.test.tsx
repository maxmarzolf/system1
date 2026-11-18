import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import TopNav from './TopNav'
import { NavRevealProvider } from './NavRevealProvider'
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
    const links = screen.getAllByRole('link').filter((link) => link.classList.contains('navbar-page-link'))
    expect(links.map((link) => link.textContent)).toEqual(['Practice', 'Journey', 'Tune', 'Evolve', 'Admin'])
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/practice', '/', '/tune', '/evolve', '/admin'])
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

  it('reveals the page links on hover and keyboard focus', () => {
    const { container } = renderNav('/')
    const right = container.querySelector('.navbar-right') as HTMLDivElement
    const trigger = screen.getByRole('button', { name: /Pages/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.mouseEnter(right)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.mouseLeave(right)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.focus(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.blur(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('briefly reveals links after navigating to another page', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <NavRevealProvider>
            <Routes>
              <Route path="/" element={<TopNav />} />
              <Route path="/tune" element={<TopNav />} />
            </Routes>
            <Link to="/tune">Go to Tune</Link>
          </NavRevealProvider>
        </MemoryRouter>
      </ThemeProvider>,
    )

    const trigger = screen.getByRole('button', { name: /Pages/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(screen.getByRole('link', { name: 'Go to Tune' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Pages/ })).toHaveAttribute('aria-expanded', 'true'))
    expect(document.querySelector('.navbar-right')).toHaveClass('navbar-right-route-reveal')
    await waitFor(() => expect(screen.getByRole('button', { name: /Pages/ })).toHaveAttribute('aria-expanded', 'false'), { timeout: 3000 })
  })

})
