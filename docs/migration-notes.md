# Migration Notes

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

## New Domain Modules

Introduced domain-focused modules:
- `app/domain/template_evaluator.py`
- `app/domain/llm_resilience.py`
- `app/domain/feedback_builder.py`
- `app/domain/coach_profiles.py`
- `app/domain/coach_orchestrator.py`

## Core Coach Changes

- `app/core/coach.py` no longer imports repositories directly.
- Skill-map and multiple-choice persistence are injected from services.
- Feedback rubric and profile constants moved to domain modules.
- LLM resilience/error taxonomy moved under `app/domain/llm_resilience.py`.
- Submission provider transport moved to `app/core/submission_llm_client.py`.
- Adaptive/sequential variation orchestration moved to `app/services/variation_service.py`.
- Attempt-feedback orchestration moved to phased helpers in `app/services/feedback_service.py`.
- Prompt-toggle, session-plan, and drill generation orchestration moved to dedicated service modules.
- `app/core/coach.py` now acts as a compatibility shim with thin delegates and parity exports.

## Folder Convention Decision

- Canonical route folder is `app/endpoints/`.
- Legacy `app/routers/` directory removed.

## Compatibility Notes

- Endpoint request/response contracts are unchanged.
- Existing endpoint call-sites continue to use `app/services/coach_service.py`.
- Full backend tests pass after migration.
