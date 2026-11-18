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
| Core | `app/core/` | Engines and catalogs: the Jev client, signal plug-ins, code checks, the feedback writer, the LLM client, drill generator, taxonomy, seeded content | domain, services, repositories, `app.models`, `fastapi` |
| Contracts | `app/contracts/` | Shapes shared across layers: the `Evaluation` model, `EvaluationOutcome`, `LlmUnavailableError`, coaching request models | anything else in `app` |
| Repositories | `app/repositories/` | All SQL, and shaping rows into typed dicts | services, endpoints, domain, core, `app.models` |

Top-level modules:

- `app/main.py`: the app factory and composition root. It registers each modality's grading context builder and the error handlers.
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
- **A new submission modality:** a defaults module in `app/core/signals/` and a `ContextBuilder` in `app/services/evaluation/contexts/`, registered in `register_default_context_builders`. The pipeline does the rest. Steps are in [grading.md → Adding a modality](grading.md#adding-a-modality).
- **A new deterministic signal:** a `DeterministicSignal` registered in `app/core/signals/deterministic.py`. It then appears as an implementation in `/admin` for every modality.
- **A new Jev signal, for any modality or algorithm:** no code. Create it in `/admin`.
- **A new grading, generation or practice setting:** a field on the section's Pydantic model in `services/app_settings_service.py`, and a control in `features/admin/components/SettingsView.tsx`.
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
| Submissions | `services/submission_service.py` (runs the pipeline, captures LLM traces), `services/submission_store.py` (validates the `Evaluation` and writes the row) |
| Read models | `services/read_models/overview.py` (the daily work grid, skill map), `services/read_models/history.py` (submissions by day and algorithm, competency), `services/read_models/common.py`, `domain/readiness.py`, `domain/rubric_summary.py` |
| Grading (every modality) | `services/evaluation/` (`pipeline`, `context`, `contexts/{mcq,code}`, `jev`, `verdict`, `feedback`), `core/jev/client.py`, `services/jev_gateway.py`, `core/signals/` (`base`, `definitions`, `deterministic`, `spec`, `seed`, `defaults`, one module per modality), `core/code_checks.py`, `core/feedback_writer.py`, `services/signal_registry_service.py`, `domain/feedback_builder.py`. See [grading.md](grading.md) |
| `/admin` | `services/signal_admin_service.py`, `services/app_settings_service.py`, `domain/signal_definition_rules.py`, `repositories/signal_definition_repository.py`, `repositories/app_setting_repository.py`, `endpoints/admin.py` |
| Stored exercises | `repositories/exercise_repository.py` (`generated_exercise`: microdrills and Ladder rungs, written when generated) |
| Drills | `services/drill_generation_service.py` and `core/generator/` (generated cards and MCQs, split into `mcq`, `mcq_prompt`, `skill_map`, `prompts`, `inline_notes`, `code_style`, `text`, `types`), `services/problem_practice_service.py` (catalog drills), `services/micro_drill_service.py`, `services/sliding_window_ladder_service.py`, `services/inline_completion_service.py` |
| Coach orchestration | `services/coach_orchestration_service.py` wires persistence callbacks into the drill and feedback services |
| Catalog content | `core/core_algorithm_catalog.py`, `core/core_algorithms.py` and `core/core_meta.py` (answer bank), `core/static_playlists.py`, `core/taxonomy_catalog.py`, `core/taxonomy.py` (slugs and aliases), `services/unified_catalog_service.py`, `services/catalog_service.py` |
| LLM providers | `core/llm.py`: provider selection, the OpenAI, Claude and Gemma adapters, the error taxonomy, streaming |
| Boot and schema | `database.py`, `db.py`, `migrations/` (Alembic env, runner, revisions) |

## Request paths

### Submitting an answer: `POST /api/attempts`

1. `endpoints/attempts.py` calls `submission_service.create_submission`.
2. `services/evaluation/pipeline.py::evaluate` grades it, the same way for every modality: the modality's context builder loads the stored item; the modality's signal spec is loaded; Jev is asked (one or two passes); correctness is decided (hard override, deterministic directive, Jev, or fallback); signals are interpreted; the verdict is banded; the rubric is built; and, if enabled, an LLM writes feedback from the results.
3. The pipeline returns an `EvaluationOutcome`: `successful`, the canonical `evaluation`, and a `SubmissionRecord` with the server-trusted answer, reference and item id.
4. `submission_store.create_attempt` validates it as an `Evaluation` and stores it as one `submission` row.

The client never supplies its own verdict or scores; the pipeline is the only place that decides `successful`. Every step, rule and setting is described in [grading.md](grading.md).

Generated MCQs, microdrills and Ladder rungs are stored when they are generated, and the client submits the stored id, so an answer is graded against exactly what was shown.

### MCQ generation: `POST /api/coach/multiple-choice-drills`

- `core/generator/mcq_prompt.py` builds what to ask; `core/generator/mcq.py` runs the calls and validates each card; `core/llm.complete_json_with_fallback` owns retries and the provider chain.
- A **random** set fans out into one concurrent call per question, each from a different angle (invariant, edge case, state update, common bug, tradeoff), so it takes about as long as one question. A **progressive** set (a Socratic chain) stays one call. A bad reply retries only its own question; the set fails only when a question still has no valid card.
- The model is asked only for what the server can't derive (`title`, `skill`, `question`, `choices`, `correctChoiceId`, `explanation`).
- Calls use the MCQ model from Admin → Settings → Generation (defaulting to `COACH_MCQ_*_MODEL`, Claude Haiku), via `LlmCall.models`; an unavailable model falls back to the provider model.

### What went into and out of the models

Every `core/llm` call logs its provider, model, latency and tokens at INFO. Inside a `capture_llm_exchanges()` block it is also recorded as an exchange: settings, system prompt, payload, raw reply, parsed reply, usage, latency, and any error (failed attempts included). API keys and headers are never recorded.

- Generation: each MCQ's exchanges are stored in `multiple_choice_problem.generation_trace`.
- Grading: `submission_service` captures the pipeline's LLM calls (the feedback writer) into `evaluation.llmTrace`. Jev calls are in `evaluation.jevTrace` with the state and full questions sent, the answers, usage, latency and attempts.
- `GET /api/history/submissions` returns `generationTrace` with each submission; Journey's Submission Detail shows all three under **Model calls**.

### Editing signals and settings: `/api/admin/signals/{modality}…`, `/api/admin/settings`

`signal_admin_service` validates every write with `domain/signal_definition_rules.py` (422 with per-field errors). It writes through `signal_definition_repository`, which checks the row's `version` (409 if stale) and appends a `signal_definition_revision`.

"Try it" grades one stored item of the modality with the unsaved draft (one Jev call) and saves nothing. Settings are saved per section (`grading`, `generation`, `practice`) in `app_setting`, versioned the same way (409 if stale). There is no admin token for now.

### Reads for Journey

- `GET /api/skill-map-overview?historyDays=&tz=` → `read_models/overview.get_skill_map_overview`: the daily work grid's algorithms (catalog order, then static playlists) and its work per algorithm per day.
- `GET /api/history/submissions?date=&algorithm=&tz=` → `read_models/history.get_history_submissions`: the daily-work submissions on one local day (oldest first), for any of the `algorithm` slugs over the last year (newest first), or both, each with its stored evaluation and local `date`.
- `GET /api/history/competency?tz=` → `read_models/history.get_competency_terrain`: competency per algorithm per day, computed by one aggregate query (`attempts_repository.fetch_competency_terrain`; see [data-flow.md](data-flow.md#3-review-journey)).

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
