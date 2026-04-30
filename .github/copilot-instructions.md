# Copilot Instructions — System1 Recall Trainer

See the **Agent Guide** section in [README.md](../README.md) for the full quick-reference.

## Key Conventions

- All SQL belongs in `backend/app/repositories/`. Never write raw SQL in a router or service.
- Services (`backend/app/services/`) are pure Python — no FastAPI types, no asyncpg.
- Routers are thin orchestration only — no business logic or data shaping.
- TypedDict row contracts live in `backend/app/repositories/types.py`.
- `Import "fastapi" could not be resolved` in the editor is a virtualenv path false positive — ignore it.

## Before Modifying Backend Code

1. Read the target router to understand what it delegates to (repository vs. service).
2. If adding SQL, add a constant + function to the relevant `*_repository.py`.
3. If adding aggregation logic, add it to `*_service.py` and accept typed rows as input.
4. Run `cd backend && pytest -v` to verify no regressions.

## Before Modifying Frontend Code

- Page components live in `src/`. Routes are in `src/App.tsx`. Nav links are in `src/TopNav.tsx`.
- API base URL is `http://localhost:3001`. The Vite dev proxy forwards `/api/*` to the backend.
- TypeScript types for skill-map data are in `src/data/skill-map.ts`.

## Environment

- Local: `backend/.env` is loaded by Docker Compose backend service.
- Required vars: `DATABASE_URL`, `ADMIN_RESET_TOKEN`, `COACH_LLM_PROVIDER`, and at least one LLM provider key.
- All env vars have defaults in `backend/app/config.py`.
