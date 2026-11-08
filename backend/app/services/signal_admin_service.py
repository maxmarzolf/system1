"""Signal administration for /admin: list, create, edit, archive, restore, try.

Every write is validated against Jev's rules,
guarded by the row's version, and recorded in ``signal_definition_revision``.
Changes apply to the next evaluation (see ``signal_registry_service``).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.jev import JevGateway, JevUnavailableError
from app.core.signals import DETERMINISTIC_IMPLEMENTATIONS, SignalContext, applies, definition_to_plugin
from app.core.signals.mcq import MCQ_MODALITY, MCQ_STATE_FIELDS
from app.domain.signal_definition_rules import (
    GENERAL_SCOPE,
    normalize_definition,
    normalize_directive,
    validate_definition,
    validate_directive,
)
from app.models import SignalDefinitionDraft, SignalDirectiveUpdate
from app.repositories import multiple_choice_repository, signal_definition_repository
from app.repositories.signal_definition_repository import SignalVersionConflict
from app.services import jev_gateway
from app.services.submission_context_service import mcq_context_for

# Stored (snake_case) field -> API (camelCase) field.
API_FIELDS = {
    "applies_when": "appliesWhen",
    "needs_correctness": "needsCorrectness",
    "score_map": "scoreMap",
    "display_order": "displayOrder",
    "created_at": "createdAt",
    "updated_at": "updatedAt",
    "archived_at": "archivedAt",
    "correctness_weight": "correctnessWeight",
}
STORED_FIELDS = {api: stored for stored, api in API_FIELDS.items()}
TRY_KEY = "draftSignal"


class SignalValidationError(ValueError):
    def __init__(self, errors: dict[str, str]):
        super().__init__("Signal is invalid.")
        self.errors = {API_FIELDS.get(field, field): message for field, message in errors.items()}


class SignalNotFoundError(LookupError):
    pass


class SignalConflictError(RuntimeError):
    pass


class SignalTryError(RuntimeError):
    pass


def _to_api(record: dict[str, Any]) -> dict[str, Any]:
    return {API_FIELDS.get(field, field): value for field, value in record.items()}


def _from_draft(draft: SignalDefinitionDraft) -> dict[str, Any]:
    return {STORED_FIELDS.get(field, field): value for field, value in draft.model_dump().items()}


def _empty_context() -> SignalContext:
    return SignalContext(modality=MCQ_MODALITY, state={field: f"<{field}>" for field in MCQ_STATE_FIELDS})


def _signal_view(definition: dict[str, Any], weight_total: float) -> dict[str, Any]:
    view = _to_api(definition)
    try:
        view["jevQuestion"] = definition_to_plugin(definition).question(_empty_context())
    except KeyError:
        view["jevQuestion"] = None
    weight = 0.0 if definition["role"] == "diagnostic" else float(definition["weight"])
    view["effectiveShare"] = round(weight / weight_total, 4) if weight_total > 0 and definition["status"] == "active" else 0.0
    return view


def _scope_total(directive: dict[str, Any], definitions: list[dict[str, Any]], scope: str) -> float:
    """Total weight a submission in ``scope`` is scored against: correctness + general + scoped."""
    total = float(directive["correctness_weight"])
    for definition in definitions:
        if definition["status"] != "active" or definition["role"] == "diagnostic":
            continue
        if definition["scope"] in (GENERAL_SCOPE, scope):
            total += float(definition["weight"])
    return total


async def list_signals(modality: str = MCQ_MODALITY) -> dict[str, Any]:
    directive = await signal_definition_repository.fetch_directive(modality)
    if directive is None:
        raise SignalNotFoundError(f"No correctness question is stored for {modality!r}.")
    definitions = await signal_definition_repository.fetch_definitions(modality)
    algorithms = await signal_definition_repository.fetch_algorithms()
    return {
        "modality": modality,
        "stateFields": list(MCQ_STATE_FIELDS),
        "directive": {
            **_to_api(directive),
            "labels": ["1", "0"],
            "weightShare": round(
                float(directive["correctness_weight"]) / _scope_total(directive, definitions, GENERAL_SCOPE), 4
            ),
        },
        "signals": [
            _signal_view(definition, _scope_total(directive, definitions, definition["scope"]))
            for definition in definitions
        ],
        "algorithms": algorithms,
        "implementations": [
            {"name": name, "label": implementation.label, "description": implementation.description}
            for name, implementation in sorted(DETERMINISTIC_IMPLEMENTATIONS.items())
        ],
    }


async def _validated(draft: dict[str, Any]) -> dict[str, Any]:
    definition = normalize_definition(draft)
    algorithms = await signal_definition_repository.fetch_algorithms()
    errors = validate_definition(
        definition,
        algorithm_slugs={algorithm["slug"] for algorithm in algorithms},
        implementations=set(DETERMINISTIC_IMPLEMENTATIONS),
    )
    if errors:
        raise SignalValidationError(errors)
    return definition


async def create_signal(draft: SignalDefinitionDraft, modality: str = MCQ_MODALITY) -> dict[str, Any]:
    definition = await _validated(_from_draft(draft))
    created = await signal_definition_repository.insert_definition(definition, modality)
    if created is None:
        raise SignalConflictError(
            f"A signal with key {definition['key']!r} already exists. Keys are permanent, even when archived."
        )
    return _to_api(created)


async def update_signal(key: str, draft: SignalDefinitionDraft, version: int) -> dict[str, Any]:
    definition = await _validated({**_from_draft(draft), "key": key})
    try:
        updated = await signal_definition_repository.update_definition(key, definition, version)
    except SignalVersionConflict as error:
        raise SignalConflictError(str(error)) from error
    if updated is None:
        raise SignalNotFoundError(f"Unknown signal {key!r}.")
    return _to_api(updated)


async def set_signal_status(key: str, archived: bool, version: int) -> dict[str, Any]:
    try:
        updated = await signal_definition_repository.set_definition_status(
            key, "archived" if archived else "active", version
        )
    except SignalVersionConflict as error:
        raise SignalConflictError(str(error)) from error
    if updated is None:
        raise SignalNotFoundError(f"Unknown signal {key!r}.")
    return _to_api(updated)


async def update_directive(body: SignalDirectiveUpdate, modality: str = MCQ_MODALITY) -> dict[str, Any]:
    directive = normalize_directive(
        {"instructions": body.instructions, "criteria": body.criteria, "correctness_weight": body.correctnessWeight}
    )
    errors = validate_directive(directive)
    if errors:
        raise SignalValidationError(errors)
    directive.pop("extra_labels")
    try:
        updated = await signal_definition_repository.update_directive(modality, directive, body.version)
    except SignalVersionConflict as error:
        raise SignalConflictError(str(error)) from error
    if updated is None:
        raise SignalNotFoundError(f"No correctness question is stored for {modality!r}.")
    return _to_api(updated)


async def signal_revisions(subject: str) -> list[dict[str, Any]]:
    return await signal_definition_repository.fetch_revisions(subject)


async def mcq_samples() -> list[dict[str, Any]]:
    return [dict(problem) for problem in await multiple_choice_repository.fetch_recent_multiple_choice_problems()]


async def try_signal(
    draft: SignalDefinitionDraft,
    problem_id: str,
    choice_id: str,
    gateway_factory: Callable[[], JevGateway] | None = None,
) -> dict[str, Any]:
    """Ask Jev one draft signal question about a stored MCQ answered with ``choice_id``.

    Nothing is saved. ``answeredCorrectly`` comes from the stored answer key.
    """
    raw = _from_draft(draft)
    definition = await _validated({**raw, "key": raw["key"] or TRY_KEY})
    context = await mcq_context_for(problem_id, choice_id)
    successful = context.answer_key_correct
    state: dict[str, Any] = context.jev_state()
    if definition["needs_correctness"]:
        state["answeredCorrectly"] = 1 if successful else 0
    signal_context = SignalContext(modality=MCQ_MODALITY, state=state, elapsed_ms=context.elapsed_ms)
    plugin = definition_to_plugin(definition)
    question = plugin.question(signal_context)
    base = {
        "state": state,
        "answeredCorrectly": successful,
        "applies": applies(plugin, successful),
        "question": question,
    }
    if question is None:
        return {**base, "answer": None, "result": plugin.interpret(None, signal_context, successful).to_json()}
    try:
        gateway = (gateway_factory or jev_gateway.default_jev_gateway)()
        response = await gateway.system_one(state, {definition["key"]: question})
    except JevUnavailableError as error:
        raise SignalTryError(f"Jev is unavailable ({error.code}): {error.message}") from error
    answer = response.answers[definition["key"]]
    return {
        **base,
        "answer": answer,
        "result": plugin.interpret(answer, signal_context, successful).to_json(),
        "model": response.model,
        "requestId": response.request_id,
        "usage": response.usage,
    }
