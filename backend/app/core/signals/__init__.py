"""Signal plug-ins: Jev signals are data rows; deterministic logic is registered in code."""

from app.core.signals.base import SignalContext, SignalPlugin, SignalResult, applies, skipped
from app.core.signals.definitions import build_spec, definition_to_plugin
from app.core.signals.registry import DETERMINISTIC_IMPLEMENTATIONS, get_implementation, register_implementation
from app.core.signals.spec import (
    CORRECTNESS_LABELS,
    CORRECTNESS_QUESTION_ID,
    CorrectnessDirective,
    ModalitySignalSpec,
    SpecEntry,
)
from app.core.signals import mcq  # noqa: E402,F401  (registers deterministic implementations)

__all__ = [
    "CORRECTNESS_LABELS",
    "CORRECTNESS_QUESTION_ID",
    "DETERMINISTIC_IMPLEMENTATIONS",
    "CorrectnessDirective",
    "ModalitySignalSpec",
    "SignalContext",
    "SignalPlugin",
    "SignalResult",
    "SpecEntry",
    "applies",
    "build_spec",
    "definition_to_plugin",
    "get_implementation",
    "register_implementation",
    "skipped",
]
