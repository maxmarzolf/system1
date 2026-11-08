"""Multiple-choice question generation and validation."""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from app.models import MultipleChoiceDrillsRequest, MultipleChoiceDrillsResponse, SkillMapNode
from app.core.taxonomy import slugify
from app.core.llm import LlmUnavailableError
from app.core.generator.types import LLMJsonPayload, LLMJsonResponse, MultipleChoiceQuestionPayload
from app.core.generator.code_style import normalize_python_markdown_display


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


async def generate_multiple_choice_drills_response(
    body: MultipleChoiceDrillsRequest,
    *,
    provider: str,
    provider_label: str,
    provider_available: bool,
    call_llm_json: Callable[[str, LLMJsonPayload, str, int, int, float], LLMJsonResponse | None],
    fallback_providers: list[tuple[str, str, bool]] | None = None,
    provider_timeout_seconds: int = 60,
    retry_delays_seconds: tuple[float, ...] = (0.4, 0.8),
    persist_generated_questions: Callable[
        [list[MultipleChoiceQuestionPayload]],
        Awaitable[list[MultipleChoiceQuestionPayload | None] | None],
    ] | None = None,
    logger: logging.Logger | None = None,
) -> MultipleChoiceDrillsResponse:
    provider_candidates = fallback_providers or [(provider, provider_label, provider_available)]
    available_candidates = [candidate for candidate in provider_candidates if candidate[2]]

    if not available_candidates:
        raise LlmUnavailableError(
            code="mcq_generation_missing_api_key",
            message=f"Multiple choice questions cannot be generated at this time. No API key is configured for {provider_label}.",
            provider=provider,
            api_error_code="provider_auth_error",
        )

    difficulty = _normalize_mcq_difficulty(body.difficulty)
    generation_seed = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    skill_map = list(body.skillMap[: body.count])
    if not skill_map:
        skill_map = [SkillMapNode(algorithm="Algorithm", skills=[])]
    while len(skill_map) < body.count:
        skill_map.extend(skill_map[: body.count - len(skill_map)])

    source_instruction = (
        "Anchor each drill on the named algorithm pattern itself, not on an individual LeetCode problem. "
        "Questions must test the broader algorithm pattern, invariant, tradeoff, state choice, boundary condition, or debugging insight, not a specific core algorithm memorized fact. "
    )
    if body.sourceMode == "skill-map":
        source_instruction = (
            "Anchor each drill on one specific method supplied in the skill map. "
            "Set the drill's skill field to that exact method and isolate the decision that demonstrates it. "
        )
    if body.sourceMode == "card":
        source_instruction = (
            "Anchor every drill on the provided specimenContext. The specimen prompt and target code are the source of truth. "
            "Questions should test why that exact specimen works: its invariant, state variables, loop or branch decisions, boundary handling, and likely implementation mistakes. "
            "Do not drift into unrelated LeetCode problems or generic pattern trivia unless it directly explains the specimen. "
        )

    focus_instruction = ""
    if body.sourceMode == "card" and body.specimen and body.specimen.focus:
        focus = body.specimen.focus
        if focus.missedLines:
            focus_instruction += (
                "The provided specimenContext includes missed lines from the learner's prior recall attempt. "
                "Treat those missed lines as the remediation target. Test why a missed line exists, what bug the drift causes, how to repair it, or what invariant it protects. "
            )
        if focus.recentAttempts or focus.weaknessSummary:
            focus_instruction += (
                "It also includes recentAttempts across recall, ghost, MCQ, and microdrill plus a weaknessSummary. "
                "Use that cross-modality evidence to address the most persistent unresolved weakness, and avoid repeating recent questions. "
            )
        if focus.phase in {"challenge", "mastered"}:
            focus_instruction += (
                "The learner is proficient in this card space. Increase the challenge with an edge case, transfer case, competing invariant, tradeoff, or subtle bug, "
                "while remaining strictly grounded in the same specimen and algorithm space. Do not switch to a different card. "
            )
        elif focus.phase == "remediate":
            focus_instruction += "Keep the question narrow and corrective before adding novelty. "

    flow_instruction = (
        "Create a varied but balanced set across the requested patterns or specimen facets. "
        "Avoid near-duplicates while keeping coverage even. "
    )
    if body.flowMode == "progressive":
        flow_instruction = (
            "Order the drills as a Socratic chain. Drill 1 should establish the key idea. "
            "Each later drill must build directly on the immediately previous drill by deepening, challenging, or applying that prior concept. "
            "The set should still be answerable one question at a time, but the sequence must feel intentionally cumulative. "
        )

    system_prompt = (
        "You generate multiple-choice cards for algorithm pattern recognition and reasoning. "
        "Return only a top-level JSON object shaped exactly like {\"drills\": [...]}. "
        "The drills array must contain exactly the requested count. "
        "Each drill must have id, title, pattern, skill, difficulty, question, choices, correctChoiceId, explanation, and tags. "
        "Skill must name the single method from the supplied skill map that the drill primarily tests. "
        "Each choices array must contain exactly four objects with ids A, B, C, and D and concise answer text. "
        f"{source_instruction}"
        f"{focus_instruction}"
        f"{flow_instruction}"
        "Prefer code-centered questions: show a compact Python snippet, loop condition, state update, return line, or one-line mutation when that makes the algorithm idea concrete. "
        "Roughly three out of four drills should include a short code snippet in the question or choices; the rest may be purely conceptual. "
        "Any Python snippets must be fenced as ```python blocks and must follow PEP 8: 4-space indentation, snake_case names, spaces around binary operators, spaces after commas, and no cramped one-letter soup except conventional indexes. "
        "Keep snippets compact: at most 4 short lines in the question, and at most one short line per choice. "
        "Make distractors plausible for adjacent patterns or common code-level mistakes. "
        "Use the requested difficulty for every drill. "
        "Tags must include skill-map, skill-map-mcq, the slug for the algorithm pattern, source mode, and flow mode."
    )
    llm_payload = {
        "questionType": body.questionType,
        "count": body.count,
        "difficulty": difficulty,
        "sourceMode": body.sourceMode,
        "flowMode": body.flowMode,
        "generationSeed": generation_seed,
        "skillMap": [
            {
                "pattern": node.algorithm,
                "methods": node.skills,
                "patternSlug": slugify(node.algorithm),
            }
            for node in skill_map[: body.count]
        ],
        "specimenContext": body.specimen.model_dump() if body.sourceMode == "card" and body.specimen else None,
        "schema": {
            "drill": {
                "id": "temporary id from model; server will replace it",
                "title": "short pattern-first title",
                "pattern": "algorithm pattern name",
                "skill": "one supplied skill-map method",
                "difficulty": difficulty,
                "question": "one multiple-choice question",
                "choices": [
                    {"id": "A", "text": "choice text"},
                    {"id": "B", "text": "choice text"},
                    {"id": "C", "text": "choice text"},
                    {"id": "D", "text": "choice text"},
                ],
                "correctChoiceId": "A",
                "explanation": "why the answer is correct in one or two sentences",
                "tags": ["skill-map", "skill-map-mcq", "pattern-slug"],
            }
        },
    }

    llm_response: LLMJsonResponse | None = None
    resolved_provider = provider
    resolved_provider_label = provider_label
    for candidate_provider, candidate_label, _available in available_candidates:
        candidate_response: LLMJsonResponse | None = None
        max_attempts = len(retry_delays_seconds) + 1
        for attempt_index in range(max_attempts):
            candidate_response = await asyncio.to_thread(
                call_llm_json,
                system_prompt,
                llm_payload,
                candidate_provider,
                5000,
                provider_timeout_seconds,
                0.7,
            )
            if candidate_response and isinstance(candidate_response.get("drills"), list):
                llm_response = candidate_response
                resolved_provider = candidate_provider
                resolved_provider_label = candidate_label
                break

            if logger is not None:
                logger.warning(
                    "MCQ generation received invalid/empty response from %s (attempt %s/%s).",
                    candidate_label,
                    attempt_index + 1,
                    max_attempts,
                )

            if attempt_index < len(retry_delays_seconds):
                await asyncio.sleep(retry_delays_seconds[attempt_index])

        if llm_response is not None:
            break

        if logger is not None:
            logger.warning("MCQ generation exhausted retries for %s; trying next provider.", candidate_label)

    if not llm_response:
        raise LlmUnavailableError(
            code="mcq_generation_no_response",
            message=f"Multiple choice questions cannot be generated at this time. No valid response from {resolved_provider_label}.",
            provider=resolved_provider,
            api_error_code="provider_empty_response",
        )

    drills: list[MultipleChoiceQuestionPayload] = []
    for index, raw in enumerate(llm_response["drills"][: body.count]):
        processed = _process_multiple_choice_card(raw, index, body)
        if not processed:
            raise LlmUnavailableError(
                code="mcq_generation_invalid_response",
                message=f"Multiple choice questions cannot be generated at this time. Invalid response from {resolved_provider_label}.",
                provider=resolved_provider,
                api_error_code="provider_invalid_json",
            )
        drills.append(processed)

    if len(drills) != body.count:
        raise LlmUnavailableError(
            code="mcq_generation_invalid_response",
            message=f"Multiple choice questions cannot be generated at this time. Invalid response from {resolved_provider_label}.",
            provider=resolved_provider,
            api_error_code="provider_invalid_json",
        )

    if persist_generated_questions is not None:
        # Submissions are graded against the stored row, so a card must be served
        # with the stored id and choice order; an unsaved card could not be graded.
        try:
            stored = await persist_generated_questions(drills)
        except Exception as error:
            if logger is not None:
                logger.warning("Persisting generated multiple-choice questions failed: %s", error)
            raise LlmUnavailableError(
                code="mcq_generation_persist_failed",
                message="Multiple choice questions cannot be saved at this time.",
                provider=resolved_provider,
                api_error_code="persist_failed",
            ) from error
        if stored is not None:
            drills = [{**drill, **row} if row else drill for drill, row in zip(drills, stored, strict=True)]

    return MultipleChoiceDrillsResponse(drills=drills, llmUsed=True)
