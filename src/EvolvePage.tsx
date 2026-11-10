import { useEffect, useState } from 'react'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'
import EvolveMcqPreview, { type JevFeedback, type McqPreview, type McqAnswer } from './EvolveMcqPreview'
import './EvolvePage.css'

const EVOLVE_API_BASE = (import.meta.env.VITE_EVOLVE_API_URL as string | undefined)?.replace(/\/$/, '')
  ?? `${window.location.protocol}//${window.location.hostname}:3002`
const evolveApiUrl = (path: string) => `${EVOLVE_API_BASE}${path}`

type RunSummary = {
  id: string
  status: 'running' | 'complete' | 'failed'
  startedAt: string
  finishedAt: string | null
  iterations: number
  baseIteration?: number
}

type Candidate = {
  id: string
  prompt: string
  nextProbe?: string
  score: number | null
  formatScore?: number | null
  jevScore?: number | null
  jevCases?: { pattern: string; scores: Record<string, number>; feedback?: JevFeedback[] }[]
  iteration: number
  generation: number
  parentId: string | null
  isBest: boolean
  previews: McqPreview[]
  answers: McqAnswer[]
}

type Overview = {
  seedPrompt: string
  model: string
  iterations: number
  ready: boolean
  jevReady: boolean
  missing: string[]
  runs: RunSummary[]
}

type RunDetail = RunSummary & {
  message: string | null
  seedPrompt: string
  completedIterations: number
  candidates: Candidate[]
  parent: { runId: string; candidateId: string } | null
  feedback: { id?: string; kind?: string; pattern: string; rating?: string; note?: string;
    choice_id?: string; choice_text?: string; correct?: boolean; previous_probe?: string }[]
}

const scoreLabel = (score: number | null) => score === null ? '—' : `${Math.round(score * 100)}%`
const jevMetricLabel = (name: string) => ({
  grounded: 'Grounded',
  one_correct: 'One correct',
  distractors: 'Distractors',
  explanation: 'Explanation',
  probe_choice: 'Next probe',
  probe_alignment: 'Probe alignment',
  novelty: 'New reasoning task',
  review_alignment: 'Review alignment',
} as Record<string, string>)[name] ?? name.replace(/_/g, ' ')
const previewJevCases = (previews: McqPreview[]) => previews.flatMap((preview) =>
  preview.jev?.scores ? [{ pattern: preview.pattern, scores: preview.jev.scores,
    feedback: preview.jev.feedback }] : [])
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) throw new Error(body.detail || 'Request failed')
  return body as T
}

