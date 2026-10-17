# System1 Recall Trainer

System1 is a React + FastAPI learning app for deliberate recall practice, live coaching, and skill-map readiness tracking.

## Agent Guide

Quick-reference for coding agents and contributors.

### Stack

| Layer | Technology | Port |
|---|---|---|
| Frontend | React + Vite + TypeScript | 5173 |
| Backend API | Python 3.12 + FastAPI + asyncpg | 3001 |
| Database | PostgreSQL 16 | 5432 |
| Runtime | Docker Compose | n/a |

Default container names:
- `flashcard-frontend`
- `flashcard-backend`
- `flashcard-postgres`

### Non-Negotiable Layering Rules

- SQL only in `backend/app/repositories/`.
- `backend/app/services/` contains pure Python only.
- Endpoint handlers in `backend/app/endpoints/` stay thin.
- Database row contracts live in `backend/app/repositories/types.py`.
- Service payload contracts live in `backend/app/services/contracts.py`.
- `backend/app/core/` stays framework-agnostic and does not import FastAPI/Starlette.

## Current Architecture

Backend architecture is:

`endpoints -> services -> domain/core -> repositories -> database`

Key backend modules:
- `backend/app/endpoints/` FastAPI routes.
- `backend/app/services/` use-case orchestration and persistence wiring.
- `backend/app/services/contracts.py` TypedDict/TypeAlias contracts for service payloads and callbacks.
- `backend/app/domain/` pure logic modules (profiles, evaluators, resilience, feedback builders).
- `backend/app/core/` cross-domain engines (assessor, narrator, generator, provider adapters).
- `backend/app/repositories/` all SQL and row shaping.
- `backend/app/schema.sql` canonical schema, applied idempotently at startup.
- `backend/app/database.py` startup: applies `schema.sql`, a few in-place upgrades, then seeds the taxonomy.
- `backend/app/core/signal_catalog.py` per-algorithm signal specs that drive submission assessment.

Detailed architecture and migration notes:
- `docs/backend-architecture.md`
- `docs/migration-notes.md`
- `docs/service-contracts.md`
- `docs/content-architecture.md`

Docs navigation:
- `docs/backend-architecture.md` -> dependency flow, boundary rules, and layer responsibilities.
- `docs/migration-notes.md` -> migration decisions, moved modules, and compatibility notes.
- `docs/service-contracts.md` -> service-level TypedDict/TypeAlias ownership and refactor guidance.

Core algorithm taxonomy is canonicalized into `algorithm`, `skill`, `technique`, `problem`, `problem_skill`, and `problem_technique`.

## Data Model (Current)

Primary tables:
- `algorithm`: catalog groups (sliding window, binary search, …). `algorithm.signal_spec` holds the group's signal spec, seeded from `backend/app/core/signal_catalog.py`.
- `problem`: canonical practice-content table for core, meta, static-playlist, focused-fallback, and generated LLM cards.
- `submission`: canonical attempt ledger and signal store; many submissions may reference one `problem` through `problem_slug`.
- `playlist` and `playlist_problem_order`: organization and ordering only; they do not duplicate problem content.
- `multiple_choice_problem`: separate MCQ content path retained intentionally for now.

Startup behavior in `backend/app/database.py`:
- Applies `backend/app/schema.sql` (every statement is `IF NOT EXISTS`, so it is safe on every boot).
- Applies in-place upgrades for existing databases: adds `algorithm.signal_spec`, drops the retired `submission.migration_key`, and stamps stored evaluations that have no `signalSpec` with `{"algorithm": "default", "version": 0}`.
- Seeds algorithms (with their signal specs), techniques, skills, and core problems. Stale core problems and skills that are no longer in the catalog are pruned; generated problems are preserved.
- `submission.problem_slug` is a real foreign key; `submission.generated_card` is kept as the historical snapshot.

## Signal Specs

Every recall submission is scored by the Signal Assessor against a **signal spec** that belongs to the problem's catalog group (`algorithm`), not to individual problems.

- **Where they live:** `backend/app/core/signal_catalog.py` is the source of truth. Startup copies each spec into `algorithm.signal_spec`.
- **What a spec holds:** an ordered list of `SignalDefinition`s. Each one has a `key`, a `label`, a `kind` (`score` 0–100 or `boolean` valid/error), a `role` (`dimension` or `modifier`), a `weight` for the overall score, `guidance` sent to the assessor, the `variation_strategy` used by adaptive variations, and an optional `axis` (`fidelity`, `executable`, `fluency`) that feeds the summary score. A spec also lists the group's `structural_elements` flags and a `version`.
- **Resolution order:** the submission's problem → its `algorithm.signal_spec`. Otherwise the primary skill tag's algorithm. Otherwise `DEFAULT_SIGNAL_SPEC`.
- **Current specs:** `sliding-window`, `two-pointers`, `binary-search`, `dynamic-programming`. Every other group uses the default spec (`structure`, `completeness`, `patternFidelity`).
- **Storage:** each stored evaluation records `signalSpec: {algorithm, version}`. Its `dimensions` and `modifiers` are keyed by that spec's signals, in spec order.

