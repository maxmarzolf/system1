# System1 Recall Trainer

## Agent Guide

Quick reference for AI agents working in this codebase.

### Stack at a Glance

| Layer | Technology | Port |
|-------|-----------|------|
| Frontend | React + Vite + TypeScript | 5173 |
| Backend API | Python 3.12 + FastAPI + asyncpg | 3001 |
| Database | PostgreSQL 16 | 5432 |
| Container runtime | Docker Compose | — |

Container names: `flashcard-postgres`, `flashcard-backend`, `flashcard-frontend`

### Layering Rules (non-negotiable)

- **SQL lives only in `backend/app/repositories/`** — never write raw SQL in a router or service.
- **Services are pure Python** — `backend/app/services/` has no FastAPI, no asyncpg, no HTTP types.
- **Routers are thin** — endpoint handlers call a repository or service function and return the result. No business logic, no data shaping.
- **TypedDict contracts** — all DB row shapes are defined in `backend/app/repositories/types.py`. Add new row types there; don't use plain dicts.
- **Frontend data contracts** — `src/data/skill-map.ts` holds the client-side skill-map type definitions. Keep them in sync with the API response shapes.

### Where to Add Things

| Task | Files to touch |
|------|---------------|
| New API endpoint | `backend/app/routers/<domain>.py` (handler), `backend/app/repositories/<domain>_repository.py` (SQL), `backend/app/repositories/types.py` (new row types if needed) |
| New business logic | `backend/app/services/<domain>_service.py` |
| New DB table | `backend/init-scripts/01-init.sql` (schema), seed data in `05-data-patterns.sql` / `06-data-methods.sql` |
| New frontend page | `src/<PageName>Page.tsx`, register route in `src/App.tsx`, add nav link in `src/TopNav.tsx` |
| New environment variable | `backend/app/config.py` (read + default), `backend/.env` (local value), README LLM/env section |

### Verify Changes

```bash
# Backend unit tests
cd backend && pytest -v

# Container health (all 3 should show healthy/running)
docker compose ps

# Full rebuild and restart
docker compose up -d --build
```

The editor may show `Import "fastapi" could not be resolved` in backend files — this is a virtualenv path issue only, not a real error. `get_errors` on modified files should be clean otherwise.

### Common Operations

```bash
# Start all services (detached, rebuild images)
docker compose up -d --build

# Stop all services
docker compose down

# Reset practice history only (keeps seeded data)
npm run reset:practice-history

# Wipe DB and reinitialize from seed scripts
docker compose down -v && docker compose up -d --build

# Run backend tests with coverage
cd backend && pytest tests/test_generator_*.py -v --cov=app.routers.generator --cov-report=term-missing
```

---

## Features

- Main recall practice for pseudocode, skeleton, and full-answer templates
- Live coaching while typing, with final LLM-only submission feedback
- Readiness Overview by skill-map pattern and template mode
- Practice history with stored attempts, live feedback snapshots, and final feedback
- Skill-map drill generation backed by stored practice history
- MCQ generation owned by generator core, with persisted MCQs in `question` and fingerprint dedupe

## Development

### Local Development

- Install dependencies: `npm install`
- Start frontend + backend: `npm run dev` (or `npm start`)
- Build for production: `npm run build`

Backend API runs on `http://localhost:3001` and persists data in PostgreSQL.

### Backend Unit Tests

The backend now has a focused pytest suite for generator-related behavior and incremental refactors.

- Install backend dependencies: `pip install -r backend/requirements.txt`
- Run all backend tests: `cd backend && pytest -v`
- Run unit-focused backend tests only: `cd backend && pytest -v -m "not integration"`
- Run integration tests only: `cd backend && pytest -v -m integration`
- Run generator-focused tests with coverage: `cd backend && pytest tests/test_generator_*.py -v --cov=app.routers.generator --cov-report=term-missing`

