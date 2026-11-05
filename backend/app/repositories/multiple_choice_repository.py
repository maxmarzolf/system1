from __future__ import annotations

from typing import Any, TypedDict

from app.repositories.base import acquire_connection

MULTIPLE_CHOICE_PROBLEM_COLUMNS = """
    id, question_text, question_help_text,
    multiple_choice_answer_label_1, multiple_choice_answer_text_1,
    multiple_choice_answer_label_2, multiple_choice_answer_text_2,
    multiple_choice_answer_label_3, multiple_choice_answer_text_3,
    multiple_choice_answer_label_4, multiple_choice_answer_text_4,
    multiple_choice_correct_answer_label, multiple_choice_correct_answer_text
"""


class StoredChoice(TypedDict):
    id: str
    text: str


class StoredMultipleChoiceProblem(TypedDict):
    id: str
    question: str
    explanation: str
    choices: list[StoredChoice]
    correctChoiceId: str


def stored_multiple_choice_problem(row: dict[str, Any]) -> StoredMultipleChoiceProblem:
    choices: list[StoredChoice] = []
    for index in range(1, 5):
        label = str(row.get(f"multiple_choice_answer_label_{index}") or "").strip()
        text = str(row.get(f"multiple_choice_answer_text_{index}") or "")
        if label and text:
            choices.append({"id": label, "text": text})
    return {
        "id": str(row["id"]),
        "question": str(row.get("question_text") or ""),
        "explanation": str(row.get("question_help_text") or ""),
        "choices": choices,
        "correctChoiceId": str(row.get("multiple_choice_correct_answer_label") or "").strip(),
    }


async def fetch_multiple_choice_problem(problem_id: str) -> StoredMultipleChoiceProblem | None:
    async with acquire_connection() as conn:
        row = await conn.fetchrow(
            f"SELECT {MULTIPLE_CHOICE_PROBLEM_COLUMNS} FROM multiple_choice_problem WHERE id = $1",
            problem_id,
        )
    return stored_multiple_choice_problem(dict(row)) if row else None
