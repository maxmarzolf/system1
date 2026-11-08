"""Persists a graded submission: the one write path for practice records."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.contracts.evaluation import Evaluation
from app.contracts.submission import SubmissionRecord
from app.models import AttemptCreate
from app.repositories.attempts_repository import insert_submission_attempt_row
from app.services.contracts import AttemptSaveResult


def _submission_signals(
    body: AttemptCreate,
    *,
    modality: str,
    evaluation: Evaluation,
) -> dict[str, Any]:
    raw_signals = body.signals if isinstance(body.signals, dict) else {}
    signals: dict[str, Any] = {
        "elapsed_ms": body.elapsedMs,
        "evaluation": evaluation.to_stored(),
    }
    flow_signals = raw_signals.get("flow")
    if isinstance(flow_signals, dict) and flow_signals:
        signals["flow"] = flow_signals

    modality_signals = raw_signals.get("modality")
    if isinstance(modality_signals, dict):
        signals["modality"] = {
            **modality_signals,
            "kind": modality,
        }
    else:
        signals["modality"] = {"kind": modality}
    return signals


async def create_attempt(
    body: AttemptCreate,
    *,
    successful: bool,
    evaluation: Evaluation,
    record: SubmissionRecord | None = None,
) -> AttemptSaveResult:
    now = datetime.now(tz=timezone.utc)
    modality = body.resolved_modality().value
    signals = _submission_signals(body, modality=modality, evaluation=evaluation)
    row = await insert_submission_attempt_row(
        session_id=body.resolved_session_id(),
        card_id=body.cardId,
        card_title=body.cardTitle,
        question=body.question,
        question_type=body.questionType,
        category_tags=body.categoryTags,
        correct_answer=record.correct_answer if record else body.correctAnswer,
        user_answer=record.user_answer if record else body.userAnswer,
        multiple_choice_problem_id=record.multiple_choice_problem_id if record else None,
        mode=body.mode.value,
        successful=successful,
        signals_json=json.dumps({key: value for key, value in signals.items() if value is not None}),
        interaction_id=body.interactionId,
        generated_card_id=body.generatedCardId,
        generated_card_json=json.dumps(body.generatedCard) if body.generatedCard else None,
        template_mode=body.templateMode.value,
        support_layer=body.supportLayer.value,
        live_coach_used=body.liveCoachUsed,
        modality=modality,
        target_source=body.targetSource,
        target_control=body.targetControl,
        format_control=body.formatControl,
        created_at=now,
        updated_at=now,
    )

    return {"saved": True, "attemptId": row["id"] if row else None}
