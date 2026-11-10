"""Helpers shared by the read models over stored submissions."""

from __future__ import annotations

from datetime import datetime, timezone, tzinfo
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def submission_modality(row: dict[str, Any]) -> str:
    """The stored modality (a NOT NULL column; rows built in tests may omit it)."""
    return str(row.get("modality") or "").strip() or "total-recall"


def resolve_timezone(name: str | None) -> tzinfo:
    """The viewer's IANA timezone for calendar-day bucketing; UTC when missing or unknown."""
    try:
        return ZoneInfo(name) if name else timezone.utc
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


def coerce_utc_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        normalized = text.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    return None
