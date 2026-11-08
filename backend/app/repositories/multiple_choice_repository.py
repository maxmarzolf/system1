from __future__ import annotations

import json
from typing import Any, TypedDict

from app.repositories.base import acquire_connection

MULTIPLE_CHOICE_PROBLEM_COLUMNS = "id, question_text, explanation, choices, correct_choice_id, algorithm_slug"


class StoredChoice(TypedDict):
    id: str
    text: str


class StoredMultipleChoiceProblem(TypedDict):
    id: str
    question: str
    explanation: str
    choices: list[StoredChoice]
    correctChoiceId: str
    algorithmSlug: str | None


def stored_choices(value: Any) -> list[StoredChoice]:
    """Parse the ``choices`` JSONB column (asyncpg returns it as text)."""
    raw = json.loads(value) if isinstance(value, str) else value
    choices: list[StoredChoice] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        choice_id, text = str(item.get("id") or "").strip(), str(item.get("text") or "")
        if choice_id and text:
            choices.append({"id": choice_id, "text": text})
    return choices


def stored_multiple_choice_problem(row: dict[str, Any]) -> StoredMultipleChoiceProblem:
    return {
        "id": str(row["id"]),
        "question": str(row.get("question_text") or ""),
        "explanation": str(row.get("explanation") or ""),
        "choices": stored_choices(row.get("choices")),
        "correctChoiceId": str(row.get("correct_choice_id") or "").strip(),
        "algorithmSlug": row.get("algorithm_slug"),
    }


async def fetch_multiple_choice_problem(problem_id: str) -> StoredMultipleChoiceProblem | None:
    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            f"SELECT {MULTIPLE_CHOICE_PROBLEM_COLUMNS} FROM multiple_choice_problem WHERE id = $1",
            problem_id,
        )
    return stored_multiple_choice_problem(dict(row)) if row else None


async def fetch_recent_multiple_choice_problems(limit: int = 25) -> list[StoredMultipleChoiceProblem]:
    """Recent stored MCQs that have a complete answer key."""
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {MULTIPLE_CHOICE_PROBLEM_COLUMNS} FROM multiple_choice_problem
            WHERE jsonb_array_length(choices) = 4 AND correct_choice_id <> ''
            ORDER BY created_at DESC
            LIMIT $1
            """,
            limit,
        )
    return [stored_multiple_choice_problem(dict(row)) for row in rows]
