"""Multiple-choice question generation: run the LLM requests, validate each card, persist.

Concerns live apart:

- what to ask the model is :mod:`app.core.generator.mcq_prompt`;
- retries and the provider chain are :func:`app.core.llm.complete_json_with_fallback`;
- this module coordinates them and validates each card (:func:`_process_multiple_choice_card`).

A random set fans out into one concurrent call per question, so it takes about as long as one
question. A progressive set (a Socratic chain) stays one call. Each card's LLM exchanges,
failed attempts included, are captured and handed to the persist callback with it.
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from dataclasses import replace
from datetime import datetime, timezone
from typing import Any

from app.contracts.coaching import MultipleChoiceDrillsRequest, MultipleChoiceDrillsResponse, SkillMapNode
from app.core.taxonomy import slugify
from app.core.llm import CallJson, LlmCall, LlmUnavailableError, call_llm_json_with, capture_llm_exchanges, complete_json_with_fallback
from app.core.generator.mcq_prompt import McqLlmRequest, progressive_set_request, question_request
from app.core.generator.types import MultipleChoiceQuestionPayload
from app.core.generator.code_style import normalize_python_markdown_display

LlmExchanges = list[dict[str, Any]]
PersistGenerated = Callable[
    [list[MultipleChoiceQuestionPayload], list[LlmExchanges]],
    Awaitable[list[MultipleChoiceQuestionPayload | None] | None],
]


def _normalize_mcq_difficulty(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"hard", "difficult"}:
        return "Hard"
    return "Med."


def _normalize_mcq_choice_id(value: Any, fallback_index: int) -> str:
    text = str(value or "").strip().upper()
    if text in {"A", "B", "C", "D"}:
        return text
    return ["A", "B", "C", "D"][fallback_index]


def _process_multiple_choice_card(raw: Any, index: int, body: MultipleChoiceDrillsRequest) -> MultipleChoiceQuestionPayload | None:
    if not isinstance(raw, dict):
        return None

    source_node = body.skillMap[index % max(len(body.skillMap), 1)] if body.skillMap else None
    pattern = str(raw.get("pattern") or getattr(source_node, "algorithm", "") or "Algorithm").strip()
    skill = str(raw.get("skill") or "").strip()
    source_methods = list(getattr(source_node, "skills", []) or [])
    if not skill and body.sourceMode == "skill-map" and len(source_methods) == 1:
        skill = str(source_methods[0]).strip()
    pattern_slug = slugify(pattern) or "algorithm"
    title = str(raw.get("title") or f"{pattern} Multiple Choice").strip()
    question = normalize_python_markdown_display(str(raw.get("question") or ""))
    explanation = normalize_python_markdown_display(str(raw.get("explanation") or ""))
    difficulty = _normalize_mcq_difficulty(str(raw.get("difficulty") or body.difficulty))

    raw_choices = raw.get("choices")
    if not isinstance(raw_choices, list) or len(raw_choices) < 4:
        return None

    choices: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for choice_index, choice in enumerate(raw_choices[:4]):
        if isinstance(choice, dict):
            choice_id = _normalize_mcq_choice_id(choice.get("id"), choice_index)
            text = normalize_python_markdown_display(str(choice.get("text") or ""))
        else:
            choice_id = ["A", "B", "C", "D"][choice_index]
            text = normalize_python_markdown_display(str(choice or ""))
        if not text:
            return None
        if choice_id in seen_ids:
            choice_id = ["A", "B", "C", "D"][choice_index]
        seen_ids.add(choice_id)
        choices.append({"id": choice_id, "text": text})

    correct_choice_id = _normalize_mcq_choice_id(raw.get("correctChoiceId"), 0)
    choice_ids = {choice["id"] for choice in choices}
    if correct_choice_id not in choice_ids:
        return None
    if not question or not explanation:
        return None

    random.shuffle(choices)
    label_order = ["A", "B", "C", "D"]
    correct_text = next(choice["text"] for choice in choices if choice["id"] == correct_choice_id)
    choices = [{"id": label_order[i], "text": choice["text"]} for i, choice in enumerate(choices)]
    correct_choice_id = next(choice["id"] for choice in choices if choice["text"] == correct_text)

    raw_tags = [str(tag).strip() for tag in raw.get("tags", []) if str(tag).strip()] if isinstance(raw.get("tags"), list) else []
    tags: list[str] = []
    source_tag = f"source-{body.sourceMode}"
    flow_tag = f"flow-{body.flowMode}"
    skill_slug = slugify(skill)
    for tag in ["skill-map", "skill-map-mcq", pattern_slug, skill_slug, source_tag, flow_tag, *raw_tags]:
        if tag and tag not in tags:
            tags.append(tag)

    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    return {
        "id": f"mcq-{stamp}-{index + 1}",
        "title": title,
        "algorithm": pattern,
        "skill": skill,
        "difficulty": difficulty,
        "question": question,
        "choices": choices,
        "correctChoiceId": correct_choice_id,
        "explanation": explanation,
        "tags": tags,
    }


def _unavailable(code: str, message: str, provider: str, api_error_code: str) -> LlmUnavailableError:
    return LlmUnavailableError(code=code, message=message, provider=provider, api_error_code=api_error_code)


def _skill_nodes(body: MultipleChoiceDrillsRequest) -> list[SkillMapNode]:
    """One skill-map node per question, repeating the supplied ones to fill ``count``."""
    nodes = list(body.skillMap[: body.count]) or [SkillMapNode(algorithm="Algorithm", skills=[])]
    while len(nodes) < body.count:
        nodes.extend(nodes[: body.count - len(nodes)])
    return nodes


async def _run(
    request: McqLlmRequest,
    accept: Callable[[dict[str, Any]], Any],
    *,
    providers: list[str],
    call: LlmCall,
    call_json: CallJson,
    retry_delays_seconds: tuple[float, ...],
    label: str,
) -> tuple[Any, LlmExchanges]:
    """One request through the provider chain, with its exchanges captured. The capture is
    opened inside this coroutine, so concurrent requests (separate tasks) keep their own."""
    with capture_llm_exchanges() as exchanges:
        outcome = await complete_json_with_fallback(
            request.system_prompt,
            request.payload,
            providers,
            replace(call, max_tokens=request.max_tokens),
            accept,
            call_json=call_json,
            retry_delays_seconds=retry_delays_seconds,
            label=label,
        )
    return (outcome[0] if outcome else None), list(exchanges)


async def generate_multiple_choice_drills_response(
    body: MultipleChoiceDrillsRequest,
    *,
    provider: str,
    provider_label: str,
    provider_available: bool,
    call_llm_json: CallJson = call_llm_json_with,
    call: LlmCall | None = None,
    fallback_providers: list[tuple[str, str, bool]] | None = None,
    retry_delays_seconds: tuple[float, ...] = (0.4, 0.8),
    persist_generated_questions: PersistGenerated | None = None,
    logger: logging.Logger | None = None,
) -> MultipleChoiceDrillsResponse:
    candidates = [candidate for candidate in (fallback_providers or [(provider, provider_label, provider_available)]) if candidate[2]]
    if not candidates:
        raise _unavailable(
            "mcq_generation_missing_api_key",
            f"Multiple choice questions cannot be generated at this time. No API key is configured for {provider_label}.",
            provider,
            "provider_auth_error",
        )
    providers = [candidate[0] for candidate in candidates]
    first_label = candidates[0][1]
    run_options = {
        "providers": providers,
        "call": call or LlmCall(timeout_seconds=60, temperature=0.7),
        "call_json": call_llm_json,
        "retry_delays_seconds": retry_delays_seconds,
    }

    difficulty = _normalize_mcq_difficulty(body.difficulty)
    seed = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    nodes = _skill_nodes(body)

    drills: list[MultipleChoiceQuestionPayload | None]
    traces: list[LlmExchanges]
    if body.flowMode == "progressive" and body.count > 1:

        def accept_set(reply: dict[str, Any]) -> list[MultipleChoiceQuestionPayload] | None:
            raw = reply.get("drills")
            if not isinstance(raw, list) or len(raw) < body.count:
                return None
            cards = [_process_multiple_choice_card(item, index, body) for index, item in enumerate(raw[: body.count])]
            return None if any(card is None for card in cards) else cards  # type: ignore[return-value]

        cards, exchanges = await _run(
            progressive_set_request(body, nodes, difficulty, seed), accept_set, label="MCQ generation (progressive set)", **run_options
        )
        drills = cards or [None] * body.count
        traces = [exchanges] * body.count
    else:

        def accept_one(index: int) -> Callable[[dict[str, Any]], MultipleChoiceQuestionPayload | None]:
            def accept(reply: dict[str, Any]) -> MultipleChoiceQuestionPayload | None:
                raw = reply.get("drill")
                if raw is None and isinstance(reply.get("drills"), list) and reply["drills"]:
                    raw = reply["drills"][0]  # tolerate the set shape
                return _process_multiple_choice_card(raw, index, body)

            return accept

        results = await asyncio.gather(
            *(
                _run(
                    question_request(body, nodes[index], index, difficulty, seed),
                    accept_one(index),
                    label=f"MCQ generation (question {index + 1}/{body.count})",
                    **run_options,
                )
                for index in range(body.count)
            )
        )
        drills = [card for card, _ in results]
        traces = [exchanges for _, exchanges in results]

    if any(card is None for card in drills):
        failed = sum(card is None for card in drills)
        if logger is not None:
            logger.warning("MCQ generation: %s of %s questions had no valid reply after retries.", failed, body.count)
        raise _unavailable(
            "mcq_generation_no_response",
            f"Multiple choice questions cannot be generated at this time. No valid response from {first_label}.",
            provider,
            "provider_empty_response",
        )
    ready: list[MultipleChoiceQuestionPayload] = [card for card in drills if card is not None]

    if persist_generated_questions is not None:
        # Submissions are graded against the stored row, so a card must be served
        # with the stored id and choice order; an unsaved card could not be graded.
        try:
            stored = await persist_generated_questions(ready, traces)
        except Exception as error:
            if logger is not None:
                logger.warning("Persisting generated multiple-choice questions failed: %s", error)
            raise _unavailable(
                "mcq_generation_persist_failed", "Multiple choice questions cannot be saved at this time.", provider, "persist_failed"
            ) from error
        if stored is not None:
            ready = [{**drill, **row} if row else drill for drill, row in zip(ready, stored, strict=True)]

    return MultipleChoiceDrillsResponse(drills=ready, llmUsed=True)
