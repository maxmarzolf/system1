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

## 5. One grading pipeline for every modality (branch `feature/unified-jev-submissions`)

Every modality now follows the MCQ flow: a generated question is stored, the learner answers, Jev grades, and one result view shows the result. See [grading.md](grading.md).

Backend:

- **One signal system:** `core/signal_catalog.py` (recall specs in code, copied into `algorithm.signal_spec`) is gone. Every modality's signals are `signal_definition` rows keyed by `(modality, key)`, seeded from `core/signals/defaults.py` and edited on `/admin`. Shared keys (`nearMiss`, `completionTime`, `syntaxValid`) mean the same thing everywhere.
- **One pipeline:** `services/evaluation/` replaced `services/evaluators/`. The LLM assessor and narrator, the semantic grader and `domain/recall_soundness.py` were removed. Each modality only adds a context builder.
- **Hard code checks:** answers that are empty, don't parse or never return are incorrect whatever Jev says. Calibration (`scripts/jev_recall_calibration.py`) found Jev accepting a return-less answer.
- **Banded verdict:** `close` now means a `nearMiss` score at or above an Admin threshold, instead of an LLM's three-way verdict.
- **Feedback text** is written by an optional LLM step from Jev's results, and never changes the grade.
- **Stored exercises:** microdrills and Ladder rungs are stored in `generated_exercise` and graded against the stored copy. Ladder is its own modality (it was saved as `microdrill`).
- **Server-side settings:** `app_setting` holds grading, generation and practice settings, edited in Admin → Settings.

Frontend:

- `shared/modality.ts` (one vocabulary), `shared/evaluation/` (types, readers, `EvaluationResult`), `features/practice/submission/` (one submit path and save state), and `features/practice/modalities/{mcq,recall,microdrill,ladder}/`. ESLint forbids a modality importing another.
- Admin has a rail of modalities, each with the same signal editor, plus Settings. Tune keeps only editor, AI completion and hotkey preferences. The specimen, MCQ, submission and playlist tuning modules were removed.

History before this change mixes evaluations from the old LLM assessor with Jev's under the same keys. The stored spec reference (modality, version, hash) tells them apart.

## 6. Journey terrain shows competency per algorithm

The terrain's X axis was every signal key (Solution Structure, nearMiss, windowState…), and its height was shortfall, so peaks were weak spots. That mixed unrelated measures and didn't point at anything to practise. It now shows **competency per algorithm per day**: the average of every scored signal from that algorithm's answers that day, and peaks are strong. On days without practice, the last value fades by an Admin setting (default 2% a day, compounded). One aggregate query computes it (`GET /api/history/competency`); the browser's Gaussian smoothing (`signalTerrain.ts`) was removed, and `GET /api/history/signals` with it.

The Competency section beside it was added to make the data readable for decisions: a list ranked weakest first, labelled Learn (never strong) / Review (was strong, has faded) / Strong, with a trend line and a Practise button, and a 2D heatmap of algorithms by day whose practised days open the day detail. The learn/review/strong label comes from the same query. The separate heatmap was later folded into the list: long decay made most of it orange and red, so each row now carries a free-fall `!` (or a `-` when never practised) and expands into its own history graph, heat strip and strongest/weakest signals.
