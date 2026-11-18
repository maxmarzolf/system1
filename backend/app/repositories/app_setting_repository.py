"""Server-side settings: one versioned JSON document per section."""

from __future__ import annotations

import json
from typing import Any

from app.repositories.base import acquire_connection


class SettingVersionConflict(RuntimeError):
    pass


def _decode(value: Any) -> dict[str, Any]:
    decoded = json.loads(value) if isinstance(value, str) else value
    return decoded if isinstance(decoded, dict) else {}


async def fetch_settings() -> dict[str, tuple[dict[str, Any], int]]:
    """Every stored section as ``{key: (value, version)}``; sections never saved are absent."""
    async with acquire_connection() as conn:
        rows = await conn.fetch("SELECT key, value, version FROM app_setting")
    return {str(row["key"]): (_decode(row["value"]), int(row["version"])) for row in rows}


async def save_setting(key: str, value: dict[str, Any], expected_version: int) -> int:
    """Write a section if it is still at ``expected_version`` (0 = never saved); returns the new version."""
    async with acquire_connection() as conn, conn.transaction():
        current = await conn.fetchval("SELECT version FROM app_setting WHERE key = $1 FOR UPDATE", key)
        if (current or 0) != expected_version:
            raise SettingVersionConflict(f"The {key} settings changed since they were loaded.")
        if current is None:
            await conn.execute("INSERT INTO app_setting (key, value) VALUES ($1, $2::jsonb)", key, json.dumps(value))
            return 1
        await conn.execute(
            "UPDATE app_setting SET value = $2::jsonb, version = version + 1, updated_at = NOW() WHERE key = $1",
            key,
            json.dumps(value),
        )
        return int(current) + 1
