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

Docs navigation:
- `docs/backend-architecture.md` -> dependency flow, boundary rules, and layer responsibilities.
- `docs/migration-notes.md` -> migration decisions, moved modules, and compatibility notes.
- `docs/service-contracts.md` -> service-level TypedDict/TypeAlias ownership and refactor guidance.

Core algorithm naming is canonical throughout the app (`core_algorithm_*`, `core_algorithms`) and legacy `static_function*` names are migrated at startup.

## Data Model (Current)

Primary tables:
- `multiple_choice_problem`: canonical generated MCQ problem records (ids prefixed `mcq-`) plus fingerprint.
- `submission`: canonical attempt ledger (replaces `score_attempts`).
- `coach_feedback_events`: live/submission feedback events, linked by `submission_id` when available.
- `generated_skill_map_cards`: generated drill artifacts and context.
- `core_algorithm_patterns`, `core_algorithm_methods`, `core_algorithms`, `core_algorithm_skill_map`: core algorithm bank and taxonomy.

Important migration behavior in `backend/app/database.py`:
- Backfills legacy `score_attempts` into `multiple_choice_problem` + `submission` for MCQ ids when present.
- Uses fingerprint-based multiple-choice problem reconciliation for idempotency and duplicate tolerance.
- Drops `score_attempts` after successful backfill.
- Migrates legacy `static_function*` table naming and identifiers to `core_algorithm*` naming.

## API Endpoints

Core endpoints:
- `GET /api/health`
- `POST /api/attempts`
- `GET /api/skill-map`
- `GET /api/skill-map-overview`
- `POST /api/coach/evaluate-attempt`
- `POST /api/coach/attempt-feedback`
- `POST /api/coach/history`
- `POST /api/coach/session-plan`
- `POST /api/coach/skill-map-drills`
- `POST /api/coach/skill-map-drills-stream`
- `GET /api/coach/core-algorithm-drills`
- `GET /api/coach/core-algorithm-drills/{pattern_slug}`
- `POST /api/coach/multiple-choice-drills`
- `POST /api/coach/adaptive-variation`
- `POST /api/coach/sequential-variation`
- `POST /api/admin/reset-practice-history`

## Development Workflow

### Local Setup

```bash
npm install
pip install -r backend/requirements.txt
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

Initialization scripts run in order:
- `backend/init-scripts/01-init.sql`
- `backend/init-scripts/05-data-patterns.sql`
- `backend/init-scripts/06-data-methods.sql`

## Testing

Run all backend tests:

```bash
cd backend && pytest -v
```

Run unit-only tests:

```bash
cd backend && pytest -v -m "not integration"
```

Run integration-only tests:

```bash
cd backend && pytest -v -m integration
```

Recent test hardening includes:
- API contract parity tests.
- Migration idempotency guard tests.
- Fixture-backed integration parity tests for migrated attempt data.
- Query-plan performance guard tests using `EXPLAIN (FORMAT JSON)`.
- Architecture boundary guard tests that enforce no framework coupling in service/core and no repository imports from domain/core.

Integration tests are designed to skip cleanly when Postgres/infrastructure is unavailable.

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
- `coach_feedback_events`
- `submission`
- `generated_skill_map_cards`

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

### Submission feedback unavailable

1. Check backend logs for provider errors (credits, auth, rate limits).
2. Verify `LLM_DEFAULT` and corresponding API key variables.
3. If using Anthropic, confirm billing/credits are active.

### FastAPI import warning in editor

`Import "fastapi" could not be resolved` can be a local interpreter path mismatch in the editor; verify with `pytest` and runtime logs before treating it as code failure.
