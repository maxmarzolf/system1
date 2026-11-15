"""Stored generated exercises (microdrills, ladder rungs): what was asked and the server's answer."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, TypedDict
from uuid import uuid4

from app.repositories.base import acquire_connection

COLUMNS = "id, modality, algorithm_slug, prompt, reference, metadata, generation_trace, created_at"


class StoredExercise(TypedDict):
    id: str
    modality: str
    algorithmSlug: str | None
    prompt: str
    reference: str
    metadata: dict[str, Any]
    generationTrace: list[dict[str, Any]]
    createdAt: str


def _decode(value: Any, default: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return default
    return value if value is not None else default


def stored_exercise(row: Any) -> StoredExercise:
    record = dict(row)
    created = record.get("created_at")
    return {
        "id": str(record["id"]),
        "modality": str(record["modality"]),
        "algorithmSlug": record.get("algorithm_slug"),
        "prompt": str(record["prompt"]),
        "reference": str(record["reference"]),
        "metadata": _decode(record.get("metadata"), {}),
        "generationTrace": _decode(record.get("generation_trace"), []),
        "createdAt": created.isoformat() if isinstance(created, datetime) else str(created or ""),
    }


async def insert_exercise(
    *,
    modality: str,
    prompt: str,
    reference: str,
    metadata: dict[str, Any],
    generation_trace: list[dict[str, Any]],
    algorithm_slug: str | None = None,
) -> StoredExercise:
    """Store a generated item; an algorithm slug not in ``algorithm`` is stored as NULL."""
    item_id = f"{modality}-{datetime.now(tz=timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}"
    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            f"""
            INSERT INTO generated_exercise (id, modality, algorithm_slug, prompt, reference, metadata, generation_trace)
            VALUES ($1, $2, (SELECT slug FROM algorithm WHERE slug = $3), $4, $5, $6::jsonb, $7::jsonb)
            RETURNING {COLUMNS}
            """,
            item_id,
            modality,
            algorithm_slug,
            prompt,
            reference,
            json.dumps(metadata),
            json.dumps(generation_trace, default=str),
        )
    return stored_exercise(row)


async def fetch_exercise(item_id: str) -> StoredExercise | None:
    async with acquire_connection() as conn:
        row = await conn.fetchrow(f"SELECT {COLUMNS} FROM generated_exercise WHERE id = $1", item_id)
    return stored_exercise(row) if row else None


async def fetch_recent_exercises(modality: str, limit: int = 25) -> list[StoredExercise]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"SELECT {COLUMNS} FROM generated_exercise WHERE modality = $1 ORDER BY created_at DESC LIMIT $2",
            modality,
            limit,
        )
    return [stored_exercise(row) for row in rows]
