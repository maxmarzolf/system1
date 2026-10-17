from __future__ import annotations

from app.core.signal_catalog import DEFAULT_SIGNAL_SPEC, SignalSpec, get_signal_spec, spec_from_json
from app.domain.coach_context import primary_pattern_tag
from app.repositories import signal_spec_repository
from app.submission_rubric import coerce_json_object


async def resolve_signal_spec(card_ids: list[str | None], skill_tags: list[str]) -> SignalSpec:
    """Resolve the signal spec for a submission: the card's problem algorithm,
    then the primary pattern tag, then the default spec."""
    row = await signal_spec_repository.fetch_algorithm_signal_spec(
        [str(card_id) for card_id in card_ids if card_id],
        primary_pattern_tag(skill_tags),
    )
    if row is None:
        return DEFAULT_SIGNAL_SPEC
    return spec_from_json(coerce_json_object(row["signal_spec"])) or get_signal_spec(row["slug"])
