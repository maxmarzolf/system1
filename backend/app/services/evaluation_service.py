from __future__ import annotations

from app.domain.template_evaluator import evaluate_attempt_by_template_mode
from app.models import CoachAttemptEvaluationRequest


async def coach_attempt_evaluation(body: CoachAttemptEvaluationRequest):
    return evaluate_attempt_by_template_mode(
        body.expectedAnswer,
        body.userAnswer,
        body.skillTags,
        body.templateMode.value,
        body.submissionTuning,
    )
