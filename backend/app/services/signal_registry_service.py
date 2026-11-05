"""The live Jev signal spec, read from the database on every evaluation.

Edits made on /admin therefore apply to the next submission without a
restart. Defaults from ``core/signals/mcq.py`` are seeded once; existing rows
are never overwritten.
"""

from __future__ import annotations

import logging

from app.core.signals import DETERMINISTIC_IMPLEMENTATIONS, ModalitySignalSpec, build_spec
from app.core.signals.mcq import DEFAULT_MCQ_ALGORITHM, DEFAULT_MCQ_DEFINITIONS, DEFAULT_MCQ_DIRECTIVE, MCQ_MODALITY
from app.domain.coach_context import algorithm_slug_for_tags
from app.repositories import signal_definition_repository

logger = logging.getLogger(__name__)


async def seed_signal_definitions() -> int:
    return await signal_definition_repository.seed_defaults(DEFAULT_MCQ_DIRECTIVE, list(DEFAULT_MCQ_DEFINITIONS))


def mcq_algorithm_for_tags(skill_tags: list[str]) -> str:
    return algorithm_slug_for_tags(skill_tags) or DEFAULT_MCQ_ALGORITHM


async def load_mcq_spec(algorithm_slug: str) -> ModalitySignalSpec:
    """Active general MCQ signals plus those scoped to ``algorithm_slug``."""
    directive = await signal_definition_repository.fetch_directive(MCQ_MODALITY) or DEFAULT_MCQ_DIRECTIVE
    definitions = []
    for definition in await signal_definition_repository.fetch_active_definitions(MCQ_MODALITY, algorithm_slug):
        if definition["source"] == "deterministic" and definition["implementation"] not in DETERMINISTIC_IMPLEMENTATIONS:
            logger.warning(
                "Skipping signal %s: deterministic implementation %r is not registered",
                definition["key"],
                definition["implementation"],
            )
            continue
        definitions.append(definition)
    return build_spec(
        algorithm=algorithm_slug or DEFAULT_MCQ_ALGORITHM,
        modality=MCQ_MODALITY,
        directive=directive,
        definitions=definitions,
    )
