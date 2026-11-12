from __future__ import annotations

from typing import Any

from app.core.llm import capture_llm_exchanges
from app.models import AttemptCreate
from app.services import submission_store
from app.services.evaluators import get_evaluator


async def create_submission(body: AttemptCreate) -> dict[str, Any]:
    # Every LLM call the evaluator makes is recorded and stored with the evaluation.
    with capture_llm_exchanges() as exchanges:
        outcome = await get_evaluator(body.resolved_modality()).evaluate(body)
    if exchanges:
        outcome.evaluation.llmTrace = list(exchanges)
    saved = await submission_store.create_attempt(
        body,
        successful=outcome.successful,
        evaluation=outcome.evaluation,
        record=outcome.record,
    )
    return {
        **saved,
        "successful": outcome.successful,
        "evaluation": outcome.evaluation.to_stored(),
        "feedbackUnavailable": outcome.feedback_unavailable,
    }
