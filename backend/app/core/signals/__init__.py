"""Plug-in signals. Importing a plug-in module here registers its signals."""

from app.core.signals.base import SignalContext, SignalPlugin, SignalResult, applies, skipped
from app.core.signals.registry import SIGNAL_PLUGINS, get_signal_plugin, register_signal
from app.core.signals.spec import ModalitySignalSpec, SpecEntry
from app.core.signals import mcq  # noqa: E402,F401  (registers MCQ plug-ins)

__all__ = [
    "SIGNAL_PLUGINS",
    "ModalitySignalSpec",
    "SignalContext",
    "SignalPlugin",
    "SignalResult",
    "SpecEntry",
    "applies",
    "get_signal_plugin",
    "register_signal",
    "skipped",
]
