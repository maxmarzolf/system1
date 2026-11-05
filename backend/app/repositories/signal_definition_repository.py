from __future__ import annotations

import json
from typing import Any

from app.repositories.base import acquire_connection

DEFINITION_COLUMNS = """
    key, modality, scope, label, source, primitive, implementation, instructions, criteria, score_map,
    role, axis, applies_when, needs_correctness, weight, display_order, status, version,
    created_at, updated_at, archived_at
"""
WRITABLE_COLUMNS = (
    "scope", "label", "source", "primitive", "implementation", "instructions", "criteria", "score_map",
    "role", "axis", "applies_when", "needs_correctness", "weight", "display_order",
)
JSON_COLUMN_TYPES = {"criteria": "json", "score_map": "jsonb"}
JSON_COLUMNS = tuple(JSON_COLUMN_TYPES)


class SignalVersionConflict(RuntimeError):
    pass


def _decode(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


def _definition(row: Any) -> dict[str, Any]:
    record = dict(row)
    for column in JSON_COLUMNS:
        record[column] = _decode(record[column])
    record["score_map"] = record["score_map"] or {}
    for column in ("created_at", "updated_at", "archived_at"):
        if record.get(column) is not None:
            record[column] = record[column].isoformat()
    return record


def _directive(row: Any) -> dict[str, Any]:
    record = dict(row)
    record["criteria"] = _decode(record["criteria"])
    if record.get("updated_at") is not None:
        record["updated_at"] = record["updated_at"].isoformat()
    return record


def _params(definition: dict[str, Any]) -> list[Any]:
    return [
        json.dumps(definition[column]) if column in JSON_COLUMNS and definition[column] is not None else definition[column]
        for column in WRITABLE_COLUMNS
    ]


async def _insert_revision(conn: Any, subject: str, action: str, before: Any, after: Any) -> None:
    await conn.execute(
        "INSERT INTO signal_definition_revision (subject, action, before, after) VALUES ($1, $2, $3::jsonb, $4::jsonb)",
        subject,
        action,
        json.dumps(before, default=str) if before is not None else None,
        json.dumps(after, default=str) if after is not None else None,
    )


async def fetch_definitions(modality: str) -> list[dict[str, Any]]:
    """Every definition for a modality, active and archived."""
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"SELECT {DEFINITION_COLUMNS} FROM signal_definition WHERE modality = $1 ORDER BY display_order, key",
            modality,
        )
    return [_definition(row) for row in rows]


