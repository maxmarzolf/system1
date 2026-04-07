import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  defaultSubmissionTuning,
  loadStoredSubmissionTuning,
  saveStoredSubmissionTuning,
} from './submissionTuning'
import type { SubmissionTuning } from './submissionTuning'

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
    title: 'Invariant logic',
    copy: 'Whether the rule that makes the algorithm valid is preserved.',
  },
  {
    title: 'Answer update',
    copy: 'Whether the pseudocode still says when the answer gets recorded.',
  },
]

export default function SubmissionTuningPage() {
  const [submissionTuning, setSubmissionTuning] = useState<SubmissionTuning>(() => loadStoredSubmissionTuning())

  useEffect(() => {
    saveStoredSubmissionTuning(submissionTuning)
  }, [submissionTuning])

  const updateSubmissionTuning = <K extends keyof SubmissionTuning>(key: K, value: SubmissionTuning[K]) => {
    setSubmissionTuning((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-left">
          <span className="navbar-brand">System 1 Trainer</span>
          <span className="navbar-divider" />
          <div className="navbar-group">
            <button className="nav-tab active" type="button">
              Tune Submission
            </button>
          </div>
        </div>
        <div className="navbar-right">
          <Link to="/" className="navbar-dashboard">Back to Practice</Link>
          <Link to="/coach-tuning" className="navbar-dashboard">Tune Coach</Link>
          <Link to="/practice-history" className="navbar-dashboard">History</Link>
          <Link to="/dashboard" className="navbar-dashboard">Dashboard</Link>
        </div>
      </nav>

      <section className="card">
        <div className="card-header coach-tuning-page-header">
          <div>
            <h2>Submission Tuning</h2>
            <p className="difficulty">Persistent settings</p>
            <p className="hint coach-tuning-page-intro">
              Pseudocode and skeleton grading is rules-based here, not just prompt wording. These controls decide how
              much we prioritize preserved logic over literal phrasing.
            </p>
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
              <span>Require the answer-recording step for a sound pseudocode grade</span>
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
                These are the dimensions the heuristic grader now checks for pseudocode and skeleton submissions.
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
            Full-solution grading still tracks code-specific signals like syntax validity, indentation drift, early line
            drift, and omitted versus extra lines.
          </p>
        </div>
      </section>
    </div>
  )
}
