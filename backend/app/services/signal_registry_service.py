"""The live signal spec for any modality, read from the database on every evaluation.

Edits made on /admin therefore apply to the next submission without a restart. Every
modality's defaults (``core/signals/defaults.py``) are seeded once; existing rows are never
overwritten.
"""

from __future__ import annotations

import logging

from app.core.signals import DETERMINISTIC_IMPLEMENTATIONS, ModalitySignalSpec, build_spec
from app.core.signals.defaults import DEFAULT_ALGORITHM, MODALITY_DEFAULTS
from app.core.taxonomy import algorithm_slug_for_tags
from app.repositories import signal_definition_repository

logger = logging.getLogger(__name__)


async def seed_signal_definitions() -> int:
    """Insert every modality's missing default directive and signals; returns rows inserted."""
    inserted = 0
    for defaults in MODALITY_DEFAULTS.values():
        inserted += await signal_definition_repository.seed_defaults(defaults.directive, defaults.definitions)
    return inserted


def algorithm_for_tags(skill_tags: list[str]) -> str:
    return algorithm_slug_for_tags(skill_tags) or DEFAULT_ALGORITHM


async def load_spec(modality: str, algorithm_slug: str) -> ModalitySignalSpec:
    """The modality's directive plus its active general signals and those scoped to ``algorithm_slug``."""
    defaults = MODALITY_DEFAULTS[modality]
    directive = await signal_definition_repository.fetch_directive(modality) or defaults.directive
    definitions = []
    for definition in await signal_definition_repository.fetch_active_definitions(modality, algorithm_slug):
        if definition["source"] == "deterministic" and definition["implementation"] not in DETERMINISTIC_IMPLEMENTATIONS:
            logger.warning(
                "Skipping %s signal %s: deterministic implementation %r is not registered",
                modality,
                definition["key"],
                definition["implementation"],
            )
            continue
        definitions.append(definition)
    return build_spec(
        algorithm=algorithm_slug or DEFAULT_ALGORITHM,
        modality=modality,
        directive=directive,
        definitions=definitions,
    )
