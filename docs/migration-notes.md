# Migration Notes

Related docs:
- `../README.md`
- `./backend-architecture.md`
- `./service-contracts.md`

## New Service Modules

The coach service was split into capability-focused modules:
- `app/services/coach_orchestration_service.py`
- `app/services/drill_generation_service.py`
- `app/services/evaluation_service.py`
- `app/services/feedback_service.py`
- `app/services/history_service.py`
- `app/services/prompt_explanation_service.py`
- `app/services/session_service.py`
- `app/services/variation_service.py`
- `app/services/coach_service.py` (facade for endpoint compatibility)
- `app/services/contracts.py` (canonical service payload and callback contracts)

## New Domain Modules

Introduced domain-focused modules:
- `app/domain/recall_soundness.py`
- `app/domain/llm_resilience.py`
- `app/domain/feedback_builder.py`
- `app/domain/coach_orchestrator.py`

## Core Coach Changes

- `app/core/coach.py` has been removed.
- Coach route orchestration now resolves through service modules directly.
- LLM resilience/error taxonomy moved under `app/domain/llm_resilience.py`.
- Submission provider transport moved to `app/core/submission_llm_client.py`.
- Adaptive/sequential variation orchestration moved to `app/services/variation_service.py`.
- Attempt-feedback orchestration moved to phased helpers in `app/services/feedback_service.py`.
- Prompt-toggle, session-plan, and drill generation orchestration moved to dedicated service modules.
- Skill-map stream transport wrapping (`StreamingResponse`) is now endpoint-owned; core generator returns framework-agnostic stream iterators.

## Folder Convention Decision

- Canonical route folder is `app/endpoints/`.
- Legacy `app/routers/` directory removed.

## Compatibility Notes

- Endpoint request/response contracts are unchanged.
- Existing endpoint call-sites continue to use `app/services/coach_service.py`.
- Full backend tests pass after migration.

## Contract Hardening Status

The migration now includes explicit service/core contract typing without behavior changes:
- History and progress summaries are typed via `app/domain/coach_context.py` and reused by services.
- Skill-map overview payload sections (`summary`, `patterns`, `reviewQueue`, `ghostRepActivity`) are explicitly typed in `app/services/contracts.py`.
- Drill-generation and persistence callback payloads are typed in `app/services/contracts.py` and threaded through orchestration services.
- Generator runtime/context payload boundaries in `app/core/generator.py` use named aliases and TypedDicts for lower ambiguity.

These changes are additive: they tighten boundaries and readability, while preserving external API shape and runtime behavior.

## Signal Specs and Legacy Removal

Signals moved from one hardcoded set to per-algorithm specs (`app/core/signal_catalog.py`, stored in `algorithm.signal_spec`). Removed in the same change:
- The four competing signal vocabularies: the hardcoded assessor signal list, `SUBMISSION_DIMENSION_LABELS` / `ADAPTIVE_VARIATION_STRATEGIES` (`app/domain/coach_profiles.py`, deleted), `CORE_DIMENSION_ORDER` / `MODIFIER_ORDER`, and the unreachable per-pattern template profiles.
- `app/domain/template_evaluation.py` and its `template_evaluator.py` shim. The deterministic fallback is now `app/domain/recall_soundness.py::evaluate_recall_soundness`.
- `POST /api/coach/live-feedback`, the assessor live mode, `CoachAttemptFeedbackResponse`, and the `liveMode` / `liveMilestones` / `liveCoachTuning` / `enabledTemplateModes` / `previousAttempts` request fields.
- All one-time startup migrations in `app/database.py`: `answer` to `submission`, the `score_attempts` backfill, the column folding into `signals`, the `static_function*` / `core_algorithm_*` renames, the legacy taxonomy slug remap, the `arrays-hash-maps` retirement, and the `RETIRED_SKILLS` / `PATTERN_TO_ALGORITHM` constants.
- `submission.migration_key` and its index.
- `backend/init-scripts/`. The canonical schema now lives in `backend/app/schema.sql` and is applied idempotently on every startup.

Databases that predate these migrations must be reinitialized (see the README).
