"""Tolerant coercion for values read back from JSON columns."""

from __future__ import annotations

import json
from typing import Any


def coerce_json_object(value: Any) -> dict[str, Any]:
    """A dict from a dict or a JSON object string; anything else becomes ``{}``."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def score_value(value: Any) -> float:
    """A score rounded to one decimal; unparseable values count as 0."""
    try:
        return round(float(value or 0), 1)
    except (TypeError, ValueError):
        return 0.0
