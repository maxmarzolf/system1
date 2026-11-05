"""Modality signal specs: which plug-ins run for a submission, and their weights.

Unlike the recall ``SignalSpec`` (``core/signal_catalog.py``), a modality spec
holds no signal definitions itself; it references registered plug-ins by key,
so a signal can be added or swapped without touching the evaluator.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from app.core.signals.base import SignalPlugin
from app.core.signals.registry import get_signal_plugin


@dataclass(frozen=True)
class SpecEntry:
    key: str
    weight: float


@dataclass(frozen=True)
class ModalitySignalSpec:
    algorithm: str
    modality: str
    version: int
    correctness_weight: float
    signals: tuple[SpecEntry, ...]

    def plugins(self) -> list[tuple[SignalPlugin, float]]:
        return [(get_signal_plugin(entry.key), entry.weight) for entry in self.signals]

    def snapshot(self) -> dict[str, Any]:
        return {
            "algorithm": self.algorithm,
            "modality": self.modality,
            "version": self.version,
            "correctnessWeight": self.correctness_weight,
            "signals": [{**plugin.describe(), "weight": weight} for plugin, weight in self.plugins()],
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
