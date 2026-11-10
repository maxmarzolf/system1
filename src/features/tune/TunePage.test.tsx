import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import TunePage from './TunePage'
import { CODE_EDITOR_TUNING_STORAGE_KEY, defaultCodeEditorTuning } from '@/shared/settings/codeEditorTuning'
import { GOOGLE_PLAYLIST_TUNING_STORAGE_KEY } from '@/shared/settings/googlePlaylistTuning'
import { MCQ_TUNING_STORAGE_KEY } from '@/shared/settings/mcqTuning'
import { SPECIMEN_TUNING_STORAGE_KEY, defaultSpecimenTuning } from '@/shared/settings/specimenTuning'
import { SUBMISSION_TUNING_STORAGE_KEY, defaultSubmissionTuning } from '@/shared/settings/submissionTuning'
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
  it('saves every setting as it changes and resets each section', async () => {
    renderTune()
    expect(screen.queryByLabelText('Question type')).toBeNull()

    // Pick the last option of every select.
    for (const select of screen.getAllByRole('combobox') as HTMLSelectElement[]) {
      const last = select.options[select.options.length - 1].value
      await userEvent.selectOptions(select, last)
    }
    // Flip every toggle.
    for (const checkbox of screen.getAllByRole('checkbox')) await userEvent.click(checkbox)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '99' } })

    expect(stored(SPECIMEN_TUNING_STORAGE_KEY)).not.toEqual(defaultSpecimenTuning)
    expect(stored(CODE_EDITOR_TUNING_STORAGE_KEY)).toMatchObject({ language: 'rust', intellisense: false, aiCompletion: false })
    expect(stored(SUBMISSION_TUNING_STORAGE_KEY)).not.toEqual(defaultSubmissionTuning)
    expect(stored(MCQ_TUNING_STORAGE_KEY)).toMatchObject({ flowMode: 'progressive', questionCount: 30 })
    expect(stored(GOOGLE_PLAYLIST_TUNING_STORAGE_KEY).order).toBeTruthy()

    for (const reset of screen.getAllByRole('button', { name: /Reset/ })) await userEvent.click(reset)
    expect(stored(SPECIMEN_TUNING_STORAGE_KEY)).toEqual(defaultSpecimenTuning)
    expect(stored(CODE_EDITOR_TUNING_STORAGE_KEY)).toMatchObject({ language: 'python', styleGuide: defaultCodeEditorTuning.styleGuide })
    expect(stored(SUBMISSION_TUNING_STORAGE_KEY)).toEqual(defaultSubmissionTuning)
    expect(stored(MCQ_TUNING_STORAGE_KEY).questionCount).toBe(5)
  })

  it('lists the hotkey reference', () => {
    renderTune()
    expect(screen.getByText('Card modalities')).toBeInTheDocument()
    expect(screen.getByText('Recall from right')).toBeInTheDocument()
  })
})
