"""Turn ``signal_definition`` rows (or admin drafts) into signal plug-ins."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from typing import Any

from app.core.signals.base import JevSignal, SignalPlugin
from app.core.signals.registry import get_implementation
from app.core.signals.spec import CorrectnessDirective, ModalitySignalSpec, SpecEntry


def definition_to_plugin(definition: Mapping[str, Any]) -> SignalPlugin:
    """Build the plug-in a definition describes.

    Jev definitions become ``JevSignal``; deterministic ones reuse the named
    implementation's logic with the definition's label, role, axis and
    applicability.
    """
    common = {
        "key": str(definition["key"]),
        "label": str(definition["label"]),
        "role": definition["role"],
        "axis": definition.get("axis") or None,
        "applies_when": definition.get("applies_when") or "always",
    }
    if definition["source"] == "deterministic":
        implementation = get_implementation(str(definition["implementation"]))
        return replace(implementation, **common)
    criteria = definition.get("criteria")
    if definition["primitive"] == "score":
        criteria = tuple(criteria or ())
    return JevSignal(
        **common,
        primitive=definition["primitive"],
        instructions=str(definition.get("instructions") or ""),
        criteria=criteria,
        needs_correctness=bool(definition.get("needs_correctness")),
        score_map={str(label): float(value) for label, value in (definition.get("score_map") or {}).items()},
    )


def directive_from_definition(directive: Mapping[str, Any]) -> CorrectnessDirective:
    return CorrectnessDirective(
        instructions=str(directive["instructions"]),
        criteria={str(label): str(text) for label, text in dict(directive["criteria"]).items()},
        weight=float(directive["correctness_weight"]),
    )


def build_spec(
    *,
    algorithm: str,
    modality: str,
    directive: Mapping[str, Any],
    definitions: list[Mapping[str, Any]],
) -> ModalitySignalSpec:
    return ModalitySignalSpec(
        algorithm=algorithm,
        modality=modality,
        correctness=directive_from_definition(directive),
        signals=tuple(
            SpecEntry(
                plugin=definition_to_plugin(definition),
                weight=0.0 if definition["role"] == "diagnostic" else float(definition["weight"]),
                scope=str(definition.get("scope") or "general"),
            )
            for definition in definitions
        ),
    )
