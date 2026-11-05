"""Deterministic signal implementations, registered in code by name.

Jev signals are data (``signal_definition`` rows); a deterministic signal's
row names one of these implementations, whose logic only code can change.
"""

from __future__ import annotations

from app.core.signals.base import DeterministicSignal

DETERMINISTIC_IMPLEMENTATIONS: dict[str, DeterministicSignal] = {}


def register_implementation(implementation: DeterministicSignal) -> DeterministicSignal:
    existing = DETERMINISTIC_IMPLEMENTATIONS.get(implementation.key)
    if existing is not None and existing is not implementation:
        raise ValueError(f"Deterministic implementation {implementation.key!r} is already registered.")
    DETERMINISTIC_IMPLEMENTATIONS[implementation.key] = implementation
    return implementation


def get_implementation(name: str) -> DeterministicSignal:
    try:
        return DETERMINISTIC_IMPLEMENTATIONS[name]
    except KeyError as error:
        raise KeyError(f"Unknown deterministic implementation {name!r}.") from error
