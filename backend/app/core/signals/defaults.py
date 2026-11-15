"""Every modality's default directive and signals, in one place.

Seeding inserts any of these that are missing; existing rows (and /admin edits) are never
touched. ``default_spec`` builds a spec from them without a database (tests, live checks).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.signals.definitions import build_spec
from app.core.signals.ghost_rep import DEFAULT_GHOST_REP_DEFINITIONS, DEFAULT_GHOST_REP_DIRECTIVE, GHOST_REP_MODALITY
from app.core.signals.ladder import DEFAULT_LADDER_DEFINITIONS, DEFAULT_LADDER_DIRECTIVE, LADDER_MODALITY
from app.core.signals.mcq import DEFAULT_MCQ_DEFINITIONS, DEFAULT_MCQ_DIRECTIVE, MCQ_MODALITY
from app.core.signals.microdrill import DEFAULT_MICRODRILL_DEFINITIONS, DEFAULT_MICRODRILL_DIRECTIVE, MICRODRILL_MODALITY
from app.core.signals.seed import GENERAL_SCOPE
from app.core.signals.spec import ModalitySignalSpec
from app.core.signals.total_recall import DEFAULT_TOTAL_RECALL_DEFINITIONS, DEFAULT_TOTAL_RECALL_DIRECTIVE, TOTAL_RECALL_MODALITY

DEFAULT_ALGORITHM = "default"


@dataclass(frozen=True)
class ModalityDefaults:
    modality: str
    directive: dict[str, Any]
    definitions: tuple[dict[str, Any], ...]


MODALITY_DEFAULTS: dict[str, ModalityDefaults] = {
    defaults.modality: defaults
    for defaults in (
        ModalityDefaults(MCQ_MODALITY, DEFAULT_MCQ_DIRECTIVE, DEFAULT_MCQ_DEFINITIONS),
        ModalityDefaults(TOTAL_RECALL_MODALITY, DEFAULT_TOTAL_RECALL_DIRECTIVE, DEFAULT_TOTAL_RECALL_DEFINITIONS),
        ModalityDefaults(GHOST_REP_MODALITY, DEFAULT_GHOST_REP_DIRECTIVE, DEFAULT_GHOST_REP_DEFINITIONS),
        ModalityDefaults(MICRODRILL_MODALITY, DEFAULT_MICRODRILL_DIRECTIVE, DEFAULT_MICRODRILL_DEFINITIONS),
        ModalityDefaults(LADDER_MODALITY, DEFAULT_LADDER_DIRECTIVE, DEFAULT_LADDER_DEFINITIONS),
    )
}
MODALITIES: tuple[str, ...] = tuple(MODALITY_DEFAULTS)


def default_spec(modality: str, algorithm: str = DEFAULT_ALGORITHM) -> ModalitySignalSpec:
    """The seed spec for ``modality``: general defaults plus those scoped to ``algorithm``."""
    defaults = MODALITY_DEFAULTS[modality]
    return build_spec(
        algorithm=algorithm,
        modality=modality,
        directive=defaults.directive,
        definitions=[d for d in defaults.definitions if d["scope"] in {GENERAL_SCOPE, algorithm}],
    )
