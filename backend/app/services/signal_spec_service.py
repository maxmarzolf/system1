from __future__ import annotations

from typing import Any, Literal

from app.core.assessor import assessor_system_prompt
from app.core.core_algorithm_practice import problem_slug_candidates
from app.core.signal_catalog import (
    DEFAULT_SIGNAL_SPEC,
    SignalSpec,
    get_signal_spec,
    spec_from_json,
    spec_to_json,
)
from app.domain.coach_context import primary_pattern_tag
from app.models import SignalSpecResolveRequest
from app.repositories import signal_spec_repository
from app.submission_rubric import coerce_json_object

SpecSource = Literal["problem", "skill-tag", "default"]


async def resolve_signal_spec_with_source(
    card_ids: list[str | None],
    skill_tags: list[str],
) -> tuple[SignalSpec, SpecSource]:
    """Resolve the signal spec for a submission: the card's problem algorithm,
    then the primary pattern tag, then the default spec."""
    row = await signal_spec_repository.fetch_algorithm_signal_spec(
        problem_slug_candidates(card_ids),
        primary_pattern_tag(skill_tags),
    )
    if row is None:
        return DEFAULT_SIGNAL_SPEC, "default"
    spec = spec_from_json(coerce_json_object(row["signal_spec"])) or get_signal_spec(row["slug"])
    return spec, "problem" if row["matched_by"] == "problem" else "skill-tag"


async def resolve_signal_spec(card_ids: list[str | None], skill_tags: list[str]) -> SignalSpec:
    spec, _source = await resolve_signal_spec_with_source(card_ids, skill_tags)
    return spec


async def list_signal_specs() -> dict[str, Any]:
    algorithms = []
    for row in await signal_spec_repository.fetch_algorithm_signal_specs():
        stored = spec_from_json(coerce_json_object(row["signal_spec"]))
        spec = stored or get_signal_spec(row["slug"])
        algorithms.append({
            "slug": str(row["slug"]),
            "name": str(row["name"]),
            "usesDefault": spec.algorithm != str(row["slug"]),
            "seeded": stored is not None,
            "spec": spec_to_json(spec),
        })
    return {"default": spec_to_json(DEFAULT_SIGNAL_SPEC), "algorithms": algorithms}


async def preview_signal_spec(body: SignalSpecResolveRequest) -> dict[str, Any]:
    """What the next submission for this card would send to the Signal Assessor."""
    spec, source = await resolve_signal_spec_with_source([body.generatedCardId, body.cardId], body.categoryTags)
    return {
        "source": source,
        "primaryPatternTag": primary_pattern_tag(body.categoryTags),
        "spec": spec_to_json(spec),
        "assessorPayload": {
            "signalGuidance": {signal.key: signal.guidance for signal in spec.signals},
            "systemPrompt": assessor_system_prompt(spec),
        },
    }
