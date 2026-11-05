from __future__ import annotations

from typing import Any

from app.models import AttemptCreate
from app.services import attempts_service
from app.services.evaluators import get_evaluator


async def create_submission(body: AttemptCreate) -> dict[str, Any]:
    outcome = await get_evaluator(body.resolved_modality()).evaluate(body)
    saved = await attempts_service.create_attempt(
        body,
        successful=outcome.successful,
        evaluation=outcome.evaluation,
        record=outcome.record,
    )
    return {
        **saved,
        "successful": outcome.successful,
        "evaluation": outcome.evaluation,
        "feedbackUnavailable": outcome.feedback_unavailable,
    }
