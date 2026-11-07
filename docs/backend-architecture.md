# Backend Architecture Map

Related docs:
- `../README.md`
- `./data-flow.md` (diagrams of every flow)
- `./database-schema.md` (ER diagram)
- `./migration-notes.md`
- `./service-contracts.md`

## Canonical Dependency Flow

Request flow is now:

`endpoints -> services -> domain/core helpers -> repositories -> database`

Hard rules:
- Endpoints are transport-only and call services.
- Services orchestrate use-cases and persistence boundaries.
- Service input/output and callback payloads are defined in `app/services/contracts.py`.
- Domain modules are pure logic and cannot import repositories.
- Repositories are SQL-only access boundaries.

## Canonical Request Traces

### 1) Final Submission Evaluation and Persistence
1. `POST /api/attempts` in `app/endpoints/attempts.py`
2. `app/services/submission_service.py::create_submission` looks up the evaluator for the submission's modality
3. `app/services/evaluators/registry.py::get_evaluator` returns the registered `SubmissionEvaluator`:
   - `mcq` → `evaluators/jev_mcq.py::JevMcqEvaluator` (see 1b)
   - `total-recall`, `microdrill` → `evaluators/legacy_recall.py::AssessorEvaluator` (steps 4–10)
   - `ghost-rep` → `evaluators/legacy_recall.py::GhostRepEvaluator` (semantic grader only)
4. `app/services/signal_spec_service.py::resolve_signal_spec` picks the signal spec (see 1a)
5. `app/services/feedback_service.py::coach_submission_evaluation`
6. `app/services/history_service.py::load_feedback_context`
7. `app/core/assessor.py::run_signal_assessor` scores exactly the spec's signals
8. `app/core/narrator.py::attempt_feedback_with_narrator`
9. `app/domain/feedback_builder.py::submission_rubric_from_assessment` turns spec signals into the rubric
10. `app/domain/submission_evaluation.py::canonical_submission_evaluation`
11. `app/services/attempts_service.py::create_attempt` persists the canonical result, plus the evaluator's `SubmissionRecord` (server-trusted answer text and MCQ problem id) when it returns one.

The client sends the attempt once and never supplies its own verdict or evaluation signals. The evaluator is the single place that decides `successful` and produces the evaluation; moving a modality to Jev means registering a different evaluator, with no endpoint, persistence, or UI change. While the user types, CodeMirror requests non-persisted code suggestions from `POST /api/coach/inline-completion`.

### 1a) Signal Specs
Signals are defined per catalog group (the `algorithm` table), not per problem:
- `app/core/signal_catalog.py` is the source of truth: a `SignalSpec` per algorithm slug plus `DEFAULT_SIGNAL_SPEC`. Each `SignalDefinition` carries its key, label, kind (`score` or `boolean`), role (`dimension` or `modifier`), weight, assessor guidance, adaptive-variation strategy, and optional score axis (`fidelity`, `executable`, `fluency`).
- Startup seeds each spec into `algorithm.signal_spec` (JSONB).
- `signal_spec_repository.fetch_algorithm_signal_spec` resolves the submission's problem slug to its algorithm row, otherwise the primary skill tag's algorithm row. A missing row falls back to `DEFAULT_SIGNAL_SPEC`.
- The assessor prompt, the required-signal validation, the rubric dimensions/modifiers, weighted scores, labels, and the adaptive-variation strategy all come from the resolved spec.
- Every stored evaluation records `signalSpec: {algorithm, version}`. Evaluations written before signal specs existed are stamped `{"algorithm": "default", "version": 0}`.

### 1b) MCQ Evaluation Through Jev
1. `app/services/submission_context_service.py::build_mcq_context` loads the stored `multiple_choice_problem` row named by `multipleChoiceProblemId` and the client's `selectedChoiceId`. Unknown problems or choices are a 422; client-sent question or answer text is ignored.
2. `app/services/signal_registry_service.py::load_mcq_spec` reads the active `signal_definition` rows (general plus those scoped to the algorithm from `domain/coach_context.py::algorithm_slug_for_tags`) and the correctness wording from `signal_evaluation_directive`, on every submission.
3. One Jev `system_one` call (`app/core/jev/client.py::HttpJevGateway`, REST `POST /v1/systemone`) carries:
   - `correctness`: a `Choice` with labels `"1"` (answered correctly) and `"0"`, over the state `{question, answers, correctAnswer, submittedAnswer}`;
   - one question per signal plug-in in the spec, over the same state.
4. `successful` is Jev's correctness label. It is compared with the stored answer key; disagreement or confidence below 0.6 adds a `provenance.flags` entry.
5. Plug-ins marked `needs_correctness` are asked in a second call whose state adds `answeredCorrectly`.
6. Each plug-in interprets its own answer; `applies_when` (`always`/`correct`/`incorrect`) is applied after the call.
7. `app/domain/feedback_builder.py::rubric_from_signal_results` builds the rubric (correctness plus weighted, scored signals; diagnostic signals are stored but not scored).
8. If Jev is unavailable, the stored answer key decides, Jev signals are `unavailable`, deterministic signals still score, and `feedbackUnavailable` names Jev.

Generated MCQs are stored when generated (`coach_repository.insert_generated_multiple_choice_question_rows`); rows are immutable and the served card always takes the stored id and choice order, so a submission is graded against exactly what was shown.

