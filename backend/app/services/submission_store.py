"""Persists a graded submission: the one write path for practice records.

The submission row, its evaluation (``submission_evaluation``) and one ``submission_signal`` row per
signal are written together (see ``attempts_repository.insert_submission_attempt_row``).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.contracts.evaluation import Evaluation
from app.contracts.submission import SubmissionRecord
from app.models import AttemptCreate
from app.repositories.attempts_repository import insert_submission_attempt_row
from app.services.contracts import AttemptSaveResult


def _contexts(body: AttemptCreate, *, modality: str) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """The flow and modality facts the client sent with the answer (stored beside the evaluation)."""
    raw_signals = body.signals if isinstance(body.signals, dict) else {}
    flow = raw_signals.get("flow")
    modality_signals = raw_signals.get("modality")
    return (
        flow if isinstance(flow, dict) and flow else None,
        {**(modality_signals if isinstance(modality_signals, dict) else {}), "kind": modality},
    )


async def create_attempt(
    body: AttemptCreate,
    *,
    successful: bool,
    evaluation: Evaluation,
    record: SubmissionRecord | None = None,
) -> AttemptSaveResult:
    now = datetime.now(tz=timezone.utc)
    modality = body.resolved_modality().value
    flow_context, modality_context = _contexts(body, modality=modality)
    row = await insert_submission_attempt_row(
        session_id=body.resolved_session_id(),
        card_id=body.cardId,
        card_title=body.cardTitle,
        question=body.question,
        category_tags=body.categoryTags,
        correct_answer=record.correct_answer if record else body.correctAnswer,
        user_answer=record.user_answer if record else body.userAnswer,
        multiple_choice_problem_id=record.multiple_choice_problem_id if record else None,
        problem_slug=record.problem_slug if record else None,
        exercise_id=record.exercise_id if record else None,
        mode=body.mode.value,
        successful=successful,
        elapsed_ms=body.elapsedMs,
        evaluation=evaluation.to_stored(),
        flow_context=flow_context,
        modality_context=modality_context,
        interaction_id=body.interactionId,
        generated_card_id=body.generatedCardId,
        generated_card_json=json.dumps(body.generatedCard) if body.generatedCard else None,
        live_coach_used=body.liveCoachUsed,
        modality=modality,
        created_at=now,
    )

    return {"saved": True, "attemptId": row["id"] if row else None}
