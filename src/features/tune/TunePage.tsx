import { Link } from 'react-router-dom'
import { useStoredSetting } from '@/shared/lib/storedSetting'
import {
  defaultCodeEditorTuning,
  codeEditorTuningSetting,
} from '@/shared/settings/codeEditorTuning'
import type { CodeEditorTuning } from '@/shared/settings/codeEditorTuning'
import TopNav from '@/app/TopNav'
import { getHotkeyReferenceGroups } from '@/shared/lib/hotkeys'
import { SelectControl, ToggleControl, TuneSection } from '@/shared/components/settingControls'

export default function TunePage() {
  const hotkeyGroups = getHotkeyReferenceGroups(navigator.platform.includes('Mac'))
  const [codeEditorTuning, setCodeEditorTuning] = useStoredSetting(codeEditorTuningSetting)

  const updateCodeEditorTuning = <K extends keyof CodeEditorTuning>(key: K, value: CodeEditorTuning[K]) => {
    setCodeEditorTuning((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="app app-tune">
      <TopNav pinned solid />

      <section className="tune-surface">
        <div className="tune-hero">
          <div>
            <h2>Tune</h2>
            <p>
              Your own preferences, saved in this browser: the editor, AI completion and hotkeys. How answers are graded and
              questions are written is set on <Link to="/admin?view=settings">Admin → Settings</Link>.
            </p>
          </div>
          <div className="tune-hero-meta" aria-label="Tune page behavior">
            <span>Auto-saves</span>
            <span>Applies next interaction</span>
          </div>
        </div>

        <div className="tune-layout">
          <aside className="tune-rail" aria-label="Tune sections">
            <a href="#code-editor">Code editor</a>
            <a href="#ai-completion">AI completion</a>
            <a href="#hotkeys">Hotkeys</a>
          </aside>

          <div className="tune-content">
            <TuneSection
              eyebrow="01"
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
              eyebrow="02"
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
              eyebrow="03"
              title="Hotkeys"
              copy="Every keyboard control: Navigation works on any page; the rest apply while a practice card is showing."
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
