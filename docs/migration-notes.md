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
- `app/domain/template_evaluator.py`
- `app/domain/llm_resilience.py`
- `app/domain/feedback_builder.py`
- `app/domain/coach_profiles.py`
- `app/domain/coach_orchestrator.py`

## Core Coach Changes

- `app/core/coach.py` has been removed.
- Coach route orchestration now resolves through service modules directly.
- Feedback rubric and profile constants moved to domain modules.
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
