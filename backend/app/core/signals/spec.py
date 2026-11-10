"""Modality signal specs: the correctness question plus the signals that run with it.

A spec is assembled per submission from ``signal_definition`` rows (general
signals plus those scoped to the submission's algorithm), so edits made on
/admin apply to the next evaluation. ``snapshot()`` and ``hash()`` are stored
on every evaluation so it stays interpretable after later edits.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from app.core.jev import JevQuestion, choice
from app.core.signals.base import SignalPlugin

# Bumped when the shape of a spec (not its content) changes; content changes move the hash.
SPEC_FORMAT_VERSION = 2

CORRECTNESS_QUESTION_ID = "correctness"
CORRECTNESS_LABELS = ("1", "0")


@dataclass(frozen=True)
class CorrectnessDirective:
    """The "did they answer correctly" question. Labels are fixed: "1" = correct."""

    instructions: str
    criteria: dict[str, str]
    weight: float

    def question(self) -> JevQuestion:
        return choice(self.instructions, {label: self.criteria.get(label, "") for label in CORRECTNESS_LABELS})

    def describe(self) -> dict[str, Any]:
        return {
            "id": CORRECTNESS_QUESTION_ID,
            "type": "choice",
            "instructions": self.instructions,
            "criteria": {label: self.criteria.get(label, "") for label in CORRECTNESS_LABELS},
            "weight": self.weight,
        }


@dataclass(frozen=True)
class SpecEntry:
    plugin: SignalPlugin
    weight: float
    scope: str = "general"


@dataclass(frozen=True)
class ModalitySignalSpec:
    algorithm: str
    modality: str
    correctness: CorrectnessDirective
    signals: tuple[SpecEntry, ...]
    version: int = SPEC_FORMAT_VERSION

    @property
    def correctness_weight(self) -> float:
        return self.correctness.weight

    def plugins(self) -> list[tuple[SignalPlugin, float]]:
        return [(entry.plugin, entry.weight) for entry in self.signals]

    def snapshot(self) -> dict[str, Any]:
        return {
            "algorithm": self.algorithm,
            "modality": self.modality,
            "version": self.version,
            "correctnessWeight": self.correctness.weight,
            "correctness": self.correctness.describe(),
            "signals": [
                {**entry.plugin.describe(), "weight": entry.weight, "scope": entry.scope} for entry in self.signals
            ],
        }

    def hash(self) -> str:
        encoded = json.dumps(self.snapshot(), sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()[:16]

    def reference(self) -> dict[str, Any]:
        return {
            "algorithm": self.algorithm,
            "modality": self.modality,
            "version": self.version,
            "hash": self.hash(),
        }
