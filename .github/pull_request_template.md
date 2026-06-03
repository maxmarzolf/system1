## Architecture Checklist

- [ ] Endpoint handlers remain thin and only delegate to services.
- [ ] Service modules contain orchestration only (no raw SQL, no FastAPI imports).
- [ ] Domain modules do not import repositories.
- [ ] Repository layer contains SQL only.
- [ ] Added/updated tests for any changed service slice.
- [ ] Updated docs in `docs/backend-architecture.md` or `docs/migration-notes.md` when moving responsibilities.

## Dependency Rule Spot-Check

- [ ] No `app.core` imports inside `app/endpoints`.
- [ ] No `app.endpoints` or `fastapi` imports inside `app/services`.
- [ ] No `app.repositories` imports inside `app/domain`.

## Anti-Pattern Guard

Confirm this PR does not introduce:
- [ ] Endpoint -> repository direct calls.
- [ ] Domain -> HTTP exception translation.
- [ ] Service-layer raw SQL strings.
- [ ] Duplicated orchestration paths across core and services.
