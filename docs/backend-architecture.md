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

### 1) Coach Submission Feedback
1. `POST /api/coach/attempt-feedback` in `app/endpoints/coach.py`
2. `app/services/coach_service.py::coach_attempt_feedback`
3. `app/services/feedback_service.py::coach_attempt_feedback`
4. `app/services/history_service.py::load_feedback_context`
5. `app/core/assessor.py::run_signal_assessor`
6. `app/core/narrator.py::attempt_feedback_with_narrator` (submission mode)
7. The frontend includes the returned feedback and rubric when it persists the canonical `submission` row.

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

The canonical `submission.signals` JSONB object contains the feedback and timing data for an attempt:

- `coach_feedback`
- `submission_rubric`
- `elapsed_ms`

The API maps these to `signals.coachFeedback`, `signals.submissionRubric`, and `signals.elapsedMs`. Correctness is represented by `accuracy`; the ledger does not store separate `is_correct` or `exact` columns.

Anti-pattern examples:
- Endpoint calling repository directly.
- Domain function raising transport exceptions.
- Core module writing database rows directly for request use-cases.
- Service embedding raw SQL.