async def fetch_active_definitions(modality: str, algorithm_slug: str) -> list[dict[str, Any]]:
    """Active general definitions, then those scoped to ``algorithm_slug``."""
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {DEFINITION_COLUMNS} FROM signal_definition
            WHERE modality = $1 AND status = 'active' AND (scope = 'general' OR scope = $2)
            ORDER BY (scope <> 'general'), display_order, key
            """,
            modality,
            algorithm_slug,
        )
    return [_definition(row) for row in rows]


async def fetch_definition(key: str) -> dict[str, Any] | None:
    async with acquire_connection() as conn:
        row = await conn.fetchrow(f"SELECT {DEFINITION_COLUMNS} FROM signal_definition WHERE key = $1", key)
    return _definition(row) if row else None


async def insert_definition(definition: dict[str, Any], modality: str) -> dict[str, Any] | None:
    """Insert a new definition; returns None when the key already exists."""
    columns = ", ".join(WRITABLE_COLUMNS)
    placeholders = ", ".join(
        f"${index}::{JSON_COLUMN_TYPES[column]}" if column in JSON_COLUMNS else f"${index}"
        for index, column in enumerate(WRITABLE_COLUMNS, start=3)
    )
    async with acquire_connection() as conn, conn.transaction():
        row = await conn.fetchrow(
            f"""
            INSERT INTO signal_definition (key, modality, {columns})
            VALUES ($1, $2, {placeholders})
            ON CONFLICT (key) DO NOTHING
            RETURNING {DEFINITION_COLUMNS}
            """,
            definition["key"],
            modality,
            *_params(definition),
        )
        if row is None:
            return None
        created = _definition(row)
        await _insert_revision(conn, created["key"], "create", None, created)
    return created


async def update_definition(key: str, definition: dict[str, Any], expected_version: int) -> dict[str, Any] | None:
    """Update a definition if its version still matches; None when the key is unknown."""
    assignments = ", ".join(
        f"{column} = ${index}::{JSON_COLUMN_TYPES[column]}" if column in JSON_COLUMNS else f"{column} = ${index}"
        for index, column in enumerate(WRITABLE_COLUMNS, start=3)
    )
    async with acquire_connection() as conn, conn.transaction():
        before = await conn.fetchrow(f"SELECT {DEFINITION_COLUMNS} FROM signal_definition WHERE key = $1 FOR UPDATE", key)
        if before is None:
            return None
        if before["version"] != expected_version:
            raise SignalVersionConflict(f"{key!r} changed since it was loaded (version {before['version']}).")
        row = await conn.fetchrow(
            f"""
            UPDATE signal_definition
            SET {assignments}, version = version + 1, updated_at = NOW()
            WHERE key = $1 AND version = $2
            RETURNING {DEFINITION_COLUMNS}
            """,
            key,
            expected_version,
            *_params(definition),
        )
        updated = _definition(row)
        await _insert_revision(conn, key, "update", _definition(before), updated)
    return updated


async def set_definition_status(key: str, status: str, expected_version: int) -> dict[str, Any] | None:
    action = "archive" if status == "archived" else "restore"
    async with acquire_connection() as conn, conn.transaction():
        before = await conn.fetchrow(f"SELECT {DEFINITION_COLUMNS} FROM signal_definition WHERE key = $1 FOR UPDATE", key)
        if before is None:
            return None
        if before["version"] != expected_version:
            raise SignalVersionConflict(f"{key!r} changed since it was loaded (version {before['version']}).")
        row = await conn.fetchrow(
            f"""
            UPDATE signal_definition
            SET status = $2::varchar,
                archived_at = CASE WHEN $2::varchar = 'archived' THEN NOW() ELSE NULL END,
                version = version + 1,
                updated_at = NOW()
            WHERE key = $1
            RETURNING {DEFINITION_COLUMNS}
            """,
            key,
            status,
        )
        updated = _definition(row)
        await _insert_revision(conn, key, action, _definition(before), updated)
    return updated


async def fetch_directive(modality: str) -> dict[str, Any] | None:
    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            "SELECT modality, instructions, criteria, correctness_weight, version, updated_at "
            "FROM signal_evaluation_directive WHERE modality = $1",
            modality,
        )
    return _directive(row) if row else None


async def update_directive(modality: str, directive: dict[str, Any], expected_version: int) -> dict[str, Any] | None:
    async with acquire_connection() as conn, conn.transaction():
        before = await conn.fetchrow(
            "SELECT modality, instructions, criteria, correctness_weight, version, updated_at "
            "FROM signal_evaluation_directive WHERE modality = $1 FOR UPDATE",
            modality,
        )
        if before is None:
            return None
        if before["version"] != expected_version:
            raise SignalVersionConflict(f"The {modality} correctness question changed since it was loaded.")
        row = await conn.fetchrow(
            """
            UPDATE signal_evaluation_directive
            SET instructions = $2, criteria = $3::jsonb, correctness_weight = $4,
                version = version + 1, updated_at = NOW()
            WHERE modality = $1
            RETURNING modality, instructions, criteria, correctness_weight, version, updated_at
            """,
            modality,
            directive["instructions"],
            json.dumps(directive["criteria"]),
            directive["correctness_weight"],
        )
        updated = _directive(row)
        await _insert_revision(conn, f"directive:{modality}", "update", _directive(before), updated)
    return updated


async def seed_defaults(directive: dict[str, Any], definitions: list[dict[str, Any]]) -> int:
    """Insert missing defaults only; existing rows (and admin edits) are never touched.

    Returns how many rows were inserted.
    """
    inserted = 0
    columns = ", ".join(WRITABLE_COLUMNS)
    placeholders = ", ".join(
        f"${index}::{JSON_COLUMN_TYPES[column]}" if column in JSON_COLUMNS else f"${index}"
        for index, column in enumerate(WRITABLE_COLUMNS, start=3)
    )
    async with acquire_connection() as conn, conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO signal_evaluation_directive (modality, instructions, criteria, correctness_weight)
            VALUES ($1, $2, $3::jsonb, $4)
            ON CONFLICT (modality) DO NOTHING
            RETURNING modality
            """,
            directive["modality"],
            directive["instructions"],
            json.dumps(directive["criteria"]),
            directive["correctness_weight"],
        )
        if row is not None:
            inserted += 1
            await _insert_revision(conn, f"directive:{directive['modality']}", "seed", None, directive)
        for order, definition in enumerate(definitions, start=1):
            row = await conn.fetchrow(
                f"""
                INSERT INTO signal_definition (key, modality, {columns})
                VALUES ($1, $2, {placeholders})
                ON CONFLICT (key) DO NOTHING
                RETURNING key
                """,
                definition["key"],
                definition["modality"],
                *_params({**definition, "display_order": definition.get("display_order") or order * 10}),
            )
            if row is not None:
                inserted += 1
                await _insert_revision(conn, definition["key"], "seed", None, definition)
    return inserted


async def fetch_revisions(subject: str, limit: int = 50) -> list[dict[str, Any]]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT id, subject, action, before, after, created_at
            FROM signal_definition_revision
            WHERE subject = $1
            ORDER BY id DESC
            LIMIT $2
            """,
            subject,
            limit,
        )
    return [
        {
            "id": row["id"],
            "subject": row["subject"],
            "action": row["action"],
            "before": _decode(row["before"]),
            "after": _decode(row["after"]),
            "createdAt": row["created_at"].isoformat(),
        }
        for row in rows
    ]


async def fetch_algorithms() -> list[dict[str, str]]:
    async with acquire_connection() as conn:
        rows = await conn.fetch("SELECT slug, name FROM algorithm ORDER BY display_order, slug")
    return [{"slug": str(row["slug"]), "name": str(row["name"])} for row in rows]
