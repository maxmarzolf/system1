import { type ReactNode, useEffect, useState } from 'react'
import { defaultLiveCoachTuning, loadStoredLiveCoachTuning, saveStoredLiveCoachTuning } from './liveCoachTuning'
import type { LiveCoachTuning } from './liveCoachTuning'
import {
  defaultSubmissionTuning,
  loadStoredSubmissionTuning,
  saveStoredSubmissionTuning,
} from './submissionTuning'
import type { SubmissionTuning } from './submissionTuning'
import {
  defaultSpecimenTuning,
  loadStoredSpecimenTuning,
  saveStoredSpecimenTuning,
} from './specimenTuning'
import type { SpecimenTuning } from './specimenTuning'
import TopNav from './TopNav'

const trackedDimensions = [
  {
    title: 'Inputs and outputs',
    copy: 'Whether the submission keeps the same overall function purpose and return path.',
  },
  {
    title: 'State management',
    copy: 'Whether the important tracked state is still named or clearly implied.',
  },
  {
    title: 'Control flow',
    copy: 'Whether the main loop or branching structure stays intact.',
  },
  {
    title: 'Decision logic',
    copy: 'Whether the rule that makes the algorithm valid is preserved.',
  },
  {
    title: 'Answer update',
    copy: 'Whether the submission still says when the answer gets recorded.',
  },
]

type TuneSectionProps = {
  eyebrow: string
  title: string
  copy: string
  action?: ReactNode
  children: ReactNode
}

type SelectOption<T extends string> = {
  value: T
  label: string
}

type SelectControlProps<T extends string> = {
  label: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  description?: string
}

function TuneSection({ eyebrow, title, copy, action, children }: TuneSectionProps) {
  return (
    <section className="tune-section">
      <div className="tune-section-header">
        <div>
          <p className="tune-eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          <p className="tune-copy">{copy}</p>
        </div>
        {action ? <div className="tune-section-action">{action}</div> : null}
      </div>
      <div className="tune-section-body">{children}</div>
    </section>
  )
}

