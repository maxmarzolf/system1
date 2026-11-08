"""MCQ evaluation through Jev.

One ``system_one`` call carries the correctness Choice ("1" = answered
correctly, "0" = not) and one question per signal plug-in in the MCQ spec, all
over the same state: question, answers, correctAnswer, submittedAnswer. The
spec and correctness wording are loaded from the database for every
submission, so /admin edits apply to the next one.
Plug-ins marked ``needs_correctness`` go in a second call whose state adds
``answeredCorrectly``. If Jev is unavailable, the stored answer key decides.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from app.config import settings
from app.core.jev import HttpJevGateway, JevGateway, JevQuestion, JevResponse, JevUnavailableError
from app.core.signals import (
    CORRECTNESS_QUESTION_ID,
    ModalitySignalSpec,
    SignalContext,
    SignalPlugin,
    SignalResult,
    applies,
    skipped,
)
from app.core.signals.mcq import MCQ_MODALITY
from app.domain.feedback_builder import rubric_from_signal_results
from app.contracts.evaluation import Evaluation, build_evaluation
from app.models import AttemptCreate, SubmissionModality
from app.services import signal_registry_service
from app.contracts.submission import EvaluationOutcome, SubmissionRecord
from app.services.evaluators.registry import register_evaluator
from app.services.submission_context_service import McqContext, build_mcq_context

logger = logging.getLogger(__name__)

LOW_CONFIDENCE_THRESHOLD = 0.6


def default_jev_gateway() -> JevGateway:
    if not settings.jev_enabled:
        raise JevUnavailableError("jev_disabled", "Jev evaluation is disabled (JEV_ENABLED=false).")
    return HttpJevGateway(
        api_key=settings.typesafe_api_key,
        model=settings.jev_model,
        base_url=settings.typesafe_base_url,
        timeout_seconds=settings.jev_timeout_seconds,
    )


def _choice_text(answer: dict[str, str]) -> str:
    return f"{answer['id']}. {answer['text']}"


def _record(context: McqContext) -> SubmissionRecord:
    return SubmissionRecord(
        user_answer=_choice_text(context.submitted_answer),
        correct_answer=_choice_text(context.correct_answer),
        multiple_choice_problem_id=context.problem_id,
    )


def _plugin_questions(plugins: list[SignalPlugin], context: SignalContext) -> dict[str, JevQuestion]:
    questions: dict[str, JevQuestion] = {}
    for plugin in plugins:
        question = plugin.question(context)
        if question is not None:
            questions[plugin.key] = question
    return questions


def _trace(response: JevResponse, questions: dict[str, JevQuestion]) -> dict[str, Any]:
    return {
        "model": response.model,
        "requestId": response.request_id,
        "usage": response.usage,
        "questionIds": list(questions),
        "answers": response.answers,
    }


def _add_provenance(evaluation: Evaluation, **fields: Any) -> None:
    for name, value in fields.items():
        setattr(evaluation.provenance, name, value)


class JevMcqEvaluator:
    name = "jev-mcq"

    def __init__(self, gateway_factory: Callable[[], JevGateway] = default_jev_gateway):
        self._gateway_factory = gateway_factory

    async def evaluate(self, body: AttemptCreate) -> EvaluationOutcome:
        context = await build_mcq_context(body)
        spec = await signal_registry_service.load_mcq_spec(
            signal_registry_service.mcq_algorithm_for_tags(body.categoryTags)
        )
        signal_context = SignalContext(modality=MCQ_MODALITY, state=context.jev_state(), elapsed_ms=context.elapsed_ms)
        plugins = [plugin for plugin, _weight in spec.plugins()]
        first_pass = [plugin for plugin in plugins if not plugin.needs_correctness]
        second_pass = [plugin for plugin in plugins if plugin.needs_correctness]

        questions = {CORRECTNESS_QUESTION_ID: spec.correctness.question(), **_plugin_questions(first_pass, signal_context)}
        try:
            gateway = self._gateway_factory()
            response = await gateway.system_one(signal_context.state, questions)
        except JevUnavailableError as error:
            logger.warning("Jev MCQ evaluation unavailable (%s): %s", error.code, error.message)
            return self._answer_key_fallback(context, spec, signal_context, plugins, error)

        correctness = response.answers[CORRECTNESS_QUESTION_ID]
        label = str(correctness.get("choice", ""))
        successful = label == "1"
        answers: dict[str, Any] = dict(response.answers)
        traces = [_trace(response, questions)]

        second_pass_error: JevUnavailableError | None = None
        second_questions = _plugin_questions(second_pass, signal_context)
        if second_questions:
            state = {**signal_context.state, "answeredCorrectly": 1 if successful else 0}
            try:
                second = await gateway.system_one(state, second_questions)
                answers.update(second.answers)
                traces.append(_trace(second, second_questions))
            except JevUnavailableError as error:
                second_pass_error = error

        results: dict[str, SignalResult] = {}
        for plugin in plugins:
            if not applies(plugin, successful):
                results[plugin.key] = skipped(plugin, "not_applicable")
            elif plugin.needs_correctness and second_pass_error is not None:
                results[plugin.key] = skipped(plugin, "unavailable", second_pass_error.message)
            else:
                results[plugin.key] = plugin.interpret(answers.get(plugin.key), signal_context, successful)

        confidence = float(correctness.get("confidence", 0.0) or 0.0)
        agreement = successful == context.answer_key_correct
        flags = []
        if not agreement:
            flags.append("answer_key_disagreement")
            logger.warning(
                "Jev correctness %s disagrees with the answer key for problem %s (request %s)",
                label,
                context.problem_id,
                response.request_id,
            )
        if confidence < LOW_CONFIDENCE_THRESHOLD:
            flags.append("low_correctness_confidence")

        evaluation = self._evaluation(spec, successful, results, source="jev")
        evaluation.correctness = {
            "label": label,
            "confidence": round(confidence, 3),
            "probabilities": correctness.get("probabilities", {}),
            "answerKeyAgreement": agreement,
        }
        _add_provenance(
            evaluation,
            engine="jev",
            model=response.model,
            requestIds=[trace["requestId"] for trace in traces],
            usage=response.usage,
            flags=flags,
        )
        evaluation.jevTrace = traces
        return EvaluationOutcome(successful=successful, evaluation=evaluation, record=_record(context))

    def _evaluation(
        self,
        spec: ModalitySignalSpec,
        successful: bool,
        results: dict[str, SignalResult],
        *,
        source: str,
    ) -> Evaluation:
        rubric = rubric_from_signal_results(spec, successful, results)
        evaluation = build_evaluation(rubric, spec, provider="jev", llm_used=source == "jev", source=source)
        evaluation.signalResults = {key: result.to_json() for key, result in results.items()}
        evaluation.signalSpecSnapshot = spec.snapshot()
        return evaluation

    def _answer_key_fallback(
        self,
        context: McqContext,
        spec: ModalitySignalSpec,
        signal_context: SignalContext,
        plugins: list[SignalPlugin],
        error: JevUnavailableError,
    ) -> EvaluationOutcome:
        successful = context.answer_key_correct
        results: dict[str, SignalResult] = {}
        for plugin in plugins:
            if not applies(plugin, successful):
                results[plugin.key] = skipped(plugin, "not_applicable")
            elif plugin.question(signal_context) is None:
                results[plugin.key] = plugin.interpret(None, signal_context, successful)
            else:
                results[plugin.key] = skipped(plugin, "unavailable", error.message)
        evaluation = self._evaluation(spec, successful, results, source="answer-key-fallback")
        _add_provenance(evaluation, engine="answer-key", flags=["jev_unavailable"])
        return EvaluationOutcome(
            successful=successful,
            evaluation=evaluation,
            feedback_unavailable={"code": error.code, "message": error.message, "provider": "jev"},
            record=_record(context),
        )


register_evaluator(JevMcqEvaluator(), SubmissionModality.mcq)
