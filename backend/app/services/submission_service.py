"""The one write path for practice answers: grade through the pipeline, then store."""

from __future__ import annotations

from typing import Any

from app.core.llm import capture_llm_exchanges
from app.models import AttemptCreate
from app.services import submission_store
from app.services.evaluation import pipeline


async def create_submission(body: AttemptCreate) -> dict[str, Any]:
    # Every LLM call made while grading (the feedback writer) is recorded with the evaluation.
    with capture_llm_exchanges() as exchanges:
        outcome = await pipeline.evaluate(body)
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
