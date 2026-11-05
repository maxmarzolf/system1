"""Signal plug-in registry. Plug-ins register themselves on import."""

from __future__ import annotations

from typing import TypeVar

from app.core.signals.base import SignalPlugin

PluginT = TypeVar("PluginT", bound=SignalPlugin)

SIGNAL_PLUGINS: dict[str, SignalPlugin] = {}


def register_signal(plugin: PluginT) -> PluginT:
    if plugin.key in SIGNAL_PLUGINS and SIGNAL_PLUGINS[plugin.key] is not plugin:
        raise ValueError(f"Signal {plugin.key!r} is already registered.")
    SIGNAL_PLUGINS[plugin.key] = plugin
    return plugin


def get_signal_plugin(key: str) -> SignalPlugin:
    try:
        return SIGNAL_PLUGINS[key]
    except KeyError as error:
        raise KeyError(f"Unknown signal plug-in {key!r}.") from error
