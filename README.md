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
- `backend/app/database.py` startup schema ensures + compatibility migrations.

Detailed architecture and migration notes:
- `docs/backend-architecture.md`
- `docs/migration-notes.md`
- `docs/service-contracts.md`
- `docs/content-architecture.md`

Docs navigation:
- `docs/backend-architecture.md` -> dependency flow, boundary rules, and layer responsibilities.
- `docs/migration-notes.md` -> migration decisions, moved modules, and compatibility notes.
- `docs/service-contracts.md` -> service-level TypedDict/TypeAlias ownership and refactor guidance.

Core algorithm taxonomy is canonicalized into `algorithm`, `skill`, `technique`, `problem`, `problem_skill`, and `problem_technique`. Legacy `static_function*` and `core_algorithm_*` structures are migrated at startup when present.

## Data Model (Current)

Primary tables:
- `problem`: canonical practice-content table for core, meta, static-playlist, focused-fallback, and generated LLM cards.
- `submission`: canonical attempt ledger and signal store; many submissions may reference one `problem` through `problem_slug`.
- `playlist` and `playlist_problem_order`: organization and ordering only; they do not duplicate problem content.
- `multiple_choice_problem`: separate MCQ content path retained intentionally for now.

Important migration behavior in `backend/app/database.py`:
- Backfills legacy `score_attempts` into `multiple_choice_problem` + `submission` when present.
- Uses fingerprint-based multiple-choice problem reconciliation for idempotency and duplicate tolerance.
- Drops `score_attempts` after successful backfill.
- Moves legacy generated-card rows into `problem` and removes `generated_skill_map_cards`.
- Adds `submission.problem_slug` as a real foreign key and preserves `submission.generated_card` as the historical snapshot.
- Removes the temporary `practice_*` catalog tables.
- Preserves non-core problem rows during taxonomy seeding; stale core rows are pruned by source type.

## API Endpoints

Core endpoints:
- `GET /api/health`
- `POST /api/attempts`
- `GET /api/skill-map`
- `GET /api/skill-map-overview`
- `POST /api/coach/live-feedback` (non-persisted, in-progress coaching)
- `POST /api/coach/history`
- `POST /api/coach/session-plan`
- `POST /api/coach/skill-map-drills`
- `POST /api/coach/skill-map-drills-stream`
- `GET /api/coach/problem-drills`
- `GET /api/coach/problem-drills/{algorithm_slug}`
- `GET /api/coach/problem-drills/technique/{technique_slug}`
- `GET /api/coach/playlist-drills/{playlist_slug}`
- `POST /api/coach/multiple-choice-drills`
- `POST /api/coach/adaptive-variation`
- `POST /api/coach/sequential-variation`
- `GET /api/catalog/playlists`
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

### Stop Services

```bash
docker compose down
```

### Reinitialize Database from Seed Scripts

```bash
docker compose down -v
docker compose up -d --build
```

Initialization scripts create the base PostgreSQL schema. Application startup then applies compatibility migrations and seeds the canonical `problem` taxonomy and playlist projections.

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
- Migration idempotency guard tests.
- Fixture-backed integration parity tests for migrated attempt data.
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

- Submission feedback is LLM-backed.
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

3. If startup errors mention legacy table migrations, rebuild with latest backend image and allow startup migration to complete.
4. Confirm the legacy content tables are gone:

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT to_regclass('public.generated_skill_map_cards'), to_regclass('public.practice_item');"
```

Both values should be empty after migration.

### Submission feedback unavailable

1. Check backend logs for provider errors (credits, auth, rate limits).
2. Verify `LLM_DEFAULT` and corresponding API key variables.
3. If using Anthropic, confirm billing/credits are active.

### FastAPI import warning in editor

`Import "fastapi" could not be resolved` can be a local interpreter path mismatch in the editor; verify with `pytest` and runtime logs before treating it as code failure.
