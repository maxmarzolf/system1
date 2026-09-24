import { useEffect, useRef, useState, type DragEvent } from 'react'
import { FLOW_LABELS, FLOW_STAGES, expandFlow, type FlowConfig } from './practiceFlow'

const FLOW_TILE_COLUMNS = 160
const FLOW_TILE_ROWS = 8
const FLOW_TILE_COUNT = FLOW_TILE_COLUMNS * FLOW_TILE_ROWS

const seededRandom = (blockIndex: number, tileIndex: number, salt: number) => {
  const value = Math.sin((tileIndex + 1) * (12.9898 + salt) + (blockIndex + 1) * (78.233 + salt)) * 43758.5453
  return value - Math.floor(value)
}

const tileTiming = (blockIndex: number, tileIndex: number) => ({
  delay: 0.35 + seededRandom(blockIndex, tileIndex, 0) * 5.8,
  duration: 3.5 + seededRandom(blockIndex, tileIndex, 19) * 2,
})

export default function FlowBuilder({ config, onChange, disabled }: {
  config: FlowConfig; onChange: (config: FlowConfig) => void; disabled: boolean
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [tileCycle, setTileCycle] = useState(0)
  const dragGhostRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const cycle = window.setInterval(() => setTileCycle((value) => value + 1), 12000)
    return () => window.clearInterval(cycle)
  }, [])
  const updateBlock = (index: number, patch: Partial<FlowConfig['blocks'][number]>) => onChange({ ...config, blocks: config.blocks.map((block, i) => i === index ? { ...block, ...patch } : block) })
  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const blocks = [...config.blocks]
    const [block] = blocks.splice(fromIndex, 1)
    blocks.splice(toIndex, 0, block)
    onChange({ ...config, blocks })
  }
  const clearDragState = () => {
    dragGhostRef.current?.remove()
    dragGhostRef.current = null
    setDraggedIndex(null)
    setDragOverIndex(null)
  }
  const handleDragStart = (index: number, event: DragEvent<HTMLElement>) => {
    const block = config.blocks[index]
    const ghost = document.createElement('div')
    ghost.className = 'flow-block-drag-ghost'
    ghost.textContent = `${FLOW_LABELS[block.stage]}  ${block.count} reps`
    document.body.appendChild(ghost)
    dragGhostRef.current = ghost
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setDragImage(ghost, 24, 24)
    setDraggedIndex(index)
  }
  return (
    <fieldset className="flow-builder" disabled={disabled}>
      <legend>Build your flow</legend>
      <div className="flow-mode-picker" aria-label="Flow mode">
        {(['adaptive', 'custom', 'random'] as const).map(mode => (
          <button key={mode} type="button" aria-pressed={config.mode === mode} onClick={() => onChange({ ...config, mode })}>
            {mode === 'adaptive' ? 'Adaptive' : mode === 'custom' ? 'Custom sequence' : 'Random'}
          </button>
        ))}
      </div>
      {config.mode === 'adaptive' ? (
        <p className="flow-builder-help">Uses results across all four modalities to remediate weaknesses, raise the challenge, and advance after mastery.</p>
      ) : config.mode === 'custom' ? <>
        <p className="flow-builder-help">Set the order and reps. Your sequence repeats until you stop.</p>
        <ol className="flow-builder-blocks">
          {config.blocks.map((block, index) => (
            <li
              key={index}
              className={`flow-builder-block flow-stage-${block.stage}${draggedIndex === index ? ' is-dragged' : ''}${dragOverIndex === index && draggedIndex !== index ? ' is-drag-over' : ''}`}
              draggable={!disabled}
              onDragStart={(event) => handleDragStart(index, event)}
              onDragOver={(event) => {
                event.preventDefault()
                if (draggedIndex !== null && draggedIndex !== index) setDragOverIndex(index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (draggedIndex !== null) reorder(draggedIndex, index)
                clearDragState()
              }}
              onDragEnd={clearDragState}
            >
              {block.stage === 'microdrill' && (
                <div className="flow-block-tiles" key={`${index}-${tileCycle}`} aria-hidden="true">
                  {Array.from({ length: FLOW_TILE_COUNT }, (_, tileIndex) => (
                    (() => {
                      const timing = tileTiming(index, tileIndex)
                      return (
                        <span
                          key={tileIndex}
                          className="flow-block-tile"
                          style={{
                            left: `${(tileIndex % FLOW_TILE_COLUMNS) / (FLOW_TILE_COLUMNS - 1) * 100}%`,
                            top: `${Math.floor(tileIndex / FLOW_TILE_COLUMNS) / (FLOW_TILE_ROWS - 1) * 100}%`,
                            animationDelay: `${timing.delay}s`,
                            animationDuration: `${timing.duration}s`,
                          }}
                        />
                      )
                    })()
                  ))}
                </div>
              )}
              {block.stage === 'recall' && (
                <div className="flow-recall-scene" aria-hidden="true">
                  <div className="flow-recall-stickman">
                    <span className="flow-recall-head" />
                    <span className="flow-recall-body" />
                    <span className="flow-recall-arm flow-recall-arm-left" />
                    <span className="flow-recall-arm flow-recall-arm-right" />
                    <span className="flow-recall-leg flow-recall-leg-left" />
                    <span className="flow-recall-leg flow-recall-leg-right" />
                  </div>
                  <span className="flow-recall-finish-line" />
                </div>
              )}
              <div className="flow-block-drag-zone">
                <button
                  type="button"
                  className="flow-block-drag-handle"
                  aria-label={`Drag block ${index + 1}`}
                  title="Drag to reorder"
                  draggable={!disabled}
                  onDragStart={(event) => {
                    event.stopPropagation()
                    handleDragStart(index, event)
                  }}
                >
                  <span className="flow-block-hamburger" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
              </div>
              <div className="flow-block-fields">
                <div className="flow-block-field">
                  <select aria-label={`Modality for block ${index + 1}`} value={block.stage} onChange={event => updateBlock(index, { stage: event.target.value as typeof block.stage })}>
                    {FLOW_STAGES.map(stage => <option key={stage} value={stage}>{FLOW_LABELS[stage]}</option>)}
                  </select>
                </div>
                <label className="flow-block-field flow-block-count"><input aria-label={`Reps for block ${index + 1}`} type="number" min={1} max={20} value={block.count} onChange={event => updateBlock(index, { count: Math.min(20, Math.max(1, Math.floor(Number(event.target.value) || 1))) })} /><span>reps</span></label>
              </div>
              <div className="flow-block-remove-zone">
                <button className="flow-block-remove" type="button" aria-label={`Remove block ${index + 1}`} disabled={disabled || config.blocks.length === 1} onClick={() => onChange({ ...config, blocks: config.blocks.filter((_, i) => i !== index) })}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4.5 7.5h15" />
                    <path d="M9 7.5V5.25h6V7.5M6.75 7.5l.75 12h9l.75-12M10 11v5.25M14 11v5.25" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ol>
        <div className="flow-builder-footer">
          <button type="button" disabled={disabled || config.blocks.length >= 20} onClick={() => onChange({ ...config, blocks: [...config.blocks, { stage: 'recall', count: 1 }] })}>+ Add block</button>
          <span>{expandFlow(config.blocks).length} reps per cycle</span>
        </div>
      </> : <>
        <p className="flow-builder-help">Each next rep is a surprise. Repeats are allowed; choose which modalities can appear.</p>
        <div className="flow-random-options">
          {FLOW_STAGES.map(stage => <label key={stage}>
            <input type="checkbox" checked={config.randomStages.includes(stage)} disabled={disabled || (config.randomStages.length === 1 && config.randomStages.includes(stage))} onChange={event => onChange({ ...config, randomStages: event.target.checked ? [...config.randomStages, stage] : config.randomStages.filter(item => item !== stage) })} />
            {FLOW_LABELS[stage]}
          </label>)}
        </div>
      </>}
      {disabled && <p className="flow-builder-help">Stop the flow to edit its setup.</p>}
    </fieldset>
  )
}