Viewing specs and signal values in the UI:
- **Tune → Signals** shows each algorithm's spec read-only: signals, role, kind, weight, axis, assessor guidance, variation strategy, and structural elements. Algorithms on the default spec are labeled.
- **Signal troubleshooting** (collapsible panel under the practice card, hidden in zen mode) shows two sides. *Next submission* is the spec the current card resolves to and why (problem, skill tag, or default), the client signals and category tags that will be sent, and the assessor system prompt. *Last submission* is what was actually sent and what came back: the spec used, verdict, score axes, every dimension/modifier status and score with evidence, plus the raw evaluation. The open/closed state is remembered per browser.

To add a spec for another group:
1. Add a `SignalSpec` built with `_spec(...)` in `signal_catalog.py` and register it in `SIGNAL_SPECS`. Every spec automatically gets the shared `correctness`, `syntax`, and `completionTime` signals; give exactly one of your dimensions `axis="fidelity"`.
2. Bump `version` whenever an existing spec's signals change, so old evaluations stay interpretable.
3. Restart the backend; startup reseeds `algorithm.signal_spec`.
4. `tests/test_signal_catalog.py` checks the new spec automatically.

## API Endpoints

Core endpoints:
- `GET /api/health`
- `POST /api/attempts`
- `GET /api/skill-map`
- `GET /api/skill-map-overview`
- `POST /api/coach/inline-completion` (non-persisted code suggestions for CodeMirror)
- `POST /api/coach/history`
- `POST /api/coach/session-plan`
- `POST /api/coach/skill-map-drills`
- `POST /api/coach/skill-map-drills-stream`
- `GET /api/coach/problem-drills`
- `GET /api/coach/problem-drills/{algorithm_slug}`
- `GET /api/coach/problem-drills/technique/{technique_slug}`
- `GET /api/coach/playlist-drills/{playlist_slug}`
- `POST /api/coach/multiple-choice-drills`
- `POST /api/coach/sliding-window-ladder`
- `POST /api/coach/adaptive-variation`
- `POST /api/coach/sequential-variation`
- `GET /api/catalog/playlists`
- `GET /api/catalog/signal-specs` (every algorithm's stored signal spec, read-only)
- `POST /api/catalog/signal-specs/resolve` (the spec, resolution source, and assessor prompt the next submission for a card would use)
- `POST /api/admin/reset-practice-history`

## Development Workflow

### Local Setup

```bash
npm install
backend/.venv/bin/pip install -r backend/requirements.txt
```

### Start Services

```bash
docker compose up -d --build
docker compose ps
```

### Configure Practice Flows

Open the Flow control from the practice card toolbar to replace the card body with the flow configuration view. Custom flows support drag-and-drop block ordering from the hamburger handle, modality and repetition controls, and block removal. The configuration is saved locally and can be started or stopped from the card footer.

Each modality has its own visual cue while configuring a flow: Recall shows a running figure, Ghost shows a bouncing ghost, Multiple Choice uses flashing color sections, and Microdrill fills randomized square tiles.

The Ladder control on fixed and variable sliding window cards opens a five-rung coding sequence. Each rung requires ten successful reps written from a function signature; a miss receives feedback and a new question on the same rung. Progress is saved per card. The Ladder control is disabled for other algorithms while this first curriculum is being developed.

### Stop Services

```bash
docker compose down
```

### Reinitialize Database from Seed Scripts

Postgres data is a bind mount at `backend/data/postgres`, so `docker compose down -v` does not clear it. Delete the directory instead:

```bash
docker compose down && rm -rf backend/data/postgres && docker compose up -d --build
```

Backend startup creates the schema from `backend/app/schema.sql` and seeds the canonical `problem` taxonomy, signal specs, and playlist projections. Reinitialize any database that predates the removal of the legacy startup migrations (`answer`/`score_attempts` era).

## Testing

Run all backend tests:

```bash
cd backend && ../.venv/bin/python -m pytest -v
```

Run the coverage gate:

```bash
cd backend && ../.venv/bin/python -m coverage run -m pytest -q && ../.venv/bin/python -m coverage report
```

Coverage is measured for `app/` with branches enabled and must remain at or above 50% until the existing low-coverage LLM/infrastructure paths are expanded. Every code change must include a test-impact decision: add or update a focused test, or explicitly remove a test whose behavior no longer exists. Do not preserve tests for deleted tables, routes, or runtime paths.

When running tests from the host while Docker Postgres is running, override the Docker-only hostname:

```bash
cd backend && DATABASE_URL=postgresql://flashcard_user:flashcard_password@localhost:5432/flashcard_db ../.venv/bin/python -m pytest -q
```

Run unit-only tests:

```bash
cd backend && ../.venv/bin/python -m pytest -v -m "not integration"
```

Run integration-only tests:

```bash
cd backend && DATABASE_URL=postgresql://flashcard_user:flashcard_password@localhost:5432/flashcard_db ../.venv/bin/python -m pytest -v -m integration
```

Recent test hardening includes:
- API contract parity tests.
- Signal spec tests: catalog invariants and prompt contents (`test_signal_catalog.py`), rubric parsing, assessor validation, and variation strategy (`test_signal_rubric.py`), and spec resolution (`test_signal_spec_resolution.py`).
- Schema idempotency tests (`test_schema_idempotency.py`): startup twice, with `algorithm.signal_spec` seeded and stable.
- Per-algorithm `signalSpec` persistence and history read-back integration tests.
- Query-plan performance guard tests using `EXPLAIN (FORMAT JSON)`.
- Architecture boundary guard tests that enforce no framework coupling in service/core and no repository imports from domain/core.
- Canonical content architecture tests for `problem`, `submission.problem_slug`, playlist projections, and legacy-table removal.

Integration tests may skip when infrastructure is unavailable during local development. CI provides Postgres and explicitly fails if integration tests skip.

## LLM Provider Configuration

Environment defaults are loaded by `backend/app/config.py` from:
- `backend/.env`
- `.env`

Key variables:
- `LLM_DEFAULT` (alias supported: `COACH_LLM_PROVIDER`)
- `COACH_OPENAI_API_KEY` or `OPENAI_API_KEY`
- `COACH_ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY`
- `COACH_OPENAI_MODEL`, `COACH_ANTHROPIC_MODEL`
- `COACH_OPENAI_BASE_URL`, `COACH_ANTHROPIC_BASE_URL`
- `COACH_GEMMA_API_KEY`, `COACH_GEMMA_MODEL`, `COACH_GEMMA_BASE_URL`

Generator tuning:
- `COACH_GENERATOR_MAX_TOKENS`
- `COACH_GENERATOR_TIMEOUT_SECONDS`
- `COACH_GENERATOR_TEMPERATURE`
- `COACH_GENERATOR_READINESS_THRESHOLD`
- `COACH_GENERATOR_PROMPT_WORDS`
- `COACH_GENERATOR_PROMPT_MAX_CHARS`
- `COACH_GENERATOR_PATTERN_HISTORY_LIMIT`

## Submission Feedback Behavior

- Submission feedback is LLM-backed. The assessor scores the signals of the problem's signal spec (see [Signal Specs](#signal-specs)), and a response missing any spec signal is treated as invalid.
- When the assessor or narrator is unavailable, the submission falls back to the semantic evaluator (`evaluation_service`) and then to the deterministic AST check (`domain/recall_soundness.py`). The verdict is stored without dimensions.
- If the selected provider fails (auth, credits, timeout, malformed response), the backend returns a structured failure payload and the frontend surfaces a fallback error state.
- Recent real-world example: Anthropic can return `invalid_request_error` when account credits are exhausted, which presents as "No response from Claude".

## Reset Practice History

Reset only generated practice artifacts (without wiping seeded taxonomy):

```bash
npm run reset:practice-history
```

Equivalent API call:
- `POST /api/admin/reset-practice-history`

Current reset scope:
- `submission`
- generated `problem` rows where `source_type = 'generated-llm'`
- canonical static/core problem rows are preserved

The request requires the token configured via `ADMIN_RESET_TOKEN`.

## Common Troubleshooting

### Backend unhealthy after restart

1. Check logs:

```bash
docker compose logs backend --tail=300
```

2. Confirm health:

```bash
curl -i http://localhost:3001/api/health
docker compose ps
```

3. If startup fails on schema or constraint errors, the database likely predates the current schema. Reinitialize it (see [Reinitialize Database from Seed Scripts](#reinitialize-database-from-seed-scripts)).
4. Confirm every algorithm has a seeded signal spec:

```bash
docker compose exec -T postgres psql -U flashcard_user -d flashcard_db -c "SELECT slug, signal_spec->>'algorithm' FROM algorithm ORDER BY display_order;"
```

### Submission feedback unavailable

1. Check backend logs for provider errors (credits, auth, rate limits).
2. Verify `LLM_DEFAULT` and corresponding API key variables.
3. If using Anthropic, confirm billing/credits are active.

### FastAPI import warning in editor

`Import "fastapi" could not be resolved` can be a local interpreter path mismatch in the editor; verify with `pytest` and runtime logs before treating it as code failure.
