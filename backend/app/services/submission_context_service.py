"""Server-side submission context: the facts an evaluator may trust.

For MCQ the question, choices and answer key come from the stored
``multiple_choice_problem`` row; the client only says which row and which
choice it picked.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models import AttemptCreate
from app.repositories.multiple_choice_repository import StoredChoice, fetch_multiple_choice_problem


class SubmissionContextError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class McqContext:
    problem_id: str
    question: str
    answers: tuple[StoredChoice, ...]
    correct_answer: StoredChoice
    submitted_answer: StoredChoice
    elapsed_ms: int

    def jev_state(self) -> dict[str, Any]:
        """State for every Jev question about this submission."""
        return {
            "question": self.question,
            "answers": [dict(answer) for answer in self.answers],
            "correctAnswer": dict(self.correct_answer),
            "submittedAnswer": dict(self.submitted_answer),
        }

    @property
    def answer_key_correct(self) -> bool:
        return self.submitted_answer["id"] == self.correct_answer["id"]


async def build_mcq_context(body: AttemptCreate) -> McqContext:
    return await mcq_context_for(
        (body.multipleChoiceProblemId or body.generatedCardId or "").strip(),
        (body.selectedChoiceId or "").strip(),
        elapsed_ms=body.elapsedMs,
    )


async def mcq_context_for(problem_id: str, selected_id: str, *, elapsed_ms: int = 0) -> McqContext:
    """Context for answering stored problem ``problem_id`` with choice ``selected_id``."""
    if not problem_id or not selected_id:
        raise SubmissionContextError(
            "mcq_missing_ids",
            "Multiple-choice submissions need multipleChoiceProblemId and selectedChoiceId.",
        )
    problem = await fetch_multiple_choice_problem(problem_id)
    if problem is None:
        raise SubmissionContextError("mcq_unknown_problem", f"Unknown multiple-choice problem {problem_id!r}.")
    choices = {choice["id"]: choice for choice in problem["choices"]}
    correct = choices.get(problem["correctChoiceId"])
    if len(choices) < 2 or correct is None:
        raise SubmissionContextError("mcq_incomplete_problem", f"Problem {problem_id!r} has no stored answer key.")
    submitted = choices.get(selected_id)
    if submitted is None:
        raise SubmissionContextError("mcq_unknown_choice", f"Choice {selected_id!r} is not an option for {problem_id!r}.")
    return McqContext(
        problem_id=problem["id"],
        question=problem["question"],
        answers=tuple(problem["choices"]),
        correct_answer=correct,
        submitted_answer=submitted,
        elapsed_ms=elapsed_ms,
    )