Test scope in this pass:
- generator utility normalization and edge cases
- core `SkillMapDrillGenerator` success + fallback paths
- extraction parity checks that `coach.py` uses generator-owned helpers

### Backend Architecture

The backend follows a layered architecture: routers → services → repositories → database.

```
backend/app/
├── routers/         # FastAPI endpoint handlers — thin orchestration only
│   ├── attempts.py
│   ├── coach.py
│   ├── admin.py
│   ├── generator.py
│   ├── assessor.py
│   └── narrator.py
├── services/        # Pure business logic — no FastAPI or DB dependencies
│   └── attempts_service.py   # build_skill_map_overview, build_skill_map_nodes
├── repositories/    # All SQL — one module per domain
│   ├── base.py                # acquire_connection() shared context manager
│   ├── types.py               # TypedDict row/result contracts
│   ├── attempts_repository.py # insert_score_attempt_row, fetch_skill_map_* rows
│   ├── coach_repository.py    # fetch_practice_history_entries, insert_feedback_event_row
│   └── admin_repository.py    # count/truncate practice history tables
├── models.py        # Pydantic request/response models
├── readiness.py     # Readiness score calculation
└── submission_rubric.py  # Rubric compaction helpers
```

**Repositories** own all SQL constants and row-shaping logic. They return typed `TypedDict` results defined in `repositories/types.py`.

**Services** receive typed rows from repositories and perform all aggregation, window math, and data transformation — no raw SQL, no FastAPI types.

**Routers** call one or more repository/service functions and map results to HTTP responses. They retain only LLM calling logic and endpoint orchestration.

### Docker Deployment

The application can be deployed using Docker and Docker Compose with separate containers for the frontend, backend, and database.

**Prerequisites:**
- Docker and Docker Compose installed

**Quick Start:**
```bash
docker-compose up --build
```

This will:
- Build the frontend (React + Vite) container
- Build the backend (Python + FastAPI) container
- Start PostgreSQL, backend, and frontend services
- Expose the frontend on `http://localhost:5173`
- Expose the backend API on `http://localhost:3001`
- Share a common network for inter-service communication

**Service Details:**
- **Frontend**: Built with multi-stage Docker build, serves optimized production build with Node.js serve
- **Backend**: Python FastAPI server with Uvicorn
- **PostgreSQL**: Transactional database exposed on local port `5432`
- All services communicate over a shared Docker network
- PostgreSQL data is persisted under `backend/data/postgres`

**Database Configuration:**
PostgreSQL is available to the backend at `postgresql://flashcard_user:flashcard_password@postgres:5432/flashcard_db`. The backend automatically connects to PostgreSQL and stores score attempts with full details.

**Database Schema:**
- **score_attempts**: Stores recall attempts, answers, accuracy, timing, template mode, generated card metadata, live-coach usage, and final feedback
- **coach_feedback_events**: Stores live feedback events and final submission feedback events
- **generated_skill_map_cards**: Stores generated drills and generation context
- **question**: Stores generated question content (recall + MCQ shape), including MCQ labels/text and correct-label/correct-text
- **answer**: Schema groundwork for future submitted answers (session/user placeholders retained for now)
- **patterns** and **methods**: Store the skill-map taxonomy

**API Endpoints:**
- `POST /api/attempts` - Save a main-recall attempt
- `GET /api/skill-map` - Load skill-map patterns and methods
- `GET /api/skill-map-overview` - Compute Readiness Overview
- `POST /api/coach/evaluate-attempt` - Score a submitted recall attempt
- `POST /api/coach/attempt-feedback` - Generate live or final coach feedback
- `POST /api/coach/history` - Load related practice history
- `POST /api/coach/session-plan` - Generate an end-of-session plan
- `POST /api/coach/skill-map-drills` - Generate and store skill-map practice cards

The backend uses FastAPI with `asyncpg` to connect to PostgreSQL.