export default function EvolvePage() {
  const configuredProviderLabel = useConfiguredProviderLabel()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [seedPrompt, setSeedPrompt] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [run, setRun] = useState<RunDetail | null>(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [previewLoadingFor, setPreviewLoadingFor] = useState<string | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [pendingContinuation, setPendingContinuation] = useState<{ runId: string; candidateId: string } | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetNotice, setResetNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const payload = await responseJson<Overview>(await fetch(evolveApiUrl('/api/evolve')))
        if (cancelled) return
        setOverview(payload)
        setSeedPrompt((current) => current || payload.seedPrompt)
        setSelectedRunId(payload.runs[0]?.id ?? null)
      } catch {
        if (!cancelled) setError('The Evolve service is unavailable. Start it to view runs.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedRunId || resetting) {
      if (!selectedRunId) setRun(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const [detail, state] = await Promise.all([
          fetch(evolveApiUrl(`/api/evolve/runs/${selectedRunId}`)).then(responseJson<RunDetail>),
          fetch(evolveApiUrl('/api/evolve')).then(responseJson<Overview>),
        ])
        if (!cancelled) {
          setRun(detail)
          setOverview(state)
          setError((current) => current === 'This evolution run is unavailable.' ? '' : current)
        }
      } catch {
        if (!cancelled) setError('This evolution run is unavailable.')
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 2500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [selectedRunId, resetting])

  const startRun = async () => {
    setError('')
    setResetNotice('')
    setStarting(true)
    try {
      const detail = await responseJson<RunDetail>(await fetch(evolveApiUrl('/api/evolve/runs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: seedPrompt }),
      }))
      setRun(detail)
      setSelectedCandidateId(null)
      setSelectedRunId(detail.id)
      const updated = await responseJson<Overview>(await fetch(evolveApiUrl('/api/evolve')))
      setOverview(updated)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the run.')
    } finally {
      setStarting(false)
    }
  }

  const generatePreview = async (candidate: Candidate) => {
    if (!run || previewLoadingFor) return
    const runId = run.id
    setPreviewError('')
    setPreviewLoadingFor(candidate.id)
    try {
      const payload = await responseJson<{ previews: McqPreview[] }>(await fetch(
        evolveApiUrl(`/api/evolve/runs/${runId}/candidates/${encodeURIComponent(candidate.id)}/preview`),
        { method: 'POST' },
      ))
      setRun((current) => current?.id === runId ? {
        ...current,
        candidates: current.candidates.map((item) => item.id === candidate.id
          ? { ...item, previews: payload.previews,
              nextProbe: payload.previews[0]?.nextProbe || item.nextProbe,
              jevCases: item.jevCases?.length ? item.jevCases : previewJevCases(payload.previews) } : item),
      } : current)
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Could not generate MCQs.')
    } finally {
      setPreviewLoadingFor(null)
    }
  }

  const submitAnswer = async (candidate: Candidate, caseIndex: number, choiceId: string) => {
    if (!run) throw new Error('Select an evolution run first.')
    const runId = run.id
    const answer = await responseJson<McqAnswer>(await fetch(
      evolveApiUrl(`/api/evolve/runs/${runId}/candidates/${encodeURIComponent(candidate.id)}/answer`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseIndex, choiceId }),
      },
    ))
    setRun((current) => current?.id === runId ? {
      ...current,
      candidates: current.candidates.map((item) => item.id === candidate.id ? {
        ...item,
        answers: [...(item.answers ?? []).filter((saved) => saved.caseIndex !== caseIndex), answer],
      } : item),
    } : current)
    setPendingContinuation({ runId, candidateId: candidate.id })
  }

  const requestNextRound = async (path: string) => {
    if (continuing) return
    setContinuing(true)
    setError('')
    try {
      const detail = await responseJson<RunDetail>(await fetch(
        evolveApiUrl(path),
        { method: 'POST' },
      ))
      setPendingContinuation(null)
      setRun(detail)
      setSelectedCandidateId(null)
      setSelectedRunId(detail.id)
      setOverview(await responseJson<Overview>(await fetch(evolveApiUrl('/api/evolve'))))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not continue evolution.')
      setPendingContinuation(null)
    } finally {
      setContinuing(false)
    }
  }
  const continueRun = (runId: string, candidateId: string) => requestNextRound(
    `/api/evolve/runs/${runId}/candidates/${encodeURIComponent(candidateId)}/continue-answer`)
  const retryRun = (runId: string) => requestNextRound(`/api/evolve/runs/${runId}/retry`)

  useEffect(() => {
    if (!pendingContinuation || run?.id !== pendingContinuation.runId || run.status !== 'complete' || continuing) return
    const timer = window.setTimeout(() => { void continueRun(pendingContinuation.runId, pendingContinuation.candidateId) }, 2200)
    return () => window.clearTimeout(timer)
  // Leave a moment for the answer and explanation to remain visible.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingContinuation, run?.id, run?.status, continuing])

  const clearAllRuns = async () => {
    if (resetting || activeRun) return
    setResetting(true)
    setError('')
    try {
      const result = await responseJson<{ deletedRuns: number }>(await fetch(evolveApiUrl('/api/evolve/runs'), {
        method: 'DELETE',
      }))
      setRun(null)
      setSelectedRunId(null)
      setSelectedCandidateId(null)
      setPreviewError('')
      setPendingContinuation(null)
      setSeedPrompt(overview?.seedPrompt ?? '')
      setOverview((current) => current ? { ...current, runs: [] } : current)
      setResetNotice(`${result.deletedRuns} Evolve ${result.deletedRuns === 1 ? 'run' : 'runs'} cleared. Start a new experiment from the original seed.`)
      setConfirmReset(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not clear Evolve runs.')
    } finally {
      setResetting(false)
    }
  }

  const runs = overview?.runs ?? []
  const activeRun = runs.some((item) => item.status === 'running') || run?.status === 'running'
  const canStart = overview?.ready && !activeRun && !starting && !resetting && seedPrompt.trim().length >= 20
    && seedPrompt.trim().length <= 6000
  const candidates = run?.candidates ?? []
  const best = candidates.find((candidate) => candidate.isBest)
    ?? candidates.filter((candidate) => candidate.score !== null)
      .reduce<Candidate | undefined>((leader, candidate) =>
        !leader || (candidate.score ?? 0) > (leader.score ?? 0) ? candidate : leader, undefined)
  const newest = run?.parent ? candidates.filter((candidate) => candidate.iteration > (run.baseIteration ?? 0))
    .reduce<Candidate | undefined>((latest, candidate) =>
      !latest || candidate.iteration > latest.iteration ? candidate : latest, undefined) : undefined
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId)
    ?? newest ?? best ?? candidates[candidates.length - 1]
  const baseline = candidates.find((candidate) => candidate.iteration === 0)
  const bestScore = best?.score ?? null
  const stepsComplete = run?.completedIterations ?? 0
  const runFeedback = run?.feedback ?? []

  return (
    <div className="app app-evolve">
      <TopNav llmProviderLabel={`Auto (${configuredProviderLabel})`} />

      <main className="evolve-shell">
        <header className="evolve-hero">
          <div>
            <p className="evolve-kicker">EXPERIMENT / 01</p>
            <h1>Evolve</h1>
            <p>Watch OpenEvolve revise the prompt that generates Sliding Window MCQs.</p>
          </div>
          <div className="evolve-hero-mark" aria-hidden="true"><span>MCQ</span><span>↗</span></div>
        </header>

        <div className="evolve-facts" aria-label="Experiment configuration">
          <div><span>Target</span><strong>Sliding Window MCQ prompt</strong></div>
          <div><span>Model</span><strong>OpenAI · {overview?.model ?? 'gpt-5.4-mini'}</strong></div>
          <div><span>Next run evaluation</span><strong>{overview?.jevReady ? 'Jev + format · 1 case' : 'Format · 1 case'}</strong></div>
          <div><span>Search</span><strong>{overview?.iterations ?? 3} initial · 1 per answer</strong></div>
        </div>

        {error && <div className="evolve-alert" role="alert">{error}</div>}

        <div className="evolve-grid">
          <section className="evolve-panel evolve-seed-panel" aria-labelledby="seed-title">
            <div className="evolve-panel-heading">
              <div><p className="evolve-kicker">INPUT / 01</p><h2 id="seed-title">Seed prompt</h2></div>
              <span className="evolve-pill">Editable per run</span>
            </div>
            <p className="evolve-panel-copy">This is the prompt OpenEvolve starts from. Changes here are saved only in the new experiment run.</p>
            <label className="evolve-editor-label" htmlFor="evolve-seed">Prompt text</label>
            <textarea
              id="evolve-seed"
              className="evolve-editor"
              spellCheck={false}
              value={seedPrompt}
              maxLength={6000}
              onChange={(event) => setSeedPrompt(event.target.value)}
            />
            <div className="evolve-editor-footer">
              <button type="button" className="evolve-text-button" onClick={() => setSeedPrompt(overview?.seedPrompt ?? '')}
                disabled={!overview || seedPrompt === overview.seedPrompt}>Reset seed</button>
              <span>{seedPrompt.length} / 6000 characters</span>
            </div>
            <div className="evolve-launch">
              <button type="button" className="evolve-primary-button" onClick={() => { void startRun() }} disabled={!canStart}>
                {starting ? 'Starting…' : activeRun ? 'Run in progress' : 'Start evolution'}
                <span aria-hidden="true">↗</span>
              </button>
              <p>Three initial revisions, then one new iteration per answer{overview?.jevReady ? ' · Jev scoring' : ''}</p>
            </div>
            {overview && !overview.ready && (
              <div className="evolve-setup">
                <strong>Setup needed</strong>
                <ul>{overview.missing.map((item) => <li key={item}>{item}</li>)}</ul>
                <code>cd examples/openevolve_mcq_prompt &amp;&amp; python3 -m venv .venv &amp;&amp; .venv/bin/pip install openevolve==0.4.0</code>
                <p>Set OPENAI_API_KEY or COACH_OPENAI_API_KEY for the Evolve service. No key is sent to the browser.</p>
              </div>
            )}
            {!overview && !loading && (
              <div className="evolve-setup">
                <strong>Start the Evolve service</strong>
                <p>From the project root, run:</p>
                <code>docker compose up -d --build evolve</code>
              </div>
            )}
          </section>

          <section className="evolve-panel evolve-observe-panel" aria-labelledby="observe-title">
            <div className="evolve-panel-heading">
              <div><p className="evolve-kicker">RUN / 02</p><h2 id="observe-title">Evolution monitor</h2></div>
              <span className={`evolve-status evolve-status-${run?.status ?? 'idle'}`}>
                {run?.status === 'running' ? '● Running' : run?.status === 'complete' ? 'Complete' : run?.status === 'failed' ? 'Failed' : 'Idle'}
              </span>
            </div>
            <p className="evolve-panel-copy">Scores and prompts appear as each checkpoint is written. Results stay in the example folder.</p>
            {run?.parent && <p className="evolve-run-parent">Population resumed after iteration {run.baseIteration ?? 0} from run {run.parent.runId.slice(0, 15)}.</p>}

            <div className="evolve-run-history-heading">
              <label className="evolve-run-label" htmlFor="evolve-run-select">Run history</label>
              <button type="button" className="evolve-text-button evolve-reset-trigger"
                disabled={!overview || activeRun || resetting || (runs.length === 0 && seedPrompt === overview.seedPrompt)}
                onClick={() => { setConfirmReset(true); setResetNotice('') }}>Start from scratch</button>
            </div>
            <select id="evolve-run-select" className="evolve-run-select" value={selectedRunId ?? ''}
              onChange={(event) => { setSelectedRunId(event.target.value || null); setSelectedCandidateId(null);
                setPreviewError(''); setPendingContinuation(null); setRun(null) }}>
              {runs.length === 0 && <option value="">No runs yet</option>}
              {runs.map((item) => <option value={item.id} key={item.id}>{dateLabel(item.startedAt)} · {item.status}</option>)}
            </select>
            {confirmReset && <div className="evolve-reset-confirm" role="group" aria-label="Confirm starting from scratch">
              <strong>Clear the Evolve experiment?</strong>
              <p>This deletes all saved Evolve runs, answers, generated MCQs, and checkpoints, then restores the original seed prompt. This cannot be undone.</p>
              <div className="evolve-reset-actions">
                <button type="button" className="evolve-text-button" disabled={resetting} onClick={() => setConfirmReset(false)}>Keep my runs</button>
                <button type="button" className="evolve-reset-button" disabled={resetting || activeRun} onClick={() => { void clearAllRuns() }}>
                  {resetting ? 'Clearing…' : 'Clear Evolve data'}
                </button>
              </div>
            </div>}
            {resetNotice && <p className="evolve-reset-notice" role="status">{resetNotice}</p>}

            <div className={`evolve-progress ${run?.iterations === 1 ? 'single' : ''}`} aria-label="Run progress">
              {Array.from({ length: run?.iterations ?? overview?.iterations ?? 3 }, (_, index) => (
                <div key={index} className={`evolve-progress-step ${index < stepsComplete ? 'done' : ''} ${run?.status === 'running' && index === stepsComplete ? 'current' : ''}`}>
                  <span>{String((run?.baseIteration ?? 0) + index + 1).padStart(2, '0')}</span>
                  <strong>{index < stepsComplete ? 'Attempted' : run?.status === 'running' && index === stepsComplete ? 'In progress' : 'Waiting'}</strong>
                </div>
              ))}
            </div>

            <div className="evolve-score-hero">
              <div><span>Best score</span><strong>{scoreLabel(bestScore)}</strong></div>
              <div><span>Baseline</span><strong>{scoreLabel(baseline?.score ?? null)}</strong></div>
              <div><span>Candidates</span><strong>{candidates.length}</strong></div>
            </div>
            {runFeedback.length > 0 && <div className="evolve-active-feedback">
              <strong>Observations guiding this run · {runFeedback.length}</strong>
              <ul>{runFeedback.map((item, index) => <li key={item.id ?? index}>
                <span>{item.pattern} · {item.kind === 'answer' ? item.correct ? 'Correct' : 'Incorrect'
                  : item.rating === 'good' ? 'Keep' : 'Improve'}</span>
                <p>{item.kind === 'answer' ? `Chose ${item.choice_id}: ${item.choice_text}`
                  : item.note || 'Earlier written review'}</p>
              </li>)}</ul>
            </div>}
            {run?.message && <p className="evolve-run-message" role="status">{run.message}</p>}
            {run?.status === 'complete' && candidates.length === 1 && stepsComplete > 0 &&
              <p className="evolve-run-message" role="status">No revised prompt was accepted in this run. The starting prompt is still the best recorded candidate.</p>}
            {run?.status === 'complete' && run.parent && !newest && <div className="evolve-continue">
              <div><span className="prompt-section-label">No new candidate</span>
                <p>OpenEvolve kept the population but accepted no revision in this iteration.</p></div>
              <button type="button" className="evolve-primary-button" disabled={continuing || activeRun || resetting}
                onClick={() => { void retryRun(run.id) }}>
                {continuing ? 'Starting…' : 'Try another iteration'} <span aria-hidden="true">↗</span>
              </button>
            </div>}
            {!run && !loading && <div className="evolve-empty">Start a run to see each prompt revision and its score.</div>}
            {run?.status === 'running' && candidates.length === 0 && <div className="evolve-empty">Evaluating the seed prompt…</div>}
          </section>
        </div>

        <section className="evolve-panel evolve-results" aria-labelledby="results-title">
          <div className="evolve-panel-heading">
            <div><p className="evolve-kicker">RESULTS / 03</p><h2 id="results-title">Prompt lineage</h2></div>
            <span className="evolve-pill">{candidates.length} recorded</span>
          </div>
          <p className="evolve-panel-copy">The population carries forward between rounds. Select a candidate to inspect its prompt; scores were recorded when each candidate was evaluated.</p>
          <div className="evolve-results-grid">
            <div className="evolve-candidates" aria-label="Prompt candidates">
              {candidates.length === 0 && <div className="evolve-empty">No evaluated prompts yet.</div>}
              {candidates.map((candidate) => (
                <button type="button" key={candidate.id}
                  className={`evolve-candidate ${selectedCandidate?.id === candidate.id ? 'selected' : ''}`}
                  aria-pressed={selectedCandidate?.id === candidate.id}
                  onClick={() => { setSelectedCandidateId(candidate.id); setPreviewError('') }}>
                  <span className="evolve-candidate-top"><span>{candidate.iteration === 0 ? 'Seed' : `Revision ${candidate.iteration}`}</span>
                    {candidate.isBest && <em>Best</em>}</span>
                  <span className="evolve-candidate-score">{scoreLabel(candidate.score)}</span>
                  {candidate.nextProbe && <span className="evolve-candidate-probe">Next probe: {candidate.nextProbe}</span>}
                  <span className="evolve-score-track"><span style={{ width: `${Math.max(0, Math.min((candidate.score ?? 0) * 100, 100))}%` }} /></span>
                  {candidate.jevScore != null && <span className="evolve-candidate-metrics">
                    <span>Format {scoreLabel(candidate.formatScore ?? null)}</span>
                    <span>Jev {scoreLabel(candidate.jevScore)}</span>
                  </span>}
                  {selectedCandidate?.id === candidate.id && (candidate.jevCases?.length ?? 0) > 0 &&
                    <span className="evolve-candidate-jev-cases">
                      {candidate.jevScore == null && <span className="evolve-candidate-jev-preview-label">Jev preview · not part of run score</span>}
                      {candidate.jevCases?.map((mcq, caseIndex) => <span className="evolve-candidate-jev-case" key={`${mcq.pattern}-${caseIndex}`}>
                        <strong>{mcq.pattern}</strong>
                        {Object.entries(mcq.scores).map(([name, value]) =>
                          <span className="evolve-candidate-jev-dimension" key={name}>
                            <span>{mcq.feedback?.find((item) => item.question === name)?.signal
                              ?? mcq.feedback?.find((item) => item.question === name)?.note ?? jevMetricLabel(name)}</span><span>{scoreLabel(value)}</span>
                          </span>)}
                      </span>)}
                    </span>}
                </button>
              ))}
            </div>
            <div className="evolve-inspector">
              <div className="evolve-inspector-heading">
                <div><span>Selected prompt</span><strong>{selectedCandidate ? selectedCandidate.iteration === 0 ? 'Seed' : `Revision ${selectedCandidate.iteration}` : 'Awaiting results'}</strong></div>
                {selectedCandidate && <span>{scoreLabel(selectedCandidate.score)}</span>}
              </div>
              {selectedCandidate?.nextProbe && <p className="evolve-inspector-probe"><span>Next probe</span>{selectedCandidate.nextProbe}</p>}
              <pre>{selectedCandidate?.prompt ?? run?.seedPrompt ?? seedPrompt}</pre>
              <div className="evolve-inspector-foot">{selectedCandidate ? `Candidate ${selectedCandidate.id.slice(0, 8)}` : 'Current seed prompt'} · Experiment only</div>
            </div>
          </div>
        </section>

        <section className="evolve-panel evolve-mcq-results" aria-labelledby="mcq-results-title">
          <div className="evolve-panel-heading">
            <div><p className="evolve-kicker">OUTPUT / 04</p><h2 id="mcq-results-title">Generated MCQs</h2></div>
            {selectedCandidate && <span className="evolve-pill">{selectedCandidate.iteration === 0 ? 'Seed' : `Revision ${selectedCandidate.iteration}`}</span>}
          </div>
          <p className="evolve-panel-copy">See the questions generated by the selected prompt. New runs score one Sliding Window MCQ; saved older runs retain their original results.</p>
          {selectedCandidate?.previews?.length
            ? <EvolveMcqPreview key={selectedCandidate.id} previews={selectedCandidate.previews}
                answers={selectedCandidate.answers ?? []} jevReady={overview?.jevReady ?? false}
                answerEnabled={Boolean(overview?.jevReady && run?.status === 'complete' && !pendingContinuation && !continuing
                  && (!run?.parent || selectedCandidate.iteration > (run.baseIteration ?? 0)))}
                answerHint={run?.status !== 'complete' ? 'Wait for this round to finish before answering.'
                  : run?.parent && selectedCandidate.iteration <= (run.baseIteration ?? 0)
                    ? 'Select the new candidate to answer its question.' : 'The next iteration is starting.'}
                onAnswer={(caseIndex, choiceId) => submitAnswer(selectedCandidate, caseIndex, choiceId)} />
            : selectedCandidate ? <div className="evolve-mcq-generate">
              <p>This candidate has no saved MCQ output yet.</p>
              <button type="button" className="evolve-primary-button" disabled={previewLoadingFor !== null}
                onClick={() => { void generatePreview(selectedCandidate) }}>
                {previewLoadingFor === selectedCandidate.id ? 'Generating…' : 'Generate MCQs'} <span aria-hidden="true">↗</span>
              </button>
              <span>One OpenAI request · saved with this run</span>
            </div> : <div className="evolve-empty">Start an evolution run to see the MCQs generated by each prompt.</div>}
          {previewError && <div className="evolve-alert" role="alert">{previewError}</div>}
          {selectedCandidate && (selectedCandidate.answers?.length ?? 0) > 0 && <div className="evolve-continue">
            <div><span className="prompt-section-label">Next round</span>
              <p>{pendingContinuation ? 'Answer saved. The next run will start automatically.'
                : 'Use this prompt and answer to evolve another set of candidates.'}</p></div>
            <button type="button" className="evolve-primary-button" disabled={!overview?.jevReady || activeRun || continuing || resetting || Boolean(pendingContinuation)}
              onClick={() => { if (run) void continueRun(run.id, selectedCandidate.id) }}>
              {continuing ? 'Starting…' : pendingContinuation ? 'Continuing soon…' : 'Continue evolution'} <span aria-hidden="true">↗</span>
            </button>
            {!overview?.jevReady && <p className="evolve-continue-note">Add TYPESAFE_API_KEY to the Evolve service to continue with Jev.</p>}
          </div>}
        </section>
      </main>
    </div>
  )
}
