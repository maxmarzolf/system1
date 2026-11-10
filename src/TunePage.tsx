import { useStoredSetting } from './storedSetting'
import {
  defaultSubmissionTuning,
  submissionTuningSetting,
} from './submissionTuning'
import type { SubmissionTuning } from './submissionTuning'
import {
  defaultSpecimenTuning,
  specimenTuningSetting,
} from './specimenTuning'
import type { SpecimenTuning } from './specimenTuning'
import {
  defaultCodeEditorTuning,
  codeEditorTuningSetting,
} from './codeEditorTuning'
import type { CodeEditorTuning } from './codeEditorTuning'
import {
  MCQ_MAX_QUESTION_COUNT,
  MCQ_MIN_QUESTION_COUNT,
  clampMcqQuestionCount,
  defaultMcqTuning,
  mcqTuningSetting,
} from './mcqTuning'
import type { McqTuning } from './mcqTuning'
import {
  defaultGooglePlaylistTuning,
  googlePlaylistTuningSetting,
} from './googlePlaylistTuning'
import type { GooglePlaylistTuning } from './googlePlaylistTuning'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'
import { getHotkeyReferenceGroups } from './hotkeys'
import { NumberControl, SelectControl, ToggleControl, TuneSection } from './tuneControls'

export default function TunePage() {
  const configuredProviderLabel = useConfiguredProviderLabel()
  const hotkeyGroups = getHotkeyReferenceGroups(navigator.platform.includes('Mac'))
  const [submissionTuning, setSubmissionTuning] = useStoredSetting(submissionTuningSetting)
  const [specimenTuning, setSpecimenTuning] = useStoredSetting(specimenTuningSetting)
  const [codeEditorTuning, setCodeEditorTuning] = useStoredSetting(codeEditorTuningSetting)
  const [mcqTuning, setMcqTuning] = useStoredSetting(mcqTuningSetting)
  const [googlePlaylistTuning, setGooglePlaylistTuning] = useStoredSetting(googlePlaylistTuningSetting)

  const updateSubmissionTuning = <K extends keyof SubmissionTuning>(key: K, value: SubmissionTuning[K]) => {
    setSubmissionTuning((prev) => ({ ...prev, [key]: value }))
  }

  const updateSpecimenTuning = <K extends keyof SpecimenTuning>(key: K, value: SpecimenTuning[K]) => {
    setSpecimenTuning((prev) => ({ ...prev, [key]: value }))
  }

  const updateCodeEditorTuning = <K extends keyof CodeEditorTuning>(key: K, value: CodeEditorTuning[K]) => {
    setCodeEditorTuning((prev) => ({ ...prev, [key]: value }))
  }

  const updateMcqTuning = <K extends keyof McqTuning>(key: K, value: McqTuning[K]) => {
    setMcqTuning((prev) => ({ ...prev, [key]: value }))
  }

  const updateGooglePlaylistTuning = <K extends keyof GooglePlaylistTuning>(key: K, value: GooglePlaylistTuning[K]) => {
    setGooglePlaylistTuning((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="app app-tune">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} pinned solid />

      <section className="tune-surface">
        <div className="tune-hero">
          <div>
            <h2>Tune</h2>
            <p>Persistent settings for generated specimens, AI code completion, and submission grading.</p>
          </div>
          <div className="tune-hero-meta" aria-label="Tune page behavior">
            <span>Auto-saves</span>
            <span>Applies next interaction</span>
          </div>
        </div>

        <div className="tune-layout">
          <aside className="tune-rail" aria-label="Tune sections">
            <a href="#specimen">Specimen</a>
            <a href="#code-editor">Code editor</a>
            <a href="#google-playlist">Google</a>
            <a href="#mcq">MCQ</a>
            <a href="#ai-completion">AI completion</a>
            <a href="#submission">Submission</a>
            <a href="#hotkeys">Hotkeys</a>
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
              title="Code Editor"
              copy="Tune the recall editor itself: syntax mode, completion help, and lightweight style guides."
              action={(
                <button className="secondary tune-reset" type="button" onClick={() => setCodeEditorTuning(defaultCodeEditorTuning)}>
                  Reset
                </button>
              )}
            >
              <div className="tune-split" id="code-editor">
                <div className="tune-control-grid tune-control-grid-compact">
                  <SelectControl
                    label="Language mode"
                    value={codeEditorTuning.language}
                    onChange={(value) => updateCodeEditorTuning('language', value)}
                    description="Controls editor syntax, indentation, and completions. Generated specimens remain controlled by Specimen tuning."
                    options={[
                      { value: 'python', label: 'Python' },
                      { value: 'javascript', label: 'JavaScript' },
                      { value: 'typescript', label: 'TypeScript' },
                      { value: 'java', label: 'Java' },
                      { value: 'cpp', label: 'C / C++' },
                      { value: 'go', label: 'Go' },
                      { value: 'sql', label: 'SQL' },
                      { value: 'rust', label: 'Rust' },
                    ]}
                  />
                  <SelectControl
                    label="Style guide"
                    value={codeEditorTuning.styleGuide}
                    onChange={(value) => updateCodeEditorTuning('styleGuide', value)}
                    description="PEP 8 keeps Python-oriented 4-space indentation."
                    options={[
                      { value: 'python-pep8', label: 'Python PEP 8' },
                      { value: 'none', label: 'No guide' },
                    ]}
                  />
                </div>
                <div className="tune-toggle-list" aria-label="Code editor toggles">
                  <ToggleControl
                    checked={codeEditorTuning.intellisense}
                    onChange={(value) => updateCodeEditorTuning('intellisense', value)}
                    label="Enable IntelliSense completions"
                  />
                  <ToggleControl
                    checked={codeEditorTuning.commonPatterns}
                    onChange={(value) => updateCodeEditorTuning('commonPatterns', value)}
                    label="Include common Python and algorithm pattern snippets"
                  />
                  <ToggleControl
                    checked={codeEditorTuning.foldControls}
                    onChange={(value) => updateCodeEditorTuning('foldControls', value)}
                    label="Show fold controls in gutter"
                  />
                  <ToggleControl
                    checked={codeEditorTuning.showSearchPanel}
                    onChange={(value) => updateCodeEditorTuning('showSearchPanel', value)}
                    label="Show editor search panel (Command+G may open it)"
                  />
                </div>
              </div>
            </TuneSection>

            <TuneSection
              eyebrow="03"
              title="Google Playlist"
              copy="Choose how the static Google deck is ordered before a practice session starts."
              action={(
                <button className="secondary tune-reset" type="button" onClick={() => setGooglePlaylistTuning(defaultGooglePlaylistTuning)}>
                  Reset
                </button>
              )}
            >
              <div className="tune-control-grid" id="google-playlist">
                <SelectControl
                  label="Deck order"
                  value={googlePlaylistTuning.order}
                  onChange={(value) => updateGooglePlaylistTuning('order', value)}
                  description="Master first is a high-value progression from fundamentals to harder synthesis questions."
                  options={[
                    { value: 'mastery', label: 'Master first' },
                    { value: 'google-15', label: 'Google 15' },
                    { value: 'family', label: 'Group by algorithm family' },
                    { value: 'difficulty', label: 'Sort by difficulty' },
                    { value: 'solution-length', label: 'Sort by solution length' },
                    { value: 'curated', label: 'Original tier order' },
                  ]}
                />
              </div>
            </TuneSection>

            <TuneSection
              eyebrow="04"
              title="MCQ"
              copy="Questions are generated from the current card. Choose the set size and how questions progress."
              action={(
                <button className="secondary tune-reset" type="button" onClick={() => setMcqTuning(defaultMcqTuning)}>
                  Reset
                </button>
              )}
            >
              <div className="tune-control-grid" id="mcq">
                <SelectControl
                  label="Question flow"
                  value={mcqTuning.flowMode}
                  onChange={(value) => updateMcqTuning('flowMode', value)}
                  description="Progressive creates a Socratic chain where each question builds on the previous one."
                  options={[
                    { value: 'random', label: 'Varied balanced random' },
                    { value: 'progressive', label: 'Socratic chain' },
                  ]}
                />
                <NumberControl
                  label="Set size"
                  value={mcqTuning.questionCount}
                  min={MCQ_MIN_QUESTION_COUNT}
                  max={MCQ_MAX_QUESTION_COUNT}
                  onChange={(value) => updateMcqTuning('questionCount', clampMcqQuestionCount(value))}
                  description="How many MCQ questions to generate for each new set."
                />
              </div>
            </TuneSection>

            <TuneSection
              eyebrow="05"
              title="AI Completion"
              copy="Get live coaching as you work, plus short inline code suggestions. Press Tab to accept a suggestion."
            >
              <div id="ai-completion" className="tune-toggle-list">
                <ToggleControl
                  checked={codeEditorTuning.aiCompletion}
                  onChange={(value) => updateCodeEditorTuning('aiCompletion', value)}
                  label="Enable AI completion and live coach"
                />
              </div>
            </TuneSection>

            <TuneSection
              eyebrow="06"
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
              eyebrow="07"
              title="Hotkeys"
              copy="Reference the keyboard controls available whenever a practice card is showing."
            >
              <div className="tune-hotkey-groups" id="hotkeys">
                {hotkeyGroups.map((group) => (
                  <section key={group.title} className="tune-hotkey-group">
                    <h4>{group.title}</h4>
                    <div className="tune-hotkey-list">
                      {group.hotkeys.map((hotkey) => (
                        <div key={hotkey.id} className="tune-hotkey-row">
                          <span className="tune-hotkey-copy">
                            <strong>{hotkey.label}</strong>
                            <span>{hotkey.description}</span>
                          </span>
                          <span className="tune-hotkey-keys" aria-label={hotkey.keys.join(' plus ')}>
                            {hotkey.keys.map((key) => <kbd key={key}>{key}</kbd>)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </TuneSection>
          </div>
        </div>
      </section>
    </div>
  )
}
