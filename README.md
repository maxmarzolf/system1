# System 1

System 1 is a practice app for coding-interview algorithms. You recall code from memory, get graded, and track where you're weak over time.

- **Practice** (`/`): recall a card's code from memory, or answer multiple-choice questions (MCQs). Optional supports: Ghost Reps (type over the target), Inline notes, AI completion, a Sliding Window Ladder, and adaptive or custom **flows** that mix all four modalities.
- **Dashboard** (`/dashboard`): readiness per algorithm and playlist; start focused practice from any card.
- **Journey** (`/practice-history`): a 3D *Signal Score Terrain* of every graded signal over time, a daily work grid, and the full stored evaluation of each submission on any day.
- **Tune** (`/tune`): local preferences: specimen style, editor, MCQ set size, grading strictness, hotkeys.
- **Admin** (`/admin`): edit the signals Jev uses to grade MCQs, try a draft against a stored question, and view the read-only recall specs.

Grading:

- **MCQs** are graded by **Jev** ([TypeSafe System One](https://docs.typesafe.ai)). One call asks whether the answer was correct, plus one question per signal defined in `/admin`.
- **Recall** answers are graded by an LLM assessor and narrator against per-algorithm signal specs.

## Stack

| Layer | Technology | Port |
|---|---|---|
| Frontend | React 19, Vite, TypeScript, react-router, CodeMirror, three.js | 5173 |
| Backend | Python 3.12, FastAPI, asyncpg (raw SQL) | 3001 |
| Database | PostgreSQL 16 | 5432 |
| Runtime | Docker Compose (`flashcard-postgres`, `flashcard-backend`, `flashcard-frontend`) | n/a |

## Getting started

```bash
npm install
```

```bash
docker compose up -d --build
```

Open http://localhost:5173. Or run the Vite dev server yourself (`npm run dev:client`) against the containers.

Configuration lives in `backend/.env` (gitignored). The backend reads it only when the container is **created**, so after editing it run `docker compose up -d backend`, not `restart`.

| Variable | Purpose |
|---|---|
| `TYPESAFE_API_KEY` | Jev, for MCQ grading. Without it, MCQs fall back to the stored answer key. |
| `JEV_MODEL` | Pinned Jev model (default `jev-1.13.0`). Also `TYPESAFE_BASE_URL`, `JEV_TIMEOUT_SECONDS`, `JEV_ENABLED`. |
| `LLM_DEFAULT` | Default coach provider: `openai`, `claude` or `gemma`. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `COACH_GEMMA_API_KEY` | Provider keys (each also has a `COACH_*` alias). |
| `COACH_OPENAI_MODEL`, `COACH_ANTHROPIC_MODEL`, `COACH_GEMMA_MODEL` | Provider models; `*_BASE_URL` overrides exist too. |
| `COACH_GENERATOR_*` | Drill generator tuning: tokens, timeout, temperature, readiness threshold, prompt length. |
| `ADMIN_RESET_TOKEN` | Confirmation token for `npm run reset:practice-history`. |

## How it fits together

```
React pages ──► FastAPI endpoints ──► services ──► domain / core ──► repositories ──► Postgres
                                         │
                                         ├──► Jev (MCQ grading, /admin "Try it")
                                         └──► LLM providers (drill generation, recall grading)
```

- Every answer goes to `POST /api/attempts`. An **evaluator registry** picks the grader by modality: `mcq` goes to Jev; `total-recall`, `microdrill` and `ghost-rep` go to the LLM graders. The result is stored as one `submission` row.
- **MCQ signals live in the database** and are read on every submission, so a save in `/admin` applies to the next answer with no restart. Signals are archived, never deleted; every change is versioned and logged.
- **Recall signal specs** live in `backend/app/core/signal_catalog.py` and are reseeded at startup.
- The schema is `backend/app/schema.sql`, applied idempotently at startup along with small upgrades and seeding in `backend/app/database.py`. There is no migration tool.

Docs:

| Doc | What it covers |
|---|---|
| [docs/data-flow.md](docs/data-flow.md) | Diagrams of every flow: practice, MCQ grading with Jev, review, `/admin` |
| [docs/database-schema.md](docs/database-schema.md) | ER diagram and what each table holds |
| [docs/backend-architecture.md](docs/backend-architecture.md) | Layer rules and request traces, module by module |
| [docs/service-contracts.md](docs/service-contracts.md) | Typed service payload contracts |
| [docs/content-architecture.md](docs/content-architecture.md) | How catalog content (problems, playlists) is modeled |
| [docs/migration-notes.md](docs/migration-notes.md) | History of moved and removed modules |

### Backend layering rules

A boundary test enforces these:

- SQL only in `backend/app/repositories/`; row types in `repositories/types.py`.
- Endpoints in `backend/app/endpoints/` stay thin and call services.
- Service payload contracts live in `backend/app/services/contracts.py`.
- `backend/app/core/` and `backend/app/domain/` stay framework-agnostic and never import repositories.

### Key modules

| Path | Role |
|---|---|
| `backend/app/core/jev/` | Jev REST client (`POST /v1/systemone`) |
| `backend/app/core/signals/` | Signal plug-ins: Jev questions built from DB rows; deterministic signals (e.g. `completionTime`) registered in code |
| `backend/app/services/evaluators/` | One evaluator per modality |
| `backend/app/services/signal_registry_service.py` | Loads the active MCQ spec for an algorithm; seeds defaults (insert-if-missing) |
| `backend/app/services/signal_admin_service.py` | `/admin`: list, create, edit, archive, restore, try |
| `backend/app/services/attempts_service.py` | Readiness, daily activity, day detail and signal history |
| `src/App.tsx` | The practice screen |
| `src/PracticeHistoryPage.tsx`, `src/SignalHologram.tsx` | Journey and the score terrain |
| `src/AdminPage.tsx`, `src/signalAdmin.ts` | `/admin` and its API client |

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/attempts` | Submit an answer; returns the evaluation |
| GET | `/api/skill-map`, `/api/skill-map-overview?historyDays=&tz=` | Taxonomy; readiness and daily activity |
| GET | `/api/history/day?date=&tz=`, `/api/history/signals?tz=` | One day's submissions; every scored signal over time |
| GET | `/api/catalog/playlists`, `/api/catalog/signal-specs` | Playlists; recall signal specs |
| GET | `/api/coach/problem-drills[/{algorithm} \| /technique/{t}]`, `/api/coach/playlist-drills/{slug}` | Catalog drills |
| POST | `/api/coach/skill-map-drills[-stream]`, `/api/coach/multiple-choice-drills`, `/api/coach/micro-drill` | Generated drills |
| POST | `/api/coach/adaptive-variation`, `/api/coach/sequential-variation`, `/api/coach/sliding-window-ladder` | Follow-up drills |
| POST | `/api/coach/inline-completion`, `/api/coach/session-plan`, `/api/coach/history` | Editor suggestions, session plan, practice history |
| GET | `/api/coach/provider-default` | Configured coach provider |
| GET, POST | `/api/admin/signals` | List or create MCQ signals |
| PUT | `/api/admin/signals/{key}`, `/api/admin/signals/directive/mcq` | Edit a signal; edit the correctness question |
| POST | `/api/admin/signals/{key}/archive`, `/restore` | Archive or restore |
| POST, GET | `/api/admin/signals/try`, `/samples`, `/revisions/{subject}` | Try a draft; sample MCQs; change history |
| POST | `/api/admin/reset-practice-history` | Clear submissions and generated problems |

## Testing

Both suites run in CI (`.github/workflows/tests.yml`) and fail if coverage drops below its floor: **90%** for the backend and **93% of statements** for the frontend. Run them before every commit, and add or update a test with every change.

### Frontend: Vitest, React Testing Library, jsdom

```bash
npm test
```

```bash
npm run test:coverage
```

`npm run test:watch` reruns on save. Tests sit next to the code (`src/*.test.ts[x]`); shared helpers are in `src/test/`:

- `mockFetch` stubs the API by route.
- `test/app.ts` has practice-screen helpers: drill fixtures, typing into CodeMirror, hotkeys.

WebGL is replaced with a fake renderer, so the terrain's scene, camera and hover logic run for real without a GPU. The HTML coverage report is written to `coverage/index.html`.

### Backend: pytest

Run from `backend/`. With the Docker Postgres running, point tests at it with `DATABASE_URL`:

```bash
cd backend && DATABASE_URL=postgresql://flashcard_user:flashcard_password@localhost:5432/flashcard_db ../.venv/bin/python -m coverage run -m pytest -q && ../.venv/bin/python -m coverage report
```

Unit tests only (no database):

```bash
cd backend && ../.venv/bin/python -m pytest -q -m "not integration"
```

A live call to Jev (uses `TYPESAFE_API_KEY`):

```bash
cd backend && ../.venv/bin/python -m pytest -q -m jev_live
```

Notes:

- LLM and Jev calls are always faked in tests; nothing reaches a provider except `-m jev_live`.
- Integration tests use your local database and restore what they change. They skip when Postgres isn't reachable; CI provides Postgres and fails if any integration test skips.
- `app/core/core_algorithms.py` and `core_meta.py` are excluded from coverage: they are the practice answer bank, read as source text.

## Operations

### Reset practice history

Clears `submission` and generated problems; the seeded catalog stays:

```bash
npm run reset:practice-history
```

### Reinitialize the database

Postgres data is a bind mount at `backend/data/postgres`, so `docker compose down -v` doesn't clear it:

```bash
docker compose down && rm -rf backend/data/postgres && docker compose up -d --build
```

### Troubleshooting

- **Backend unhealthy:** check `docker compose logs backend --tail=300` and `curl -i http://localhost:3001/api/health`. Schema errors on startup usually mean a database that predates the current schema; reinitialize it.
- **MCQ feedback says Jev is unavailable:** check `TYPESAFE_API_KEY` in `backend/.env`, then `docker compose up -d backend`.
- **Recall feedback unavailable:** check the provider key for `LLM_DEFAULT` and the provider's billing. Anthropic reports exhausted credits as `invalid_request_error`.

## Commits

Claude Code is configured (`.claude/settings.json`) not to add attribution trailers to commits or pull requests.
