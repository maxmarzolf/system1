import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NumberControl, SelectControl, ToggleControl, TuneSection } from './settingControls'

describe('tune controls', () => {
  it('wires section, select, toggle and number controls', async () => {
    const onSelect = vi.fn()
    const onToggle = vi.fn()
    const onNumber = vi.fn()
    render(
      <TuneSection eyebrow="01" title="Section" copy="copy" action={<button type="button">act</button>}>
        <SelectControl label="Mode" value="a" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} onChange={onSelect} description="pick" />
        <ToggleControl label="On" checked={false} onChange={onToggle} />
        <NumberControl label="Count" value={3} min={1} max={9} onChange={onNumber} description="how many" />
      </TuneSection>,
    )
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b')
    expect(onSelect).toHaveBeenCalledWith('b')
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith(true)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } })
    expect(onNumber).toHaveBeenLastCalledWith(7)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    expect(onNumber).toHaveBeenLastCalledWith(1)
    expect(screen.getByText('act')).toBeInTheDocument()
    expect(screen.getByText('how many')).toBeInTheDocument()
  })

  it('omits optional parts', () => {
    render(
      <TuneSection eyebrow="e" title="t" copy="c">
        <SelectControl label="Mode" value="a" options={[{ value: 'a', label: 'A' }]} onChange={() => {}} />
        <NumberControl label="Count" value={1} min={1} max={2} onChange={() => {}} />
      </TuneSection>,
    )
    expect(document.querySelector('.tune-section-action')).toBeNull()
    expect(document.querySelector('.tune-control-description')).toBeNull()
  })
})
