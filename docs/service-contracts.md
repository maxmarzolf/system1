# Service Contracts

Related docs:
- `../README.md`
- `./backend-architecture.md`
- `./migration-notes.md`

## Purpose

`app/services/contracts.py` is the canonical module for service-layer payload contracts.

It centralizes `TypedDict` and `TypeAlias` definitions used by service orchestration code so that:
- service boundaries are explicit,
- callback signatures stay consistent,
- payload refactors can remain behavior-preserving.

## Scope

Contracts in this module should represent service-level wiring surfaces such as:
- persistence callback payloads,
- history/progress summary payloads consumed across services,
- drill generation payloads,
- skill-map overview payload sections.

Repository row contracts remain in `app/repositories/types.py`.

## Current Contract Families

- History/progress contracts:
  - aliased from `app/domain/coach_context.py` where domain ownership is appropriate.
- Drill-generation contracts:
  - skill-map drill payloads,
  - MCQ choice/question payloads,
  - generation-context payloads used for persistence metadata.
- Skill-map overview contracts:
  - top-level summary,
  - pattern summaries and mode summaries,
  - review queue items,
  - ghost-rep activity sections.
- Feedback payload contract:
  - service-level feedback shape used across assessor/narrator/finalization/persistence flow.

## Placement Rules

- Add or update service boundary payload contracts in `app/services/contracts.py`.
- Keep domain-owned logic/data contracts in domain modules and alias them from services when reused.
- Keep SQL row contracts in `app/repositories/types.py`.

## Boundary Rules

- Services may import contracts from `app/services/contracts.py`.
- Core modules should remain framework-agnostic and avoid service-layer imports unless explicitly needed for non-transport aliases.
- Endpoints should not define ad-hoc payload dict contracts; they should consume service models/contracts.

## Refactor Guidance

When tightening contracts:
1. Add typed contracts first.
2. Thread them through function signatures and callback types.
3. Keep payload shape unchanged unless intentionally changing API behavior.
4. Run focused tests for affected modules.
5. Run full backend tests before landing.
