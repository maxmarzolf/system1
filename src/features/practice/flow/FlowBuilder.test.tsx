import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import FlowBuilder from './FlowBuilder'
import { DEFAULT_FLOW, type FlowConfig } from './practiceFlow'

function Harness({ initial, disabled = false, onChange }: { initial: FlowConfig; disabled?: boolean; onChange?: (config: FlowConfig) => void }) {
  const [config, setConfig] = useState(initial)
  return (
    <>
      <FlowBuilder config={config} disabled={disabled} onChange={(next) => { setConfig(next); onChange?.(next) }} />
      <output data-testid="config">{JSON.stringify(config)}</output>
    </>
  )
}

const current = () => JSON.parse(screen.getByTestId('config').textContent ?? '{}') as FlowConfig

const dataTransfer = () => ({ effectAllowed: '', setDragImage: vi.fn() })

describe('FlowBuilder', () => {
  it('switches modes and explains each', async () => {
    render(<Harness initial={DEFAULT_FLOW} />)
    expect(screen.getByText(/Uses results across all four modalities/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Random' }))
    expect(screen.getByText(/Each next rep is a surprise/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Custom sequence' }))
    expect(screen.getByText('5 reps per cycle')).toBeInTheDocument()
  })

  it('edits, adds, removes and reorders custom blocks', async () => {
    render(<Harness initial={{ ...DEFAULT_FLOW, mode: 'custom' }} />)
    await userEvent.selectOptions(screen.getByLabelText('Modality for block 1'), 'microdrill')
    expect(current().blocks[0].stage).toBe('microdrill')
    fireEvent.change(screen.getByLabelText('Reps for block 2'), { target: { value: '99' } })
    expect(current().blocks[1].count).toBe(20)
    fireEvent.change(screen.getByLabelText('Reps for block 2'), { target: { value: 'x' } })
    expect(current().blocks[1].count).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: '+ Add block' }))
    expect(current().blocks).toHaveLength(5)
    await userEvent.click(screen.getByRole('button', { name: 'Remove block 5' }))
    expect(current().blocks).toHaveLength(4)

    const items = screen.getAllByRole('listitem')
    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag block 1' }), { dataTransfer: dataTransfer() })
    expect(document.querySelector('.flow-block-drag-ghost')).not.toBeNull()
    fireEvent.dragOver(items[2])
    expect(items[2]).toHaveClass('is-drag-over')
    fireEvent.drop(items[2])
    expect(current().blocks.map((block) => block.stage)).toEqual(['ghost', 'multiple-choice', 'microdrill', 'microdrill'])
    expect(document.querySelector('.flow-block-drag-ghost')).toBeNull()

    fireEvent.dragStart(items[1], { dataTransfer: dataTransfer() })
    fireEvent.dragOver(items[1])
    fireEvent.drop(items[1])
    fireEvent.drop(items[0])
    fireEvent.dragEnd(items[0])
    expect(current().blocks.map((block) => block.stage)).toEqual(['ghost', 'multiple-choice', 'microdrill', 'microdrill'])
  })

  it('keeps at least one random stage enabled', async () => {
    render(<Harness initial={{ ...DEFAULT_FLOW, mode: 'random', randomStages: ['ghost', 'recall'] }} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ghost' }))
    expect(current().randomStages).toEqual(['recall'])
    expect(screen.getByRole('checkbox', { name: 'Recall' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: 'MCQ' }))
    expect(current().randomStages).toEqual(['recall', 'multiple-choice'])
  })

  it('locks editing while a flow runs and restarts tile animations', () => {
    vi.useFakeTimers()
    render(<Harness initial={{ ...DEFAULT_FLOW, mode: 'custom' }} disabled />)
    expect(screen.getByText('Stop the flow to edit its setup.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove block 1' })).toBeDisabled()
    act(() => vi.advanceTimersByTime(12_000))
    expect(document.querySelectorAll('.flow-block-tile').length).toBeGreaterThan(0)
    vi.useRealTimers()
  })
})