function SelectControl<T extends string>({ label, value, options, onChange, description }: SelectControlProps<T>) {
  return (
    <label className="tune-control">
      <span className="tune-control-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description ? <span className="tune-control-description">{description}</span> : null}
    </label>
  )
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <label className="tune-control tune-range-control">
      <span className="tune-control-row">
        <span className="tune-control-label">{label}</span>
        <strong>{value}{suffix}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function ToggleControl({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <label className="tune-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export default function TunePage() {
  const [liveCoachTuning, setLiveCoachTuning] = useState<LiveCoachTuning>(() => loadStoredLiveCoachTuning())
  const [submissionTuning, setSubmissionTuning] = useState<SubmissionTuning>(() => loadStoredSubmissionTuning())
  const [specimenTuning, setSpecimenTuning] = useState<SpecimenTuning>(() => loadStoredSpecimenTuning())

  useEffect(() => {
    saveStoredLiveCoachTuning(liveCoachTuning)
  }, [liveCoachTuning])

  useEffect(() => {
    saveStoredSubmissionTuning(submissionTuning)
  }, [submissionTuning])

  useEffect(() => {
    saveStoredSpecimenTuning(specimenTuning)
  }, [specimenTuning])

  const updateLiveCoachTuning = <K extends keyof LiveCoachTuning>(key: K, value: LiveCoachTuning[K]) => {
    setLiveCoachTuning((prev) => ({ ...prev, [key]: value }))
  }

  const updateSubmissionTuning = <K extends keyof SubmissionTuning>(key: K, value: SubmissionTuning[K]) => {
    setSubmissionTuning((prev) => ({ ...prev, [key]: value }))
  }

  const updateSpecimenTuning = <K extends keyof SpecimenTuning>(key: K, value: SpecimenTuning[K]) => {
    setSpecimenTuning((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="app app-tune">
      <TopNav />

      <section className="tune-surface">
        <div className="tune-hero">
          <div>
            <h2>Tune</h2>
            <p>Persistent settings for generated specimens, live feedback, and submission grading.</p>
          </div>
          <div className="tune-hero-meta" aria-label="Tune page behavior">
            <span>Auto-saves</span>
            <span>Applies next interaction</span>
          </div>
        </div>

        <div className="tune-layout">
          <aside className="tune-rail" aria-label="Tune sections">
            <a href="#specimen">Specimen</a>
            <a href="#live-coach">Live coach</a>
            <a href="#submission">Submission</a>
            <a href="#dimensions">Dimensions</a>
          </aside>

          <div className="tune-content">
            <TuneSection
              eyebrow="01"
              title="Specimen"
              copy="Shape the Python target generated for each question."
              action={(
                <button className="secondary tune-reset" type="button" onClick={() => setSpecimenTuning(defaultSpecimenTuning)}>
                  Reset
                </button>
              )}
            >
              <div className="tune-control-grid" id="specimen">
                <SelectControl
                  label="Type hints"
                  value={specimenTuning.typeHints}
                  onChange={(value) => updateSpecimenTuning('typeHints', value)}
                  options={[
                    { value: 'omit', label: 'Omit type hints' },
                    { value: 'include', label: 'Include type hints' },
                  ]}
                />
                <SelectControl
                  label="Comments"
                  value={specimenTuning.comments}
                  onChange={(value) => updateSpecimenTuning('comments', value)}
                  options={[
                    { value: 'omit', label: 'No comments in code' },
                    { value: 'brief', label: 'Brief invariant comments' },
                  ]}
                />
                <SelectControl
                  label="Variable names"
                  value={specimenTuning.variableNames}
                  onChange={(value) => updateSpecimenTuning('variableNames', value)}
                  description="Readable prefers names like val while keeping standard left and right."
                  options={[
                    { value: 'readable', label: 'Readable interview names' },
                    { value: 'concise', label: 'Concise pattern names' },
                    { value: 'descriptive', label: 'More descriptive names' },
                  ]}
                />
              </div>
            </TuneSection>

            <TuneSection
              eyebrow="02"
              title="Live Coach"
              copy="Control how often the coach intervenes and how specific it can be while you type."
              action={(
                <button className="secondary tune-reset" type="button" onClick={() => setLiveCoachTuning(defaultLiveCoachTuning)}>
                  Reset
                </button>
              )}
            >
              <div className="tune-split" id="live-coach">
                <div className="tune-control-grid">
                  <SelectControl
                    label="Focus mode"
                    value={liveCoachTuning.focusMode}
                    onChange={(value) => updateLiveCoachTuning('focusMode', value)}
                    options={[
                      { value: 'memorization', label: 'Memorization trainer' },
                      { value: 'interview', label: 'Interview coach' },
                    ]}
                  />
                  <SelectControl
                    label="Tone"
                    value={liveCoachTuning.tone}
                    onChange={(value) => updateLiveCoachTuning('tone', value)}
                    options={[
                      { value: 'calm', label: 'Calm' },
                      { value: 'direct', label: 'Direct' },
                      { value: 'technical', label: 'Technical' },
                    ]}
                  />
                  <SelectControl
                    label="Specificity"
                    value={liveCoachTuning.specificitySource}
                    onChange={(value) => updateLiveCoachTuning('specificitySource', value)}
                    options={[
                      { value: 'time-and-quality', label: 'Time + live answer quality' },
                      { value: 'time-only', label: 'Time only' },
                    ]}
                  />
                  <SelectControl
                    label="Feedback frequency"
                    value={liveCoachTuning.feedbackFrequency}
                    onChange={(value) => updateLiveCoachTuning('feedbackFrequency', value)}
                    options={[
                      { value: 'more-often', label: 'More often' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'less-often', label: 'Less often' },
                    ]}
                  />
                  <SelectControl
                    label="Canonical answer reveal"
                    value={liveCoachTuning.canonicalAnswerStage}
                    onChange={(value) => updateLiveCoachTuning('canonicalAnswerStage', value)}
                    options={[
                      { value: 'mid', label: 'Mid' },
                      { value: 'late', label: 'Late' },
                      { value: 'very-late', label: 'Very late' },
                    ]}
                  />
                  <RangeControl
                    label="Repeated drift threshold"
                    value={liveCoachTuning.driftThresholdAttempts}
                    min={1}
                    max={5}
                    step={1}
                    suffix=" attempts"
                    onChange={(value) => updateLiveCoachTuning('driftThresholdAttempts', value)}
                  />
                  <RangeControl
                    label="Drill-down stall threshold"
                    value={liveCoachTuning.stallThresholdSeconds}
                    min={15}
                    max={120}
                    step={5}
                    suffix="s"
                    onChange={(value) => updateLiveCoachTuning('stallThresholdSeconds', value)}
                  />
                </div>

                <div className="tune-toggle-list" aria-label="Live coach toggles">
                  <ToggleControl
                    checked={liveCoachTuning.enabled}
                    onChange={(value) => updateLiveCoachTuning('enabled', value)}
                    label="Enable live feedback requests"
                  />
                  <ToggleControl
                    checked={liveCoachTuning.singleIssue}
                    onChange={(value) => updateLiveCoachTuning('singleIssue', value)}
                    label="Keep live feedback to one issue"
                  />
                  <ToggleControl
                    checked={liveCoachTuning.allowExactEditsWhenStuck}
                    onChange={(value) => updateLiveCoachTuning('allowExactEditsWhenStuck', value)}
                    label="Allow exact edits only when stalled"
                  />
                  <ToggleControl
                    checked={liveCoachTuning.showPatternNames}
                    onChange={(value) => updateLiveCoachTuning('showPatternNames', value)}
                    label="Let the coach name patterns explicitly"
                  />
                  <ToggleControl
                    checked={liveCoachTuning.affirmationMode === 'stable-only'}
                    onChange={(value) => updateLiveCoachTuning('affirmationMode', value ? 'stable-only' : 'never')}
                    label="Show affirmation only when stable work is present"
                  />
                </div>
              </div>
            </TuneSection>

            <TuneSection
              eyebrow="03"
              title="Submission"
              copy="Preserve the algorithm first, then tighten contract drift and wording as secondary signals."
              action={(
                <button className="secondary tune-reset" type="button" onClick={() => setSubmissionTuning(defaultSubmissionTuning)}>
                  Reset
                </button>
              )}
            >
              <div className="tune-split" id="submission">
                <div className="tune-control-grid tune-control-grid-compact">
                  <SelectControl
                    label="Grading mode"
                    value={submissionTuning.gradingMode}
                    onChange={(value) => updateSubmissionTuning('gradingMode', value)}
                    options={[
                      { value: 'core-logic', label: 'Core logic first' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'strict', label: 'Strict template match' },
                    ]}
                  />
                  <SelectControl
                    label="Contract strictness"
                    value={submissionTuning.contractStrictness}
                    onChange={(value) => updateSubmissionTuning('contractStrictness', value)}
                    options={[
                      { value: 'light', label: 'Light' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'strict', label: 'Strict' },
                    ]}
                  />
                </div>
                <div className="tune-toggle-list" aria-label="Submission toggles">
                  <ToggleControl
                    checked={submissionTuning.rewardEquivalentPhrasing}
                    onChange={(value) => updateSubmissionTuning('rewardEquivalentPhrasing', value)}
                    label="Reward equivalent phrasing like re-calculate vs update"
                  />
                  <ToggleControl
                    checked={submissionTuning.requireAnswerStep}
                    onChange={(value) => updateSubmissionTuning('requireAnswerStep', value)}
                    label="Require the answer-recording step for a sound grade"
                  />
                  <ToggleControl
                    checked={submissionTuning.allowExtraParameters}
                    onChange={(value) => updateSubmissionTuning('allowExtraParameters', value)}
                    label="Treat added parameters as a minor deviation"
                  />
                </div>
              </div>
            </TuneSection>

            <TuneSection
              eyebrow="04"
              title="Tracked Dimensions"
              copy="Signals the Signal Assessor checks for submitted attempts."
            >
              <div className="tune-dimension-list" id="dimensions">
                {trackedDimensions.map((dimension) => (
                  <div key={dimension.title} className="tune-dimension-row">
                    <strong>{dimension.title}</strong>
                    <span>{dimension.copy}</span>
                  </div>
                ))}
              </div>
              <p className="tune-footnote">
                Full-template grading also tracks syntax validity, indentation drift, early line drift, and omitted
                versus extra lines.
              </p>
            </TuneSection>
          </div>
        </div>
      </section>
    </div>
  )
}
