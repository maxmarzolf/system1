# Backend architecture

The backend is a FastAPI app in `backend/app/`. This doc covers how the code is layered, where each kind of code goes, and the request paths through it. For diagrams of the same paths, see [data-flow.md](data-flow.md). For the tables, see [database-schema.md](database-schema.md).

## Layers

```
endpoints ──► services ──► domain ──► core ──► contracts
                 │
                 └──► repositories ──► db (pool) ──► Postgres
```

| Layer | Folder | Owns | Must not import |
|---|---|---|---|
| Endpoints | `app/endpoints/` | HTTP binding: parse the request, call one service, wrap streams in `StreamingResponse` | `app.core`, `app.repositories`, `app.database` |
| Services | `app/services/` | Use cases: orchestration, calling Jev and LLM providers, deciding what to persist, read models | `fastapi`, `starlette`, endpoints, `app.api_schemas`, `app.database` |
| Domain | `app/domain/` | Pure decisions: rubric summaries, signal validation, readiness, coaching context | services, repositories, `app.models`, `fastapi` |
| Core | `app/core/` | Engines and catalogs: the Jev client, signal plug-ins, the LLM client, assessor, narrator, drill generator, taxonomy, seeded content | domain, services, repositories, `app.models`, `fastapi` |
| Contracts | `app/contracts/` | Shapes shared across layers: the `Evaluation` model, `EvaluationOutcome`, `LlmUnavailableError`, coaching request models | anything else in `app` |
| Repositories | `app/repositories/` | All SQL, and shaping rows into typed dicts | services, endpoints, domain, core, `app.models` |

Top-level modules:

- `app/main.py`: the app factory and composition root. It registers the default evaluators and the error handlers.
- `app/database.py`: boot. It opens the pool, then runs migrations and seeding under an advisory lock.
- `app/db.py`: the asyncpg pool, the only database module repositories import.
- `app/config.py`: settings from the environment.
- `app/models.py`: request models. It re-exports the coaching models from `app/contracts/coaching.py`.
- `app/api_schemas.py`: response models.

**Enforced by import-linter.** The contracts in [`backend/.importlinter`](../backend/.importlinter) encode the table above, including transitive imports. Run `lint-imports` from `backend/`. CI runs it, and `tests/test_architecture_boundaries.py` runs the same contracts, so a plain `pytest` catches a violation too.

**Errors.** Services and core raise `LlmUnavailableError` (from `app/contracts/errors.py`) when a provider can't answer. `app/endpoints/errors.py` maps it to one 503 shape, `{code, message, provider, providerLabel, apiErrorCode}`. Nothing below the endpoints imports `HTTPException`.

## Where code goes

- **A new endpoint:**
  - a thin handler in `app/endpoints/`;
  - its request model in `app/models.py`;
  - its response model in `app/api_schemas.py`, set as the route's `response_model`;
  - the logic in a service.

  Then run `python backend/scripts/export_openapi.py` and `npm run gen:api` to regenerate `src/api/openapi.json` and `src/api/schema.d.ts`. A backend test and CI fail if either is stale.
- **SQL:** a function in the relevant repository. Its row type goes in `app/repositories/types.py`.
- **A payload passed between services** (callbacks, summaries, drill payloads): a `TypedDict` in `app/services/contracts.py`.
- **A shape that crosses layers** (core, domain and services all read it): a Pydantic model or dataclass in `app/contracts/`.
- **A new submission modality:** a class with `async evaluate(body) -> EvaluationOutcome` in `app/services/evaluators/`, added to `default_evaluators()` in `evaluators/defaults.py`. It must return an `Evaluation`; readers never parse the stored JSON by hand. Tests can register a replacement with `register_evaluator` before `create_app()` runs.
- **A new deterministic MCQ signal:** a `DeterministicSignal` registered in `app/core/signals/`. It then appears as an implementation in `/admin`.
- **A new Jev MCQ signal:** no code. Create it in `/admin`.
- **A recall signal spec for another algorithm:** a `SignalSpec` in `app/core/signal_catalog.py`. Bump its `version` whenever its signals change.
- **Slugs, tag aliases, tag → algorithm mapping:** `app/core/taxonomy.py`. Don't write another slugify.
- **An LLM call:** use `app/core/llm.py`:
  - `complete_json` raises `LlmUnavailableError`;
  - `call_llm_json` returns `None` on failure;
  - `call_llm_json_for_submission` returns an error tuple.

  Call `require_available_provider` first when the feature can't work without a model.
