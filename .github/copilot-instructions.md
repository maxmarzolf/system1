# Copilot Instructions — System1 Recall Trainer

See the **Agent Guide** section in [README.md](../README.md) for the full quick-reference.

## Key Conventions

- All SQL belongs in `backend/app/repositories/`. Never write raw SQL in a router or service.
- Services (`backend/app/services/`) are pure Python — no FastAPI types, no asyncpg.
- Routers are thin orchestration only — no business logic or data shaping.
- TypedDict row contracts live in `backend/app/repositories/types.py`.
- `Import "fastapi" could not be resolved` in the editor is a virtualenv path false positive — ignore it.
- `problem` is the canonical content table for all non-MCQ practice cards.
- `submission.problem_slug` is the many-to-one foreign key from attempts to canonical problems.
- `playlist` and `playlist_problem_order` organize problem rows; they must not copy problem content.
- Do not create or reintroduce `practice_*` content tables or `generated_skill_map_cards`.
- MCQ remains on `multiple_choice_problem` and is intentionally outside the current canonical-content migration.

## Test and Coverage Contract

- Every backend modification must add or update a focused regression test unless the change is documentation-only.
- When removing or migrating a route, table, repository function, or runtime path, remove or rewrite tests that assert the deleted behavior in the same change.
- Run `cd backend && coverage run -m pytest -q && coverage report` for backend changes. The configured app-only branch coverage gate is 50%.
- Do not satisfy coverage by testing implementation strings alone when a repository/service behavior test is practical; source guards are reserved for schema and architecture invariants.
- Before finishing, run the full suite and the relevant integration marker. A skipped integration test is not validation when Postgres is available.

## Before Modifying Backend Code

1. Read the target router to understand what it delegates to (repository vs. service).
2. If adding SQL, add a constant + function to the relevant `*_repository.py`.
3. If adding aggregation logic, add it to `*_service.py` and accept typed rows as input.
4. Run `cd backend && ../.venv/bin/python -m pytest -v` to verify no regressions.
5. Run `cd backend && ../.venv/bin/python -m coverage run -m pytest -q && ../.venv/bin/python -m coverage report`.

## Before Modifying Frontend Code

- Page components live in `src/`. Routes are in `src/App.tsx`. Nav links are in `src/TopNav.tsx`.
- API base URL is `http://localhost:3001`. The Vite dev proxy forwards `/api/*` to the backend.
- TypeScript types for skill-map data are in `src/data/skill-map.ts`.
- Host-side tests need `DATABASE_URL=postgresql://flashcard_user:flashcard_password@localhost:5432/flashcard_db`; the Docker-only `.env` hostname `postgres` is not resolvable from macOS.
- Frontend validation is `npm run build`.

## Content Migration Rules

- Static Python/TypeScript catalogs are seed or temporary fallback inputs only; runtime reads should use repositories backed by `problem`.
- Generated drills write directly to `problem` with `source_type = 'generated-llm'`.
- Preserve `submission.generated_card` as the historical snapshot even when the canonical problem changes.
- Taxonomy pruning must be source-scoped so generated and playlist problems survive core catalog refreshes.
- If a change makes a previous test obsolete, delete or rewrite that test in the same change and add the replacement behavior test.

## Environment

- Local: `backend/.env` is loaded by Docker Compose backend service.
- Required vars: `DATABASE_URL`, `ADMIN_RESET_TOKEN`, `COACH_LLM_PROVIDER`, and at least one LLM provider key.
- All env vars have defaults in `backend/app/config.py`.
