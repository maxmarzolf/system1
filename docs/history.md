# Design history

The major structural changes, oldest first, and what each one replaced. Use it to understand why the code looks the way it does; for the current design, see [backend-architecture.md](backend-architecture.md) and [frontend.md](frontend.md). Commit history has the detail.

## 1. Coach split into layers

The monolithic `app/core/coach.py` and the `app/routers/` folder were replaced by the current layers.

- **Endpoints:** `app/endpoints/`.
- **Services by capability:** drill generation, evaluation, feedback, history, sessions, variations, plus `coach_orchestration_service`.
  - `coach_service.py` stayed as a thin facade so endpoint call sites didn't change.
  - `services/contracts.py` became the home for payload types passed between services.
- **Domain modules:** `recall_soundness`, `llm_resilience`, `feedback_builder`.
- **Provider transport:** moved to `core/submission_llm_client.py`.
- **Streaming:** the generator returns framework-free iterators, and the endpoint wraps them.

API request and response shapes did not change.

## 2. Canonical content and schema

- **One content table:** practice content was consolidated into `problem`, with `submission` as the single attempt ledger and playlists that only reference problems.
- **Schema file instead of migrations:** one-time startup migrations were deleted (`answer` → `submission`, the `score_attempts` backfill, slug remaps, `arrays-hash-maps` retirement), along with `backend/init-scripts/` and `submission.migration_key`.
  - The schema now lives in `app/schema.sql`, applied idempotently at every startup.
  - Databases older than this must be reinitialized (see the README).

## 3. Per-algorithm recall signal specs

Four competing signal vocabularies were replaced by one spec per algorithm in `core/signal_catalog.py`, seeded into `algorithm.signal_spec`. The assessor prompt, required-signal validation, rubric, scores and variation strategy all come from the resolved spec, and each stored evaluation records which spec and version graded it.

Removed in the same change:

- `domain/coach_profiles.py`, `domain/template_evaluation.py` and its shim;
- `POST /api/coach/live-feedback` and the assessor's live mode;
- several unused request fields.

## 4. Jev grades MCQs (branch `jev-signals`)

MCQs moved from the answer key to Jev (TypeSafe System One):

- **Evaluator registry:** `services/evaluators/` now holds one evaluator per modality, so `submission_service` only dispatches and persists.
- **Jev client:** `core/jev/client.py`, a REST client built on httpx; the official SDK needed a newer pydantic.
- **Signal plug-ins:** `core/signals/` holds Jev questions built from data, plus deterministic signals registered in code.
- **Database-backed signals:** `signal_definition`, `signal_evaluation_directive` and `signal_definition_revision`, edited on `/admin` and read on every submission. Jev Choice labels keep their order because `criteria` is stored as JSON, not JSONB.
- **Algorithm scope:** MCQ algorithm resolution now maps pattern tags to algorithm slugs (`heap-priority-queue` → `heap`), so algorithm-scoped signals apply.

The frontend gained:

- **Journey:** a daily work grid in the viewer's time zone, a day detail with each stored evaluation, and the Signal Score Terrain.
- **Admin:** organized by question type and scope.
- A pinned nav, and section snapping on Journey.

Removed:

- the troubleshooting panel and the signal spec preview endpoint;
- the Tune Signals section (moved to Admin);
- the admin token;
- the never-rendered spaced-repetition panel and its backend computation;
- dead coach modules (`coach_orchestrator`, `core/attempts`, `core/admin`, `FeedbackRails`).

Added at the same time:

- a Vitest suite for the frontend, and backend coverage raised to a 90% gate;
- this docs set.