**Stopping Services:**
```bash
docker-compose down
```

To remove the database volume:
```bash
docker-compose down -v
```

**Rebuilding After Code Changes:**
```bash
docker-compose up --build
```

### Database Initialization

Rebuild containers and initialize a fresh database:
```bash
docker compose down -v
docker compose up -d --build
```

The Postgres image loads scripts in this order:
- `backend/init-scripts/01-init.sql`
- `backend/init-scripts/05-data-patterns.sql`
- `backend/init-scripts/06-data-methods.sql`

### LLM Coach Feedback

The coach pipeline uses three distinct LLM roles, each with its own provider selection and token budget.
Generator behavior is centered in `backend/app/core/generator.py` through `SkillMapDrillGenerator` and MCQ generation helpers, while `coach.py` acts as API orchestration.
Provider resolution and shared JSON-call utilities are in `backend/app/core/llm.py` to avoid circular dependencies between coach and generator modules.

| Role | Purpose | Provider selection | Max tokens |
|------|---------|-------------------|------------|
| **Signal Assessor** | Structural assessment of each attempt (replaces ~1500 lines of rule-based signals) | Fastest available: Gemma → Claude → OpenAI | 600 |
| **Feedback Narrator** | Narrative coaching text for submission feedback | User-selected available provider | 1800 |
| **Practice Generator** | Seeds skill-map practice decks and creates adaptive repair variations | User-selected available provider | 2000 |

### MCQ Persistence Notes

- Endpoint: `POST /api/coach/multiple-choice-drills`
- Flow ownership: router -> `coach.py` delegator -> `generator.py` MCQ generation
- Persistence: generated MCQs are written to `question` via repository SQL
- Dedupe: `question.fingerprint` unique index prevents duplicate semantic MCQs
- Fingerprint input is normalized semantic content (question text + canonicalized choice texts + correct answer text), not raw model output formatting
- Persistence is fail-open: endpoint still returns generated drills if DB write fails, with server-side warning logs
- Provider fallback: if the selected provider returns an empty/invalid JSON payload, MCQ generation now tries the next configured available provider before returning an error
- Transient resilience: MCQ generation retries temporary provider failures with short backoff before failing or moving to the next provider

Live feedback (`liveMode=true`) uses only the Signal Assessor — no Narrator call.
Submission feedback (`liveMode=false`) runs Assessor → Narrator in sequence.

**Assessor output schema (v1):**
```json
{
  "v": 1,
  "patternIdentified": "sliding-window",
  "signals": {
    "structure":       { "score": 60, "note": "..." },
    "correctness":     { "score": 45, "note": "..." },
    "completeness":    { "score": 50, "note": "..." },
    "patternFidelity": { "score": 55, "note": "..." },
    "syntax":          { "valid": true, "error": null },
    "completionTime":  { "score": 70, "note": "..." }
  },
  "primaryBlocker": "...",
  "blockerKey": "...",
  "verdict": "needs-work",
  "errorTags": [...],
  "strengths": [...]
}
```

Backend provider settings:
- `LLM_DEFAULT` (default: `openai`; supported values: `openai`, `claude`, `gemma`)

OpenAI variables:
- `COACH_OPENAI_API_KEY` (preferred)
- `OPENAI_API_KEY` (also supported)
- `COACH_OPENAI_MODEL` (default: `gpt-5.2`)
- `COACH_OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)

Claude variables:
- `COACH_ANTHROPIC_API_KEY` (preferred)
- `ANTHROPIC_API_KEY` (also supported)
- `COACH_ANTHROPIC_MODEL` (default: `claude-sonnet-4-6`)
- `COACH_ANTHROPIC_BASE_URL` (default: `https://api.anthropic.com/v1`)

Gemma (local) variables:
- `COACH_GEMMA_BASE_URL` (default: `http://localhost:11434/v1`)
- `COACH_GEMMA_MODEL` (default: `gemma3:1b`)

