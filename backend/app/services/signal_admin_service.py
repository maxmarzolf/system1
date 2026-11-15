"""Signal administration for /admin, the same for every modality: list, create, edit, archive,
restore, preview and try.

Every write is validated against Jev's rules, guarded by the row's version, and recorded in
``signal_definition_revision``. Changes apply to the next evaluation (see
``signal_registry_service``). "Try" builds a submission through the same context builders the
evaluation pipeline uses, so a draft is tested against exactly the state Jev will see.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.jev import JevGateway, JevUnavailableError
from app.core.signals import DETERMINISTIC_IMPLEMENTATIONS, SignalContext, applies, definition_to_plugin
from app.core.signals.defaults import MODALITIES, MODALITY_DEFAULTS
from app.domain.signal_definition_rules import (
    GENERAL_SCOPE,
    normalize_definition,
    normalize_directive,
    validate_definition,
    validate_directive,
)
from app.models import AttemptCreate, SignalDefinitionDraft, SignalDirectiveUpdate
from app.repositories import exercise_repository, multiple_choice_repository, signal_definition_repository, unified_catalog_repository
from app.repositories.signal_definition_repository import SignalVersionConflict
from app.services import jev_gateway
from app.services.evaluation.contexts.code import recall_reference
from app.services.evaluation.pipeline import context_builder

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
    "correctness_source": "correctnessSource",
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


def _require_modality(modality: str) -> None:
    if modality not in MODALITY_DEFAULTS:
        raise SignalNotFoundError(f"Unknown modality {modality!r}. Known: {', '.join(MODALITIES)}.")


def _to_api(record: dict[str, Any]) -> dict[str, Any]:
    return {API_FIELDS.get(field, field): value for field, value in record.items()}


def _from_draft(draft: SignalDefinitionDraft) -> dict[str, Any]:
    return {STORED_FIELDS.get(field, field): value for field, value in draft.model_dump().items()}


def _placeholder_context(modality: str) -> SignalContext:
    fields = MODALITY_DEFAULTS[modality].state_fields
    return SignalContext(modality=modality, state={field: f"<{field}>" for field in fields})


def _jev_question(definition: dict[str, Any], modality: str) -> dict[str, Any] | None:
    try:
        return definition_to_plugin(definition).question(_placeholder_context(modality))
    except KeyError:
        return None


def _signal_view(definition: dict[str, Any], weight_total: float, modality: str) -> dict[str, Any]:
    view = _to_api(definition)
    view["jevQuestion"] = _jev_question(definition, modality)
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


async def list_signals(modality: str) -> dict[str, Any]:
    _require_modality(modality)
    directive = await signal_definition_repository.fetch_directive(modality)
    if directive is None:
        raise SignalNotFoundError(f"No correctness question is stored for {modality!r}.")
    definitions = await signal_definition_repository.fetch_definitions(modality)
    algorithms = await signal_definition_repository.fetch_algorithms()
    return {
        "modality": modality,
        "stateFields": list(MODALITY_DEFAULTS[modality].state_fields),
        "directive": {
            **_to_api(directive),
            "labels": ["1", "0"],
            "weightShare": round(
                float(directive["correctness_weight"]) / _scope_total(directive, definitions, GENERAL_SCOPE), 4
            ),
        },
        "signals": [
            _signal_view(definition, _scope_total(directive, definitions, definition["scope"]), modality)
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


async def preview_signal(modality: str, draft: SignalDefinitionDraft) -> dict[str, Any]:
    """The Jev question a draft would send (``None`` for deterministic signals). Not saved."""
    _require_modality(modality)
    raw = _from_draft(draft)
    definition = await _validated({**raw, "key": raw["key"] or TRY_KEY})
    return {"question": _jev_question(definition, modality)}


async def create_signal(modality: str, draft: SignalDefinitionDraft) -> dict[str, Any]:
    _require_modality(modality)
    definition = await _validated(_from_draft(draft))
    created = await signal_definition_repository.insert_definition(definition, modality)
    if created is None:
        raise SignalConflictError(
            f"A {modality} signal with key {definition['key']!r} already exists. Keys are permanent, even when archived."
        )
    return _to_api(created)


async def update_signal(modality: str, key: str, draft: SignalDefinitionDraft, version: int) -> dict[str, Any]:
    _require_modality(modality)
    definition = await _validated({**_from_draft(draft), "key": key})
    try:
        updated = await signal_definition_repository.update_definition(modality, key, definition, version)
    except SignalVersionConflict as error:
        raise SignalConflictError(str(error)) from error
    if updated is None:
        raise SignalNotFoundError(f"Unknown {modality} signal {key!r}.")
    return _to_api(updated)


async def set_signal_status(modality: str, key: str, archived: bool, version: int) -> dict[str, Any]:
    _require_modality(modality)
    try:
        updated = await signal_definition_repository.set_definition_status(
            modality, key, "archived" if archived else "active", version
        )
    except SignalVersionConflict as error:
        raise SignalConflictError(str(error)) from error
    if updated is None:
        raise SignalNotFoundError(f"Unknown {modality} signal {key!r}.")
    return _to_api(updated)


async def update_directive(modality: str, body: SignalDirectiveUpdate) -> dict[str, Any]:
    _require_modality(modality)
    directive = normalize_directive({
        "instructions": body.instructions,
        "criteria": body.criteria,
        "correctness_weight": body.correctnessWeight,
        "correctness_source": body.correctnessSource,
    })
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


async def signal_revisions(modality: str, subject: str) -> list[dict[str, Any]]:
    """History for a signal key of ``modality``, or ``directive`` for its correctness question."""
    _require_modality(modality)
    full_subject = f"directive:{modality}" if subject == "directive" else signal_definition_repository.revision_subject(modality, subject)
    return await signal_definition_repository.fetch_revisions(full_subject)


# ─── Samples and try ───


async def samples(modality: str) -> list[dict[str, Any]]:
    """Stored items a draft can be tried against: MCQs, catalog problems, or generated exercises."""
    _require_modality(modality)
    if modality == "mcq":
        return [
            {
                "id": problem["id"],
                "title": problem["question"][:120],
                "prompt": problem["question"],
                "reference": next((c["text"] for c in problem["choices"] if c["id"] == problem["correctChoiceId"]), ""),
                "choices": problem["choices"],
                "correctChoiceId": problem["correctChoiceId"],
            }
            for problem in await multiple_choice_repository.fetch_recent_multiple_choice_problems()
        ]
    if modality in {"microdrill", "ladder"}:
        return [
            {"id": item["id"], "title": item["prompt"][:120], "prompt": item["prompt"], "reference": item["reference"]}
            for item in await exercise_repository.fetch_recent_exercises(modality)
        ]
    return [
        {"id": problem["slug"], "title": problem["title"], "prompt": problem["description"], "reference": recall_reference(problem)}
        for problem in await unified_catalog_repository.fetch_recall_samples()
    ]


def _try_submission(modality: str, sample_id: str, answer: str) -> AttemptCreate:
    """A submission of ``answer`` to stored item ``sample_id``, shaped as the practice screen sends it."""
    fields: dict[str, Any] = {"cardId": sample_id, "mode": "main-recall", "modality": modality, "userAnswer": answer}
    if modality == "mcq":
        fields.update(multipleChoiceProblemId=sample_id, selectedChoiceId=answer, userAnswer=None)
    elif modality in {"microdrill", "ladder"}:
        fields.update(exerciseId=sample_id)
    return AttemptCreate.model_validate(fields)


async def try_signal(
    modality: str,
    draft: SignalDefinitionDraft,
    sample_id: str,
    answer: str,
    reference: str = "",
    gateway_factory: Callable[[], JevGateway] | None = None,
) -> dict[str, Any]:
    """Ask Jev one draft signal question about ``answer`` to a stored item. Nothing is saved.

    ``answeredCorrectly`` is the modality's deterministic verdict (the answer key for MCQ, an
    exact match for code), standing in for Jev's correctness, which is not asked here.
    """
    _require_modality(modality)
    raw = _from_draft(draft)
    definition = await _validated({**raw, "key": raw["key"] or TRY_KEY})
    submission = _try_submission(modality, sample_id, answer)
    if modality == "ghost-rep":
        submission = submission.model_copy(update={"correctAnswer": reference or None})
    context = await context_builder(modality).build(submission)
    successful = context.deterministic_correct and not context.overrides
    state: dict[str, Any] = dict(context.state)
    if definition["needs_correctness"]:
        state["answeredCorrectly"] = 1 if successful else 0
    signal_context = SignalContext(modality=modality, state=state, elapsed_ms=context.elapsed_ms)
    plugin = definition_to_plugin(definition)
    question = plugin.question(signal_context)
    base = {"state": state, "answeredCorrectly": successful, "applies": applies(plugin, successful), "question": question}
    if question is None:
        return {**base, "answer": None, "result": plugin.interpret(None, signal_context, successful).to_json()}
    try:
        gateway = (gateway_factory or jev_gateway.default_jev_gateway)()
        response = await gateway.system_one(state, {definition["key"]: question})
    except JevUnavailableError as error:
        raise SignalTryError(f"Jev is unavailable ({error.code}): {error.message}") from error
    jev_answer = response.answers[definition["key"]]
    return {
        **base,
        "answer": jev_answer,
        "result": plugin.interpret(jev_answer, signal_context, successful).to_json(),
        "model": response.model,
        "requestId": response.request_id,
        "usage": response.usage,
    }