- **Schema changes:** a new Alembic revision in `app/migrations/versions/` (`cd backend && alembic revision -m "..." --rev-id <next>`).
  - Write it as raw SQL with `execute_script()`, safe to run on a database that already has the change.
  - Startup applies it (`alembic upgrade head`).
  - Never edit an applied revision. One-time data fixes are revisions too.

  See [database-schema.md → Migrations](database-schema.md#migrations).

## Module map

| Area | Modules |
|---|---|
| Contracts | `contracts/evaluation.py` (`Evaluation`, builders, `from_stored`/`to_stored`), `contracts/submission.py` (`SubmissionRecord`, `EvaluationOutcome`), `contracts/errors.py`, `contracts/coaching.py`, `contracts/coerce.py`, `contracts/catalog_ids.py` |
| Submissions | `services/submission_service.py` (dispatch), `services/evaluators/` (`base`, `registry`, `defaults`, `jev_mcq`, `legacy_recall`), `services/submission_store.py` (validates the `Evaluation` and writes the row) |
| Read models | `services/read_models/overview.py` (readiness, daily activity, skill map), `services/read_models/history.py` (day detail, signal history), `services/read_models/common.py`, `domain/readiness.py`, `domain/rubric_summary.py` |
| MCQ grading | `core/jev/client.py`, `services/jev_gateway.py` (shared gateway factory), `core/signals/` (`base`, `definitions`, `registry`, `spec`, `mcq`), `services/signal_registry_service.py`, `services/submission_context_service.py`, `domain/feedback_builder.py` |
| `/admin` | `services/signal_admin_service.py`, `domain/signal_definition_rules.py`, `repositories/signal_definition_repository.py`, `endpoints/admin.py` |
| Recall grading | `services/feedback_service.py`, `core/assessor.py`, `core/narrator.py`, `services/evaluation_service.py`, `domain/recall_soundness.py`, `services/signal_spec_service.py`, `core/signal_catalog.py` |
| Drills | `services/drill_generation_service.py` and `core/generator/` (generated cards and MCQs, split into `mcq`, `skill_map`, `prompts`, `inline_notes`, `code_style`, `text`, `types`), `services/problem_practice_service.py` (catalog drills), `services/micro_drill_service.py`, `services/sliding_window_ladder_service.py`, `services/inline_completion_service.py` |
| Coach orchestration | `services/coach_orchestration_service.py` wires persistence callbacks into the drill and feedback services |
| Catalog content | `core/core_algorithm_catalog.py`, `core/core_algorithms.py` and `core/core_meta.py` (answer bank), `core/static_playlists.py`, `core/taxonomy_catalog.py`, `core/taxonomy.py` (slugs and aliases), `services/unified_catalog_service.py`, `services/catalog_service.py` |
| LLM providers | `core/llm.py`: provider selection, the OpenAI, Claude and Gemma adapters, the error taxonomy, streaming |
| Boot and schema | `database.py`, `db.py`, `migrations/` (Alembic env, runner, revisions) |

## Request paths

### Submitting an answer: `POST /api/attempts`

1. `endpoints/attempts.py` calls `submission_service.create_submission`.
2. `evaluators/registry.py::get_evaluator` picks the evaluator for the submission's `modality`:
   - `mcq`: `JevMcqEvaluator` (next section);
   - `total-recall`, `microdrill`: `AssessorEvaluator`;
   - `ghost-rep`: `GhostRepEvaluator` (semantic check only).
3. The evaluator returns an `EvaluationOutcome`: `successful`, the canonical `evaluation`, and, for MCQs, a `SubmissionRecord` with the server-trusted answer text and problem id.
4. `submission_store.create_attempt` validates it as an `Evaluation` and stores it as one `submission` row.

The client never supplies its own verdict or scores; the evaluator is the only place that decides `successful`.

### MCQ grading with Jev

1. `submission_context_service.build_mcq_context` loads the stored `multiple_choice_problem` by `multipleChoiceProblemId` and the client's `selectedChoiceId`. An unknown problem or choice is a 422. Client-sent question text is ignored.
2. `signal_registry_service.load_mcq_spec` reads, on every submission, the active `signal_definition` rows (general, plus those scoped to the algorithm from `core/taxonomy.py::algorithm_slug_for_tags`) and the correctness wording from `signal_evaluation_directive`.
3. One `HttpJevGateway.system_one` call carries the correctness question (a Choice: `"1"` correct, `"0"` incorrect) and one question per Jev signal. The state is `{question, answers, correctAnswer, submittedAnswer}`.
4. `successful` is Jev's correctness label. It is compared with the answer key; disagreement, or confidence below 0.6, adds a `provenance.flags` entry.
5. Signals marked `needs_correctness` go in a second call whose state adds `answeredCorrectly`.
6. Each plug-in interprets its own answer; `applies_when` is applied afterwards.
7. `domain/feedback_builder.py::rubric_from_signal_results` builds the rubric. Diagnostic signals are stored but not scored.
8. If Jev is unavailable, the answer key decides, Jev signals are recorded as `unavailable`, and deterministic signals still score.

Generated MCQs are stored when they are generated, and the served card always uses the stored id and choice order, so an answer is graded against exactly what was shown.

### Recall grading

1. `signal_spec_service.resolve_signal_spec` picks the spec: the problem's algorithm, else the primary skill tag's algorithm, else `DEFAULT_SIGNAL_SPEC`.
2. `feedback_service.coach_submission_evaluation` loads recent history (`history_service.load_feedback_context`), then runs:
   - the **assessor** (`core/assessor.py`), which must score every signal in the spec, or the response is rejected;
   - the **narrator** (`core/narrator.py`), which writes the coaching text, retrying retryable provider failures.
3. `domain/feedback_builder.py::submission_rubric_from_assessment` and `contracts/evaluation.py::build_evaluation` build the stored evaluation.
4. When the assessor or narrator fails, `AssessorEvaluator` falls back to the semantic check (`evaluation_service`, then the AST check in `domain/recall_soundness.py`) and returns `feedbackUnavailable` so the UI can say why.

### Editing signals: `/api/admin/signals…`

`signal_admin_service` validates every write with `domain/signal_definition_rules.py` (422 with per-field errors). It writes through `signal_definition_repository`, which checks the row's `version` (409 if stale) and appends a `signal_definition_revision`.

"Try it" asks Jev one draft question about a stored MCQ and saves nothing. There is no admin token for now.

### Reads for Dashboard and Journey

- `GET /api/skill-map-overview?historyDays=&tz=` → `read_models/overview.get_skill_map_overview`: readiness per algorithm and the daily activity grid.
- `GET /api/history/day?date=&tz=` → `read_models/history.get_history_day`: every submission on one local day, with its stored evaluation.
- `GET /api/history/signals?tz=` → `read_models/history.get_signal_history`: every scored rubric entry over time, for the terrain.

Days are computed in the viewer's time zone (`resolve_timezone`, falling back to UTC).

### Drills

- Catalog drills (`/api/coach/problem-drills…`, `/playlist-drills/…`) are read from the seeded catalog by `problem_practice_service`.
- Generated drills go through `coach_orchestration_service` → `drill_generation_service` → `core/generator/`. They fall back to template drills when no provider is available.
- The streaming endpoint returns server-sent events; the generator yields framework-free strings and the endpoint wraps them.

### Reset practice history: `POST /api/admin/reset-practice-history`

`admin_service.reset_practice_history` checks `ADMIN_RESET_TOKEN`, then `admin_repository` truncates `submission` and deletes generated problems.

## The stored evaluation

`submission.signals` allows four top-level keys (a CHECK constraint enforces this): `elapsed_ms`, `evaluation`, `flow` and `modality`.

`evaluation` holds:

- the versioned verdict and a `signalSpec` reference;
- score, primary failure, dimensions, modifiers, recommended action, coaching feedback and provenance.

Jev evaluations also store:

- `correctness` (label, confidence, probabilities, `answerKeyAgreement`);
- `signalResults` (every plug-in's raw answer, score and status);
- `signalSpecSnapshot`;
- `jevTrace` (model, request ids, questions, answers).

Their `signalSpec` adds `modality` and `hash`.

Dimension and modifier keys are the spec's signal keys, in spec order. Because the spec is stored with each evaluation, old grades stay explainable after the signals change.

## Tests

- **Unit tests** fake every Jev and LLM call: a `FakeJevGateway`, an `httpx.MockTransport`, or a patched `urlopen`.
- **Integration tests** (`-m integration`) use Postgres and restore any rows they change.
- **`-m jev_live`** makes one real Jev call.

Coverage must stay at or above 90% (`backend/.coveragerc`). See the README for commands.
