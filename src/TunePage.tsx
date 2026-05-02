import { useEffect, useState } from 'react'
import { defaultLiveCoachTuning, loadStoredLiveCoachTuning, saveStoredLiveCoachTuning } from './liveCoachTuning'
import type { LiveCoachTuning } from './liveCoachTuning'
import {
  defaultSubmissionTuning,
  loadStoredSubmissionTuning,
  saveStoredSubmissionTuning,
} from './submissionTuning'
import type { SubmissionTuning } from './submissionTuning'
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

export default function TunePage() {
  const [liveCoachTuning, setLiveCoachTuning] = useState<LiveCoachTuning>(() => loadStoredLiveCoachTuning())
  const [submissionTuning, setSubmissionTuning] = useState<SubmissionTuning>(() => loadStoredSubmissionTuning())

  useEffect(() => {
    saveStoredLiveCoachTuning(liveCoachTuning)
  }, [liveCoachTuning])

  useEffect(() => {
    saveStoredSubmissionTuning(submissionTuning)
  }, [submissionTuning])

  const updateLiveCoachTuning = <K extends keyof LiveCoachTuning>(key: K, value: LiveCoachTuning[K]) => {
    setLiveCoachTuning((prev) => ({ ...prev, [key]: value }))
  }

  const updateSubmissionTuning = <K extends keyof SubmissionTuning>(key: K, value: SubmissionTuning[K]) => {
    setSubmissionTuning((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="app">
      <TopNav />

      <section className="card">
        <div className="card-header coach-tuning-page-header">
          <div>
            <h2>Tune</h2>
            <p className="difficulty">Persistent settings</p>
            <p className="hint coach-tuning-page-intro">
              Live coach and submission grading settings save immediately and apply to the next relevant interaction.
            </p>
          </div>
        </div>

        <div className="panel coach-tuning-panel">
          <div className="coach-tuning-header">
            <div>
              <h3>Live Coach Controls</h3>
              <p className="hint" style={{ marginTop: '0.35rem' }}>
                Use these controls to change how aggressively the live coach intervenes while you type.
              </p>
            </div>
            <button className="secondary" type="button" onClick={() => setLiveCoachTuning(defaultLiveCoachTuning)}>
              Reset live coach
            </button>
          </div>
          <div className="coach-tuning-grid">
            <label className="coach-tuning-field">
              <span>Focus mode</span>
              <select
                value={liveCoachTuning.focusMode}
                onChange={(event) => updateLiveCoachTuning('focusMode', event.target.value as LiveCoachTuning['focusMode'])}
              >
                <option value="memorization">Memorization trainer</option>
                <option value="interview">Interview coach</option>
              </select>
            </label>
            <label className="coach-tuning-field">
              <span>Tone</span>
              <select
                value={liveCoachTuning.tone}
                onChange={(event) => updateLiveCoachTuning('tone', event.target.value as LiveCoachTuning['tone'])}
              >
                <option value="calm">Calm</option>
                <option value="direct">Direct</option>
                <option value="technical">Technical</option>
              </select>
            </label>
            <label className="coach-tuning-field">
              <span>Specificity</span>
              <select
                value={liveCoachTuning.specificitySource}
                onChange={(event) =>
                  updateLiveCoachTuning('specificitySource', event.target.value as LiveCoachTuning['specificitySource'])
                }
              >
                <option value="time-and-quality">Time + live answer quality</option>
                <option value="time-only">Time only</option>
              </select>
            </label>
            <label className="coach-tuning-field">
              <span>Live feedback frequency</span>
              <select
                value={liveCoachTuning.feedbackFrequency}
                onChange={(event) =>
                  updateLiveCoachTuning('feedbackFrequency', event.target.value as LiveCoachTuning['feedbackFrequency'])
                }
              >
                <option value="more-often">More often</option>
                <option value="balanced">Balanced</option>
                <option value="less-often">Less often</option>
              </select>
            </label>
            <label className="coach-tuning-field">
              <span>Canonical answer reveal</span>
              <select
                value={liveCoachTuning.canonicalAnswerStage}
                onChange={(event) =>
                  updateLiveCoachTuning('canonicalAnswerStage', event.target.value as LiveCoachTuning['canonicalAnswerStage'])
                }
              >
                <option value="mid">Mid</option>
                <option value="late">Late</option>
                <option value="very-late">Very late</option>
              </select>
            </label>
            <label className="coach-tuning-field">
              <span>Repeated drift threshold</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={liveCoachTuning.driftThresholdAttempts}
                onChange={(event) => updateLiveCoachTuning('driftThresholdAttempts', Number(event.target.value))}
              />
              <strong>{liveCoachTuning.driftThresholdAttempts} attempts</strong>
            </label>
            <label className="coach-tuning-field">
              <span>Drill-down stall threshold</span>
              <input
                type="range"
                min={15}
                max={120}
                step={5}
                value={liveCoachTuning.stallThresholdSeconds}
                onChange={(event) => updateLiveCoachTuning('stallThresholdSeconds', Number(event.target.value))}
              />
              <strong>{liveCoachTuning.stallThresholdSeconds}s</strong>
            </label>
            <label className="coach-tuning-toggle">
              <input
                type="checkbox"
                checked={liveCoachTuning.enabled}
                onChange={(event) => updateLiveCoachTuning('enabled', event.target.checked)}
              />
              <span>Enable live feedback requests</span>
            </label>
            <label className="coach-tuning-toggle">
              <input
                type="checkbox"
                checked={liveCoachTuning.singleIssue}
                onChange={(event) => updateLiveCoachTuning('singleIssue', event.target.checked)}
              />
              <span>Keep live feedback to one issue</span>
            </label>
            <label className="coach-tuning-toggle">
              <input
                type="checkbox"
                checked={liveCoachTuning.allowExactEditsWhenStuck}
                onChange={(event) => updateLiveCoachTuning('allowExactEditsWhenStuck', event.target.checked)}
              />
              <span>Allow exact edits only when stalled</span>
            </label>
            <label className="coach-tuning-toggle">
              <input
                type="checkbox"
                checked={liveCoachTuning.showPatternNames}
                onChange={(event) => updateLiveCoachTuning('showPatternNames', event.target.checked)}
              />
              <span>Let the coach name patterns explicitly</span>
            </label>
            <label className="coach-tuning-toggle">
              <input
                type="checkbox"
                checked={liveCoachTuning.affirmationMode === 'stable-only'}
                onChange={(event) => updateLiveCoachTuning('affirmationMode', event.target.checked ? 'stable-only' : 'never')}
              />
              <span>Show affirmation only when something stable is present</span>
            </label>
          </div>
        </div>

        <div className="panel coach-tuning-panel">
          <div className="coach-tuning-header">
            <div>
              <h3>Submission Controls</h3>
              <p className="hint" style={{ marginTop: '0.35rem' }}>
                The current default is logic-first grading: preserve the algorithm, then tighten contract drift and
                wording only as secondary signals.
              </p>
            </div>
            <button className="secondary" type="button" onClick={() => setSubmissionTuning(defaultSubmissionTuning)}>
              Reset submission tuning
            </button>
          </div>
          <div className="coach-tuning-grid">
            <label className="coach-tuning-field">
              <span>Grading mode</span>
              <select
                value={submissionTuning.gradingMode}
                onChange={(event) =>
                  updateSubmissionTuning('gradingMode', event.target.value as SubmissionTuning['gradingMode'])
                }
              >
                <option value="core-logic">Core logic first</option>
                <option value="balanced">Balanced</option>
                <option value="strict">Strict template match</option>
              </select>
            </label>
            <label className="coach-tuning-field">
              <span>Contract strictness</span>
              <select
                value={submissionTuning.contractStrictness}
                onChange={(event) =>
                  updateSubmissionTuning('contractStrictness', event.target.value as SubmissionTuning['contractStrictness'])
                }
              >
                <option value="light">Light</option>
                <option value="balanced">Balanced</option>
                <option value="strict">Strict</option>
              </select>
            </label>
            <label className="coach-tuning-toggle">
              <input
                type="checkbox"
                checked={submissionTuning.rewardEquivalentPhrasing}
                onChange={(event) => updateSubmissionTuning('rewardEquivalentPhrasing', event.target.checked)}
              />
              <span>Reward equivalent phrasing like “re-calculate” vs “update”</span>
            </label>
            <label className="coach-tuning-toggle">
              <input
                type="checkbox"
                checked={submissionTuning.requireAnswerStep}
                onChange={(event) => updateSubmissionTuning('requireAnswerStep', event.target.checked)}
              />
              <span>Require the answer-recording step for a sound grade</span>
            </label>
            <label className="coach-tuning-toggle">
              <input
                type="checkbox"
                checked={submissionTuning.allowExtraParameters}
                onChange={(event) => updateSubmissionTuning('allowExtraParameters', event.target.checked)}
              />
              <span>Treat added parameters as a minor deviation instead of a major miss</span>
            </label>
          </div>
        </div>

        <div className="panel coach-tuning-panel">
          <div className="coach-tuning-header">
            <div>
              <h3>Tracked Dimensions</h3>
              <p className="hint" style={{ marginTop: '0.35rem' }}>
                These are the signals the Signal Assessor checks for submitted attempts.
              </p>
            </div>
          </div>
          <div className="coach-tuning-grid">
            {trackedDimensions.map((dimension) => (
              <div key={dimension.title} className="coach-tuning-field">
                <span>{dimension.title}</span>
                <p className="hint" style={{ margin: 0 }}>{dimension.copy}</p>
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: '1rem' }}>
            Full-template grading still tracks code-specific signals like syntax validity, indentation drift, early line
            drift, and omitted versus extra lines.
          </p>
        </div>
      </section>
    </div>
  )
}