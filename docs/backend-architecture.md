# Backend Architecture Map

Related docs:
- `../README.md`
- `./migration-notes.md`
- `./service-contracts.md`

## Canonical Dependency Flow

Request flow is now:

`endpoints -> services -> domain/core helpers -> repositories -> database`

Hard rules:
- Endpoints are transport-only and call services.
- Services orchestrate use-cases and persistence boundaries.
- Service input/output and callback payloads are defined in `app/services/contracts.py`.
- Domain modules are pure logic and cannot import repositories.
- Repositories are SQL-only access boundaries.

## Canonical Request Traces

### 1) Final Submission Evaluation and Persistence
1. `POST /api/attempts` in `app/endpoints/attempts.py`
2. `app/services/submission_service.py::create_submission`
3. `app/services/feedback_service.py::coach_submission_evaluation`
4. `app/services/history_service.py::load_feedback_context`
5. `app/core/assessor.py::run_signal_assessor`
6. `app/core/narrator.py::attempt_feedback_with_narrator`
7. `app/domain/submission_evaluation.py::canonical_submission_evaluation`
8. `app/services/attempts_service.py::create_attempt` persists the canonical result.

The client sends the attempt once and never supplies its own verdict or evaluation signals. The submission service owns the complete final-evaluation transaction. `POST /api/coach/live-feedback` is a separate, non-persisted assessor-only path for coaching while the user is still typing.

### 1b) Coach Variations
1. `POST /api/coach/adaptive-variation` or `POST /api/coach/sequential-variation`
2. `app/services/coach_service.py` facade delegates to orchestration layer
3. `app/services/coach_orchestration_service.py` handles transport translation
4. `app/services/variation_service.py` owns variation orchestration and drill assembly

### 2) Practice History
1. `POST /api/coach/history` in `app/endpoints/coach.py`
2. `app/services/coach_service.py::coach_practice_history`
3. `app/services/history_service.py::coach_practice_history`
4. `app/repositories/coach_repository.py::fetch_practice_history_entries`

### 3) Admin Reset
1. `POST /api/admin/reset-practice-history` in `app/endpoints/admin.py`
2. `app/services/admin_service.py::reset_practice_history`
3. `app/core/admin.py::reset_practice_history`
4. `app/repositories/admin_repository.py::*`

## Responsibility Matrix

| Layer | Owns | Must Not Own |
|---|---|---|
| `app/endpoints` | HTTP request/response binding | SQL, orchestration, LLM retries |
| `app/services` | Use-case orchestration, dependency wiring, persistence orchestration, service-level TypedDict contracts | FastAPI framework coupling, SQL text |
| `app/domain` | Pure decision logic, scoring, profiles, error taxonomy helpers | Repositories, HTTP exceptions |
| `app/core` | Cross-domain engines (assessor, narrator, generator, provider adapters) | Endpoint orchestration, direct route handling |
| `app/repositories` | SQL statements and row-level data access | Business branching/orchestration |
| `app/config.py` | Environment-backed runtime configuration | Request-scoped decisions |

## Dependency Rules and Anti-Patterns

Rules enforced in tests:
- Endpoints cannot import `app.core.*`.
- Services cannot import `app.endpoints.*` or `fastapi`.
- Domain modules cannot import `app.repositories.*`.
- Core modules cannot import `app.repositories.*`, `fastapi`, or `starlette`.
- Repository modules cannot import `app.services.*` or `app.endpoints.*`.

Practical implications:
- Streaming transport wrappers (for example `StreamingResponse`) are endpoint-owned.
- Core generator stream APIs return framework-agnostic async iterators.
- Repository writes are always delegated by services; attempt signals are persisted through the canonical submission repository.

The canonical `submission.signals` JSONB object has exactly two top-level fields:

- `elapsed_ms`
- `evaluation`

`evaluation` contains the versioned verdict, score, primary failure, dimensions, modifiers, recommended action, narrative feedback, and provenance. Narrative feedback does not embed another copy of the evaluation. The ledger's `successful` value is derived from `evaluation.verdict`; it is never accepted from the client.

Anti-pattern examples:
- Endpoint calling repository directly.
- Domain function raising transport exceptions.
- Core module writing database rows directly for request use-cases.
- Service embedding raw SQL.
