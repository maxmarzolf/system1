import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import TunePage from './TunePage'
import { CODE_EDITOR_TUNING_STORAGE_KEY, defaultCodeEditorTuning } from '@/shared/settings/codeEditorTuning'
import { ThemeProvider } from '@/app/theme'
import { mockFetch } from '@/test/fetch'

const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null')

const renderTune = () => {
  mockFetch([{ match: '/api/coach/provider-default', body: { provider: 'gemma' } }])
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/tune']}>
        <TunePage />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('TunePage', () => {
  it('keeps only personal preferences, saved as they change, and points to Admin for the rest', async () => {
    renderTune()
    expect(screen.queryByLabelText('Question type')).toBeNull()
    expect(screen.queryByText('Specimen')).toBeNull()
    expect(screen.queryByText('Submission')).toBeNull()
    expect(screen.getByRole('link', { name: /Admin → Settings/ })).toHaveAttribute('href', '/admin?view=settings')

    // Pick the last option of every select, and flip every toggle.
    for (const select of screen.getAllByRole('combobox') as HTMLSelectElement[]) {
      const last = select.options[select.options.length - 1].value
      await userEvent.selectOptions(select, last)
    }
    for (const checkbox of screen.getAllByRole('checkbox')) await userEvent.click(checkbox)
    expect(stored(CODE_EDITOR_TUNING_STORAGE_KEY)).toMatchObject({ language: 'rust', intellisense: false, aiCompletion: false })

    for (const reset of screen.getAllByRole('button', { name: /Reset/ })) await userEvent.click(reset)
    expect(stored(CODE_EDITOR_TUNING_STORAGE_KEY)).toMatchObject({ language: 'python', styleGuide: defaultCodeEditorTuning.styleGuide })
  })

  it('lists the hotkey reference', () => {
    renderTune()
    expect(screen.getByText('Card modalities')).toBeInTheDocument()
    expect(screen.getByText('Total Recall')).toBeInTheDocument()
  })
})
