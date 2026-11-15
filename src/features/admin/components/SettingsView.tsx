import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { NumberControl, SelectControl, ToggleControl, TuneSection } from '@/shared/components/settingControls'
import { MODALITIES, MODALITY_LABELS } from '@/shared/modality'
import { SignalAdminError, fetchAdminSettings, saveSettingsSection } from '../api'
import type { AdminSettings, SettingsKey } from '../api'
import { errorMessage } from '../lib'

/**
 * Server-side settings, one form per section. Each section saves on its own and is versioned,
 * so an edit made elsewhere since loading is reported instead of overwritten.
 */
export function SettingsView() {
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetchAdminSettings().then((result) => {
      setSettings(result)
      setError('')
    }).catch((reason: unknown) => setError(errorMessage(reason)))
  }, [])
  useEffect(load, [load])

  if (error) return <p className="admin-field-error admin-page-error" role="alert">{error}</p>
  if (!settings) return <p className="tune-footnote admin-page-error" aria-busy="true">Loading settings…</p>
  return (
    <>
      <SectionForm section="grading" settings={settings} onSaved={load} eyebrow="Grading" title="How answers are graded"
        copy="Read by the evaluation pipeline on every submission.">
        {(value, set) => (
          <>
            <fieldset className="tune-control admin-fieldset">
              <legend className="tune-control-label">Written feedback after Jev grades</legend>
              {MODALITIES.map((modality) => (
                <ToggleControl key={modality} label={MODALITY_LABELS[modality]}
                  checked={value.feedbackModalities.includes(modality)}
                  onChange={(checked) => set({
                    ...value,
                    feedbackModalities: checked
                      ? [...value.feedbackModalities, modality]
                      : value.feedbackModalities.filter((item) => item !== modality),
                  })} />
              ))}
              <span className="tune-control-description">An LLM turns Jev&rsquo;s result into coaching text. It never changes the grade.</span>
            </fieldset>
            <NumberControl label="Near-miss threshold (close vs needs work)" min={0} max={100} value={value.nearMissThreshold}
              onChange={(nearMissThreshold) => set({ ...value, nearMissThreshold })}
              description="A wrong answer whose nearMiss score (Far 0, Plausible 50, Near 100) is at least this is 'close'." />
            <NumberControl label="Low-confidence flag below" min={0} max={1} step={0.05} value={value.lowConfidenceThreshold}
              onChange={(lowConfidenceThreshold) => set({ ...value, lowConfidenceThreshold })}
              description="Jev's correctness confidence under this adds the low_correctness_confidence flag." />
          </>
        )}
      </SectionForm>

      <SectionForm section="generation" settings={settings} onSaved={load} eyebrow="Generation" title="How questions are written"
        copy="Read by the generators when they write recall cards and MCQs.">
        {(value, set) => (
          <>
            <SelectControl label="Type hints in generated code" value={value.specimen.typeHints}
              options={[{ value: 'omit', label: 'Omit' }, { value: 'include', label: 'Include' }]}
              onChange={(typeHints) => set({ ...value, specimen: { ...value.specimen, typeHints } })} />
            <SelectControl label="Comments in generated code" value={value.specimen.comments}
              options={[{ value: 'omit', label: 'Omit' }, { value: 'brief', label: 'Brief' }]}
              onChange={(comments) => set({ ...value, specimen: { ...value.specimen, comments } })} />
            <SelectControl label="Variable names" value={value.specimen.variableNames}
              options={[{ value: 'readable', label: 'Readable' }, { value: 'concise', label: 'Concise' }, { value: 'descriptive', label: 'Descriptive' }]}
              onChange={(variableNames) => set({ ...value, specimen: { ...value.specimen, variableNames } })} />
            <div className="admin-control-pair">
              {(['claude', 'openai', 'gemma'] as const).map((provider) => (
                <label key={provider} className="tune-control">
                  <span className="tune-control-label">MCQ model ({provider})</span>
                  <input value={value.mcqModels[provider]} placeholder="the provider's general model"
                    onChange={(event) => set({ ...value, mcqModels: { ...value.mcqModels, [provider]: event.target.value } })} />
                </label>
              ))}
            </div>
          </>
        )}
      </SectionForm>

      <SectionForm section="practice" settings={settings} onSaved={load} eyebrow="Practice" title="What practice asks for"
        copy="Read by the practice screen when it requests questions.">
        {(value, set) => (
          <>
            <NumberControl label="MCQs per set" min={1} max={30} value={value.mcqQuestionCount}
              onChange={(mcqQuestionCount) => set({ ...value, mcqQuestionCount })} />
            <SelectControl label="MCQ order" value={value.mcqFlowMode}
              options={[{ value: 'random', label: 'Balanced random (parallel, fastest)' }, { value: 'progressive', label: 'Socratic chain' }]}
              onChange={(mcqFlowMode) => set({ ...value, mcqFlowMode })} />
            <SelectControl label="Google playlist order" value={value.playlistOrder}
              options={[
                { value: 'mastery', label: 'Mastery' }, { value: 'curated', label: 'Curated' }, { value: 'google-15', label: 'Google 15' },
                { value: 'solution-length', label: 'Solution length' }, { value: 'family', label: 'Family' }, { value: 'difficulty', label: 'Difficulty' },
              ]}
              onChange={(playlistOrder) => set({ ...value, playlistOrder })} />
          </>
        )}
      </SectionForm>
    </>
  )
}

function SectionForm<K extends SettingsKey>({ section, settings, onSaved, eyebrow, title, copy, children }: {
  section: K
  settings: AdminSettings
  onSaved: () => void
  eyebrow: string
  title: string
  copy: string
  children: (value: AdminSettings[K]['value'], set: (value: AdminSettings[K]['value']) => void) => ReactNode
}) {
  const stored = settings[section]
  const [draft, setDraft] = useState(stored.value)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored.value)

  useEffect(() => setDraft(stored.value), [stored])

  const save = async () => {
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      await saveSettingsSection(section, draft, stored.version)
      setMessage('Saved. Applies from the next request.')
      onSaved()
    } catch (reason) {
      setFailed(true)
      setMessage(reason instanceof SignalAdminError && Object.keys(reason.fieldErrors).length
        ? Object.values(reason.fieldErrors).join(' ')
        : errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <TuneSection eyebrow={eyebrow} title={title} copy={copy}>
      <div className="admin-editor">
        {children(draft, setDraft)}
        {message ? <p className={failed ? 'admin-field-error' : 'admin-success'} role="status">{message}</p> : null}
        <div className="admin-actions">
          <button type="button" disabled={!dirty || busy} onClick={save}>Save {eyebrow.toLowerCase()}</button>
          <button type="button" className="secondary" disabled={!dirty || busy} onClick={() => setDraft(stored.value)}>Discard</button>
          {stored.version === 0 ? <span className="tune-footnote">Defaults (never saved)</span> : null}
        </div>
      </div>
    </TuneSection>
  )
}
