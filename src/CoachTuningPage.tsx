import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { defaultLiveCoachTuning, loadStoredLiveCoachTuning, saveStoredLiveCoachTuning } from './liveCoachTuning'
import type { LiveCoachTuning } from './liveCoachTuning'

export default function CoachTuningPage() {
  const [liveCoachTuning, setLiveCoachTuning] = useState<LiveCoachTuning>(() => loadStoredLiveCoachTuning())

  useEffect(() => {
    saveStoredLiveCoachTuning(liveCoachTuning)
  }, [liveCoachTuning])

  const updateLiveCoachTuning = <K extends keyof LiveCoachTuning>(key: K, value: LiveCoachTuning[K]) => {
    setLiveCoachTuning((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-left">
          <span className="navbar-brand">System 1 Trainer</span>
          <span className="navbar-divider" />
          <div className="navbar-group">
            <button className="nav-tab active" type="button">
              Tune Coach
            </button>
          </div>
        </div>
        <div className="navbar-right">
          <Link to="/" className="navbar-dashboard">Back to Practice</Link>
          <Link to="/practice-history" className="navbar-dashboard">History</Link>
          <Link to="/dashboard" className="navbar-dashboard">Dashboard</Link>
        </div>
      </nav>

      <section className="card">
        <div className="card-header coach-tuning-page-header">
          <div>
            <h2>Live Coach Tuning</h2>
            <p className="difficulty">Persistent settings</p>
            <p className="hint coach-tuning-page-intro">
              These controls tune live feedback only. Changes save immediately and apply to the next live snapshot.
            </p>
          </div>
        </div>

        <div className="panel coach-tuning-panel">
          <div className="coach-tuning-header">
            <div>
              <h3>Coach Controls</h3>
              <p className="hint" style={{ marginTop: '0.35rem' }}>
                Use this page to change how aggressively the live coach intervenes while you type.
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
                <option value="time-and-quality">Time + draft quality</option>
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
                checked={liveCoachTuning.drillDownEnabled}
                onChange={(event) => updateLiveCoachTuning('drillDownEnabled', event.target.checked)}
              />
              <span>Enable drill-down focus mode</span>
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
      </section>
    </div>
  )
}