### 1c) Signal Definitions and `/admin`
Jev signals are data; deterministic signal logic is code.
- `app/schema.sql`: `signal_definition` (key, scope, primitive, instructions, criteria, score map, role, weight, axis, applicability, status, version), `signal_evaluation_directive` (correctness wording and weight; labels fixed to `"1"`/`"0"`), and the append-only `signal_definition_revision`.
- `app/core/signals/`: `definitions.py::definition_to_plugin` builds a `JevSignal` from a row or wraps a registered `DeterministicSignal`; `spec.py::ModalitySignalSpec` snapshots and hashes the effective spec, correctness wording included; `mcq.py` holds the seed defaults (inserted once by `signal_registry_service.seed_signal_definitions` at startup, never overwriting).
- `app/domain/signal_definition_rules.py`: field-level validation mirroring Jev's limits plus key, scope and weight rules.
- `app/repositories/signal_definition_repository.py`: reads, version-checked writes and revisions.
- `app/services/signal_admin_service.py` + `app/endpoints/admin.py` (`/api/admin/signals…`): list, create, update, archive, restore, correctness wording, revisions, stored-MCQ samples, and Try it (one Jev call on a stored MCQ, nothing saved). No admin token for now. Validation errors are 422 with per-field messages, stale versions 409.
- Frontend: `src/AdminPage.tsx` (route `/admin`), API client `src/signalAdmin.ts`, shared Tune controls in `src/tuneControls.tsx`.

### 1d) Coach Variations
1. `POST /api/coach/adaptive-variation` or `POST /api/coach/sequential-variation`
2. `app/services/coach_service.py` facade delegates to orchestration layer
3. `app/services/coach_orchestration_service.py` handles transport translation
4. `app/services/variation_service.py` owns variation orchestration and drill assembly

### 2) Practice History
1. `POST /api/coach/history` in `app/endpoints/coach.py`
2. `app/services/coach_service.py::coach_practice_history`
3. `app/services/history_service.py::coach_practice_history`
4. `app/repositories/coach_repository.py::fetch_practice_history_entries`

### 3) Admin Reset
1. `POST /api/admin/reset-practice-history` in `app/endpoints/admin.py`
2. `app/services/admin_service.py::reset_practice_history`
3. `app/core/admin.py::reset_practice_history`
4. `app/repositories/admin_repository.py::*`

## Responsibility Matrix

| Layer | Owns | Must Not Own |
|---|---|---|
| `app/endpoints` | HTTP request/response binding | SQL, orchestration, LLM retries |
| `app/services` | Use-case orchestration, dependency wiring, persistence orchestration, service-level TypedDict contracts | FastAPI framework coupling, SQL text |
| `app/domain` | Pure decision logic, scoring, profiles, error taxonomy helpers | Repositories, HTTP exceptions |
| `app/core` | Cross-domain engines (assessor, narrator, generator, provider adapters) | Endpoint orchestration, direct route handling |
| `app/repositories` | SQL statements and row-level data access | Business branching/orchestration |
| `app/config.py` | Environment-backed runtime configuration | Request-scoped decisions |

## Dependency Rules and Anti-Patterns

Rules enforced in tests:
- Endpoints cannot import `app.core.*`.
- Services cannot import `app.endpoints.*` or `fastapi`.
- Domain modules cannot import `app.repositories.*`.
- Core modules cannot import `app.repositories.*`, `fastapi`, or `starlette`.
- Repository modules cannot import `app.services.*` or `app.endpoints.*`.

Practical implications:
- Streaming transport wrappers (for example `StreamingResponse`) are endpoint-owned.
- Core generator stream APIs return framework-agnostic async iterators.
- Repository writes are always delegated by services; attempt signals are persisted through the canonical submission repository.

The canonical `submission.signals` JSONB object has four allowed top-level fields:

- `elapsed_ms`
- `evaluation`
- `flow` (optional adaptive/custom flow context)
- `modality` (modality-specific measurements plus canonical `kind`)

`evaluation` contains the versioned verdict, the `signalSpec` reference, score, primary failure, dimensions, modifiers, recommended action, narrative feedback, and provenance. Jev evaluations also store `correctness` (label, confidence, probabilities, `answerKeyAgreement`), `signalResults` (every plug-in's raw answer, score, and status), `signalSpecSnapshot`, and `jevTrace` (model, request ids, question ids, answers); their `signalSpec` adds `modality` and `hash`. Dimension and modifier keys are the referenced spec's signal keys, in spec order. Narrative feedback does not embed another copy of the evaluation. The ledger's `successful` value is derived from `evaluation.verdict`; it is never accepted from the client.

## Adaptive Flow Contract

- The current card is the immutable flow anchor. Historical MCQs are joined back to it through `signals.flow.anchorCardId`.
- The client derives a deterministic phase (`establish`, `remediate`, `consolidate`, `challenge`, or `mastered`) from recent scores, success streaks, missed lines, and modality coverage.
- Recall failures route to Ghost; unresolved conceptual failures route through MCQ and Microdrill; Microdrill failures return to Recall so a fresh line-level weakness can be measured.
- MCQ and Microdrill generation receive a bounded summary of recent cross-modality attempts and weaknesses. Challenge prompts may vary constraints or edge cases but must remain inside the anchor card's algorithm space.
- Mastery requires strong recent scores and successful Recall, MCQ, and Microdrill evidence. Ghost evidence is required only when remediation was needed. Once mastered, the flow advances to another card already present in the active deck.

Anti-pattern examples:
- Endpoint calling repository directly.
- Domain function raising transport exceptions.
- Core module writing database rows directly for request use-cases.
- Service embedding raw SQL.
