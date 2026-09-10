import { FLOW_LABELS, FLOW_STAGES, expandFlow, type FlowConfig } from './practiceFlow'

export default function FlowBuilder({ config, onChange, disabled }: {
  config: FlowConfig; onChange: (config: FlowConfig) => void; disabled: boolean
}) {
  const updateBlock = (index: number, patch: Partial<FlowConfig['blocks'][number]>) => onChange({ ...config, blocks: config.blocks.map((block, i) => i === index ? { ...block, ...patch } : block) })
  const move = (index: number, offset: number) => {
    const blocks = [...config.blocks]
    ;[blocks[index], blocks[index + offset]] = [blocks[index + offset], blocks[index]]
    onChange({ ...config, blocks })
  }
  return (
    <fieldset className="flow-builder" disabled={disabled}>
      <legend>Build your flow</legend>
      <div className="flow-mode-picker" aria-label="Flow mode">
        {(['custom', 'random'] as const).map(mode => (
          <button key={mode} type="button" aria-pressed={config.mode === mode} onClick={() => onChange({ ...config, mode })}>
            {mode === 'custom' ? 'Custom sequence' : 'Random'}
          </button>
        ))}
      </div>
      {config.mode === 'custom' ? <>
        <p className="flow-builder-help">Set the order and reps. Your sequence repeats until you stop.</p>
        <ol className="flow-builder-blocks">
          {config.blocks.map((block, index) => (
            <li key={index} className="flow-builder-block">
              <span className="flow-block-index">{index + 1}</span>
              <select aria-label={`Modality for block ${index + 1}`} value={block.stage} onChange={event => updateBlock(index, { stage: event.target.value as typeof block.stage })}>
                {FLOW_STAGES.map(stage => <option key={stage} value={stage}>{FLOW_LABELS[stage]}</option>)}
              </select>
              <label className="flow-block-count"><input aria-label={`Reps for block ${index + 1}`} type="number" min={1} max={20} value={block.count} onChange={event => updateBlock(index, { count: Math.min(20, Math.max(1, Math.floor(Number(event.target.value) || 1))) })} /><span>reps</span></label>
              <div className="flow-block-actions">
                <button type="button" aria-label={`Move block ${index + 1} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</button>
                <button type="button" aria-label={`Move block ${index + 1} down`} disabled={disabled || index === config.blocks.length - 1} onClick={() => move(index, 1)}>↓</button>
                <button type="button" aria-label={`Remove block ${index + 1}`} disabled={disabled || config.blocks.length === 1} onClick={() => onChange({ ...config, blocks: config.blocks.filter((_, i) => i !== index) })}>×</button>
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