Generator tuning variables (environment-backed):
- `COACH_GENERATOR_MAX_TOKENS` (default: `8000`)
- `COACH_GENERATOR_TIMEOUT_SECONDS` (default: `90`)
- `COACH_GENERATOR_TEMPERATURE` (default: `0.7`)
- `COACH_GENERATOR_READINESS_THRESHOLD` (default: `90`)
- `COACH_GENERATOR_PROMPT_WORDS` (default: `12`)
- `COACH_GENERATOR_PROMPT_MAX_CHARS` (default: `80`)
- `COACH_GENERATOR_PATTERN_HISTORY_LIMIT` (default: `0`, meaning unlimited)

Local dev example (OpenAI):
```bash
cd backend
export LLM_DEFAULT="openai"
export OPENAI_API_KEY="your_key_here"
venv/bin/python main.py
```

Local dev example (Claude):
```bash
cd backend
export LLM_DEFAULT="claude"
export ANTHROPIC_API_KEY="your_key_here"
venv/bin/python main.py
```

Local dev example (Gemma via Ollama):
```bash
ollama serve  # in a separate terminal
cd backend
export LLM_DEFAULT="gemma"
venv/bin/python main.py
```

Practice-history reset example:
```bash
cd backend
export ADMIN_RESET_TOKEN="reset-practice-history"
venv/bin/python reset_practice_history.py
```

Docker Compose example (`backend/.env` is loaded by the backend service):
```bash
cat > backend/.env <<'EOF'
PORT=3001
DATABASE_URL=postgresql://flashcard_user:flashcard_password@postgres:5432/flashcard_db
ADMIN_RESET_TOKEN=reset-practice-history
LLM_DEFAULT=openai
COACH_OPENAI_API_KEY=your_key_here
COACH_OPENAI_MODEL=gpt-5.2
COACH_OPENAI_BASE_URL=https://api.openai.com/v1
COACH_ANTHROPIC_API_KEY=
COACH_ANTHROPIC_MODEL=claude-sonnet-4-6
COACH_ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
COACH_GEMMA_BASE_URL=http://localhost:11434/v1
COACH_GEMMA_MODEL=gemma3:1b
EOF

docker-compose up --build
```

Verification:
- API response from `POST /api/coach/attempt-feedback` includes `"llmUsed": true` when the LLM response is used.
- Live feedback returns a single Assessor call in server logs (no Narrator call).
- Submission feedback logs two sequential calls: Assessor then Narrator.
- During submit/revise, the Submission Feedback panel shows a waiting placeholder state and then renders pills/content only after the new response arrives.

### Submission Feedback Behavior

Submission feedback (`liveMode=false`) is LLM-only.

- No rule-based local response is returned to users for submission grading/feedback.
- Backend retries LLM submission generation up to 3 times before failure.
- On failure, backend returns a structured error payload and frontend shows a modal with the provider-specific message.

Error payload shape for failed submission feedback requests:

```json
{
   "detail": {
      "code": "submission_feedback_no_response",
      "message": "Claude API error: insufficient credits. Add credits in your provider billing and try again.",
      "provider": "claude",
      "providerLabel": "Claude",
      "apiErrorCode": "provider_insufficient_credits"
   }
}
```

Common `apiErrorCode` values include:
- `provider_auth_error`
- `provider_insufficient_credits`
- `provider_rate_limited`
- `provider_model_error`
- `provider_network_error`
- `provider_timeout`

### Reset Practice History

To clear only generated practice history and coaching artifacts without touching seeded source data:

```bash
npm run reset:practice-history
```

This calls:
- `POST /api/admin/reset-practice-history`

It clears only:
- `score_attempts`
- `coach_feedback_events`
- `generated_skill_map_cards`

The request must include the confirmation token from `ADMIN_RESET_TOKEN`. By default the dev token is `reset-practice-history`.
