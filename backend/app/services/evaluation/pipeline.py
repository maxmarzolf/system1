"""One evaluation pipeline for every practice modality.

    context → spec → Jev pass 1 → decide → Jev pass 2 → interpret → band → rubric → feedback → outcome

Each step is its own module (``context``/``contexts``, ``jev``, ``verdict``, ``feedback``; the
rubric is ``domain/feedback_builder``) and can be worked on and tested alone. What differs by
modality is only the context builder registered for it and the modality's signal spec
(``signal_definition`` rows, edited on /admin). See ``docs/grading.md``.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.contracts.evaluation import Evaluation, build_evaluation
from app.contracts.submission import EvaluationOutcome
from app.core.code_checks import OVERRIDE_REASONS
from app.core.jev import JevGateway
from app.core.signals import ModalitySignalSpec, SignalResult
from app.domain.feedback_builder import rubric_from_signal_results
from app.models import AttemptCreate
from app.services import grading_settings_service, signal_registry_service
from app.services.evaluation.context import ContextBuilder, SubmissionContext
from app.services.evaluation.contexts.code import (
    GhostRepContextBuilder,
    LadderContextBuilder,
    MicrodrillContextBuilder,
    TotalRecallContextBuilder,
)
from app.services.evaluation.contexts.mcq import McqContextBuilder
from app.services.evaluation.feedback import FeedbackResult, write_feedback
from app.services.evaluation.jev import JevAsker, JevExchange
from app.services.evaluation.verdict import Decision, band, decide, interpret_signals
from app.services.jev_gateway import default_jev_gateway

CONTEXT_BUILDERS: dict[str, ContextBuilder] = {}
# How the pipeline reaches Jev; tests replace it with a fake gateway.
jev_gateway_factory: Callable[[], JevGateway] = default_jev_gateway


def register_context_builder(builder: ContextBuilder) -> ContextBuilder:
    CONTEXT_BUILDERS[builder.modality] = builder
    return builder


def register_default_context_builders() -> None:
    """Every modality's context builder; an explicit registration made earlier wins."""
    for builder in (
        McqContextBuilder(),
        TotalRecallContextBuilder(),
        GhostRepContextBuilder(),
        MicrodrillContextBuilder(),
        LadderContextBuilder(),
    ):
        CONTEXT_BUILDERS.setdefault(builder.modality, builder)


def context_builder(modality: str) -> ContextBuilder:
    if not CONTEXT_BUILDERS:
        register_default_context_builders()
    try:
        return CONTEXT_BUILDERS[modality]
    except KeyError as error:
        raise LookupError(f"No context builder registered for {modality!r}.") from error


def _correctness(context: SubmissionContext, decision: Decision, exchange: JevExchange) -> dict[str, Any]:
    answer = exchange.correctness or {}
    correctness: dict[str, Any] = {
        "source": decision.source,
        "deterministicCorrect": context.deterministic_correct,
    }
    if decision.label is not None:
        correctness.update(
            label=decision.label,
            confidence=round(decision.confidence, 3) if decision.confidence is not None else None,
            probabilities=answer.get("probabilities", {}),
        )
    if context.deterministic_is_key and decision.source == "jev":
        correctness["answerKeyAgreement"] = decision.successful == context.deterministic_correct
    if context.overrides:
        correctness["overrides"] = [{"key": key, "message": OVERRIDE_REASONS[key]} for key in context.overrides]
    return correctness


def _assemble(
    context: SubmissionContext,
    spec: ModalitySignalSpec,
    decision: Decision,
    exchange: JevExchange,
    results: dict[str, SignalResult],
    verdict: str,
    feedback: FeedbackResult | None,
) -> Evaluation:
    rubric = rubric_from_signal_results(
        spec,
        decision.successful,
        results,
        verdict=verdict,
        failure_evidence=[OVERRIDE_REASONS[key] for key in context.overrides],
    )
    jev_answered = bool(exchange.responses)
    evaluation = build_evaluation(
        rubric,
        spec,
        feedback.feedback if feedback else None,
        provider="jev" if jev_answered else "",
        llm_used=jev_answered,
        source=decision.source,
    )
    evaluation.correctness = _correctness(context, decision, exchange)
    evaluation.signalResults = {key: result.to_json() for key, result in results.items()}
    evaluation.signalSpecSnapshot = spec.snapshot()
    flags = list(decision.flags)
    if feedback is not None and feedback.error:
        flags.append(feedback.error)
    provenance = evaluation.provenance
    provenance.engine = "jev" if jev_answered else "deterministic"
    provenance.flags = flags
    if jev_answered:
        provenance.model = exchange.responses[0].model
        provenance.requestIds = [trace["requestId"] for trace in exchange.traces]
        provenance.usage = exchange.responses[0].usage
    if feedback is not None and feedback.provider:
        provenance.feedbackProvider = feedback.provider
    if exchange.traces:
        evaluation.jevTrace = exchange.traces
    return evaluation


async def evaluate(
    body: AttemptCreate,
    *,
    gateway_factory: Callable[[], JevGateway] | None = None,
) -> EvaluationOutcome:
    """Grade one submission, whatever its modality."""
    modality = body.resolved_modality().value
    context = await context_builder(modality).build(body)
    spec = await signal_registry_service.load_spec(modality, context.algorithm_slug)
    settings = await grading_settings_service.grading_settings()

    asker = JevAsker(gateway_factory or jev_gateway_factory)
    exchange = await asker.first_pass(spec, context)
    decision = decide(context, spec, exchange, low_confidence=settings.low_confidence_threshold)
    await asker.second_pass(spec, context, exchange, decision.successful)
    results = interpret_signals(spec, context, exchange, decision.successful)
    verdict = band(decision.successful, results, settings.near_miss_threshold)

    feedback = None
    if modality in settings.feedback_modalities:
        feedback = await write_feedback(
            context, verdict=verdict, successful=decision.successful, results=results, requested_provider=body.llmProvider
        )

    evaluation = _assemble(context, spec, decision, exchange, results, verdict, feedback)
    unavailable = exchange.first_pass_error
    return EvaluationOutcome(
        successful=decision.successful,
        evaluation=evaluation,
        feedback_unavailable={"code": unavailable.code, "message": unavailable.message, "provider": "jev"} if unavailable else None,
        record=context.record,
    )
