"""What an MCQ generation call asks the model: the system prompt and the payload.

Pure functions, no I/O. Two request shapes:

- :func:`question_request` asks for one question from one angle. Random sets fan out into one
  of these per question, so they generate concurrently.
- :func:`progressive_set_request` asks for a whole Socratic chain in one call, because each
  question has to build on the one before it.

The model is asked only for what the server cannot derive: ``id``, ``tags``, ``pattern`` and
``difficulty`` are set from the request by :func:`app.core.generator.mcq._process_multiple_choice_card`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.contracts.coaching import MultipleChoiceDrillsRequest, SkillMapNode
from app.core.taxonomy import slugify

# One per question in a random set, cycled for larger sets, so parallel calls don't converge.
QUESTION_ANGLES = (
    "the invariant the code maintains",
    "a boundary or edge case",
    "a state update or loop decision",
    "a common implementation bug and how to repair it",
    "complexity, or a tradeoff against an adjacent approach",
)

# Output budgets: generous for one question with a short snippet, scaled for a chain.
SINGLE_QUESTION_MAX_TOKENS = 1200
PER_QUESTION_MAX_TOKENS = 900

_DRILL_FIELDS = (
    'title (short, pattern-first), skill (the one supplied method it tests), question, '
    'choices (exactly four objects {"id": "A"|"B"|"C"|"D", "text": "..."}), correctChoiceId, '
    "and explanation (why the answer is right, one or two sentences)"
)


@dataclass(frozen=True)
class McqLlmRequest:
    system_prompt: str
    payload: dict[str, Any]
    max_tokens: int


def _source_instruction(body: MultipleChoiceDrillsRequest) -> str:
    if body.sourceMode == "skill-map":
        return (
            "Anchor each drill on one specific method supplied in the skill map. "
            "Set the drill's skill field to that exact method and isolate the decision that demonstrates it. "
        )
    if body.sourceMode == "card":
        return (
            "Anchor every drill on the provided specimenContext. The specimen prompt and target code are the source of truth. "
            "Questions should test why that exact specimen works: its invariant, state variables, loop or branch decisions, boundary handling, and likely implementation mistakes. "
            "Do not drift into unrelated LeetCode problems or generic pattern trivia unless it directly explains the specimen. "
        )
    return (
        "Anchor each drill on the named algorithm pattern itself, not on an individual LeetCode problem. "
        "Questions must test the broader algorithm pattern, invariant, tradeoff, state choice, boundary condition, or debugging insight, not a specific core algorithm memorized fact. "
    )


def _focus_instruction(body: MultipleChoiceDrillsRequest) -> str:
    if body.sourceMode != "card" or not body.specimen or not body.specimen.focus:
        return ""
    focus = body.specimen.focus
    text = ""
    if focus.missedLines:
        text += (
            "The provided specimenContext includes missed lines from the learner's prior recall attempt. "
            "Treat those missed lines as the remediation target. Test why a missed line exists, what bug the drift causes, how to repair it, or what invariant it protects. "
        )
    if focus.recentAttempts or focus.weaknessSummary:
        text += (
            "It also includes recentAttempts across recall, ghost, MCQ, and microdrill plus a weaknessSummary. "
            "Use that cross-modality evidence to address the most persistent unresolved weakness, and avoid repeating recent questions. "
        )
    if focus.phase in {"challenge", "mastered"}:
        text += (
            "The learner is proficient in this card space. Increase the challenge with an edge case, transfer case, competing invariant, tradeoff, or subtle bug, "
            "while remaining strictly grounded in the same specimen and algorithm space. Do not switch to a different card. "
        )
    elif focus.phase == "remediate":
        text += "Keep the question narrow and corrective before adding novelty. "
    return text


_STYLE_RULES = (
    "Prefer code-centered questions: show a compact Python snippet, loop condition, state update, return line, or one-line mutation when that makes the algorithm idea concrete; "
    "a purely conceptual question is fine about one time in four. "
    "Any Python snippets must be fenced as ```python blocks and follow PEP 8: 4-space indentation, snake_case names, spaces around binary operators, spaces after commas. "
    "Keep snippets compact: at most 4 short lines in the question, and at most one short line per choice. "
    "Make distractors plausible for adjacent patterns or common code-level mistakes. "
)


def _skill_map_entry(node: SkillMapNode) -> dict[str, Any]:
    return {"pattern": node.algorithm, "methods": node.skills, "patternSlug": slugify(node.algorithm)}


def _base_payload(body: MultipleChoiceDrillsRequest, difficulty: str, seed: str) -> dict[str, Any]:
    return {
        "difficulty": difficulty,
        "sourceMode": body.sourceMode,
        "flowMode": body.flowMode,
        "generationSeed": seed,
        "specimenContext": body.specimen.model_dump() if body.sourceMode == "card" and body.specimen else None,
    }


def question_request(
    body: MultipleChoiceDrillsRequest, node: SkillMapNode, index: int, difficulty: str, seed: str
) -> McqLlmRequest:
    """One question, from the angle at ``index``, about ``node``."""
    angle = QUESTION_ANGLES[index % len(QUESTION_ANGLES)]
    system_prompt = (
        "You write one multiple-choice card for algorithm pattern recognition and reasoning. "
        f'Return only a JSON object shaped like {{"drill": {{...}}}} where the drill has {_DRILL_FIELDS}. '
        f"{_source_instruction(body)}"
        f"{_focus_instruction(body)}"
        f"Test {angle}; other cards in the same set cover other angles, so stay on this one. "
        f"{_STYLE_RULES}"
        "Use the requested difficulty."
    )
    payload = {**_base_payload(body, difficulty, f"{seed}-{index + 1}"), "angle": angle, "skillMap": [_skill_map_entry(node)]}
    return McqLlmRequest(system_prompt, payload, SINGLE_QUESTION_MAX_TOKENS)


def progressive_set_request(
    body: MultipleChoiceDrillsRequest, nodes: list[SkillMapNode], difficulty: str, seed: str
) -> McqLlmRequest:
    """A Socratic chain of ``body.count`` questions, in one call."""
    system_prompt = (
        "You write multiple-choice cards for algorithm pattern recognition and reasoning. "
        f'Return only a JSON object shaped like {{"drills": [...]}} with exactly the requested count, where each drill has {_DRILL_FIELDS}. '
        f"{_source_instruction(body)}"
        f"{_focus_instruction(body)}"
        "Order the drills as a Socratic chain. Drill 1 should establish the key idea. "
        "Each later drill must build directly on the immediately previous drill by deepening, challenging, or applying that prior concept. "
        "The set should still be answerable one question at a time, but the sequence must feel intentionally cumulative. "
        f"{_STYLE_RULES}"
        "Use the requested difficulty for every drill."
    )
    payload = {
        **_base_payload(body, difficulty, seed),
        "count": body.count,
        "skillMap": [_skill_map_entry(node) for node in nodes],
    }
    return McqLlmRequest(system_prompt, payload, PER_QUESTION_MAX_TOKENS * body.count + 300)
