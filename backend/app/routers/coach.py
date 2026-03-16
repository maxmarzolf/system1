from __future__ import annotations

import ast
import asyncio
import json
import urllib.error
import urllib.request
from collections import Counter
from typing import Any

from fastapi import APIRouter

from app.config import settings
from app.models import (
    CoachAttemptFeedbackRequest,
    CoachAttemptFeedbackResponse,
    CoachSessionPlanRequest,
    CoachSessionPlanResponse,
)

router = APIRouter(prefix="/api/coach", tags=["coach"])


def _normalize_code(code: str) -> str:
    return (
        code.replace("\r\n", "\n")
        .split("\n")
    )


def _trim_line(line: str) -> str:
    return line.rstrip()


def _line_similarity(expected: str, actual: str) -> float:
    if not expected and not actual:
        return 1.0
    max_len = max(len(expected), len(actual), 1)
    matches = sum(1 for idx in range(min(len(expected), len(actual))) if expected[idx] == actual[idx])
    return matches / max_len


def _first_mismatch_line(expected_lines: list[str], actual_lines: list[str]) -> int | None:
    max_len = max(len(expected_lines), len(actual_lines))
    for idx in range(max_len):
        exp = _trim_line(expected_lines[idx]) if idx < len(expected_lines) else ""
        got = _trim_line(actual_lines[idx]) if idx < len(actual_lines) else ""
        if exp != got:
            return idx + 1
    return None


def _indent_errors(expected_lines: list[str], actual_lines: list[str]) -> int:
    errors = 0
    for idx in range(min(len(expected_lines), len(actual_lines))):
        exp = _trim_line(expected_lines[idx])
        got = _trim_line(actual_lines[idx])
        if exp.lstrip() and exp.lstrip() == got.lstrip():
            exp_indent = len(exp) - len(exp.lstrip(" "))
            got_indent = len(got) - len(got.lstrip(" "))
            if exp_indent != got_indent:
                errors += 1
    return errors


def _missing_extra_counts(expected_lines: list[str], actual_lines: list[str]) -> tuple[int, int]:
    expected_counter = Counter(line.strip() for line in expected_lines if line.strip())
    actual_counter = Counter(line.strip() for line in actual_lines if line.strip())
    missing = 0
    extra = 0
    for line, count in expected_counter.items():
        missing += max(0, count - actual_counter.get(line, 0))
    for line, count in actual_counter.items():
        extra += max(0, count - expected_counter.get(line, 0))
    return missing, extra


def _has_syntax_error(code: str) -> bool:
    try:
        ast.parse(code if code.endswith("\n") else f"{code}\n")
        return False
    except SyntaxError:
        return True


def _heuristic_attempt_feedback(body: CoachAttemptFeedbackRequest) -> dict[str, Any]:
    expected_lines = _normalize_code(body.expectedAnswer)
    actual_lines = _normalize_code(body.userAnswer)
    first_mismatch = _first_mismatch_line(expected_lines, actual_lines)
    indent_errors = _indent_errors(expected_lines, actual_lines)
    missing_count, extra_count = _missing_extra_counts(expected_lines, actual_lines)
    syntax_error = _has_syntax_error(body.userAnswer) if body.userAnswer.strip() else True
    opening_similarity = _line_similarity(
        _trim_line(expected_lines[0]) if expected_lines else "",
        _trim_line(actual_lines[0]) if actual_lines else "",
    )

    error_tags: list[str] = []
    if syntax_error:
        error_tags.append("syntax")
    if indent_errors > 0:
        error_tags.append("indentation")
    if missing_count > 0:
        error_tags.append("omission")
    if extra_count > 0:
        error_tags.append("intrusion")
    if first_mismatch is not None and first_mismatch <= 3:
        error_tags.append("opening-anchor")
    if body.elapsedMs > 90_000:
        error_tags.append("slow-recall")
    if body.exact:
        error_tags.append("exact")

    strengths: list[str] = []
    if body.accuracy >= 90:
        strengths.append("High token-level accuracy under recall pressure.")
    if not syntax_error and body.userAnswer.strip():
        strengths.append("Python syntax remained valid.")
    if body.elapsedMs <= 45_000 and body.userAnswer.strip():
        strengths.append("Recall speed is moving toward automaticity.")
    if not strengths:
        strengths.append("You completed a full recall attempt, which gives trainable signal.")

    if syntax_error:
        primary_focus = "Stabilize syntax before chasing speed."
        immediate = "Fix the first syntax break and retype only that block once from memory."
    elif missing_count > 0:
        primary_focus = "Recover omitted logical steps."
        immediate = f"Rehearse the {missing_count} missing line(s) as a contiguous chunk."
    elif indent_errors > 0:
        primary_focus = "Tighten indentation precision."
        immediate = "Repeat once with strict 4-space indentation and colon-driven nesting."
    elif first_mismatch is not None and first_mismatch <= 3:
        primary_focus = "Lock in the opening anchor lines."
        immediate = "Say the first 3 lines aloud, then retype immediately."
    elif body.elapsedMs > 60_000:
        primary_focus = "Increase recall speed without accuracy loss."
        immediate = "Run one timed rep with a 20% lower time cap than this attempt."
    else:
        primary_focus = "Push from near-exact to exact recall."
        immediate = "Re-run now and target zero character drift."

    diagnosis = (
        f"Accuracy {round(body.accuracy)}% in {body.elapsedMs / 1000:.1f}s; "
        f"first drift at line {first_mismatch if first_mismatch is not None else 'none'}."
    )
    if syntax_error:
        diagnosis += " Syntax instability is the main limiter."
    elif missing_count > 0:
        diagnosis += " Main loss came from omitted steps."
    elif indent_errors > 0:
        diagnosis += " Core logic is present but indentation drifted."
    elif not body.exact:
        diagnosis += " Mostly correct; errors are precision-level."
    else:
        diagnosis += " Exact recall achieved."

    micro_drill = (
        "2-minute loop: hide answer, type from memory, compare, then immediately retype only the mismatched lines."
    )
    if error_tags and "opening-anchor" in error_tags:
        micro_drill = "3 reps: type only function signature + base case, then full answer once."
    elif "indentation" in error_tags:
        micro_drill = "3 reps: copy recall with explicit indentation count (0/4/8 spaces) before each line."
    elif "syntax" in error_tags:
        micro_drill = "3 reps: type with a brief pause after each ':' and 'return' to protect structure."

    next_target = (
        f"Next rep target: >= {min(100, max(85, int(body.accuracy) + 5))}% accuracy under "
        f"{max(20, int((body.elapsedMs / 1000) * 0.8))}s."
    )
    if body.exact:
        next_target = (
            f"Next rep target: exact recall again under {max(15, int((body.elapsedMs / 1000) * 0.85))}s."
        )

    return {
        "diagnosis": diagnosis,
        "primaryFocus": primary_focus,
        "immediateCorrection": immediate,
        "microDrill": micro_drill,
        "nextRepTarget": next_target,
        "strengths": strengths[:3],
        "errorTags": error_tags,
        "llmUsed": False,
        "signals": {
            "first_mismatch": first_mismatch,
            "indent_errors": indent_errors,
            "missing_count": missing_count,
            "extra_count": extra_count,
            "syntax_error": syntax_error,
            "opening_similarity": round(opening_similarity, 3),
        },
    }


def _heuristic_session_plan(body: CoachSessionPlanRequest) -> dict[str, Any]:
    weak_cards = sorted(body.weakestCards, key=lambda c: (c.accuracy, -c.elapsedMs))[:3]
    weak_labels = ", ".join(f"#{c.cardId} ({round(c.accuracy)}%)" for c in weak_cards) or "none"

    if body.avgAccuracy >= 95:
        focus_theme = "Speed compression while protecting exactness."
        warmup = "2 cards, one untimed exact rep each."
        main_set = "6 timed reps at 85% of today’s average time. Stop if exactness drops twice."
    elif body.avgAccuracy >= 85:
        focus_theme = "Close the last precision gaps."
        warmup = "3 opening-anchor drills (signature + base case)."
        main_set = f"8 reps: alternate weak cards ({weak_labels}) with one strong card."
    else:
        focus_theme = "Stabilize structure before speed."
        warmup = "3 slow exact reps with full compare after each attempt."
        main_set = f"10 reps focused on weak cards ({weak_labels}); untimed until >90%."

    cooldown = "1 exact rep on your easiest card to end with a clean memory trace."
    note = (
        "Keep one coaching focus per session. If accuracy falls for two consecutive reps, "
        "drop speed pressure and rebuild exactness."
    )
    headline = (
        f"{body.mode.value} session: {body.correctCount}/{body.attempts} exact, "
        f"{round(body.avgAccuracy)}% avg accuracy."
    )

    return {
        "headline": headline,
        "focusTheme": focus_theme,
        "warmup": warmup,
        "mainSet": main_set,
        "cooldown": cooldown,
        "note": note,
        "llmUsed": False,
    }


def _call_chat_completion_json(system_prompt: str, user_payload: dict[str, Any]) -> dict[str, Any] | None:
    if not settings.coach_openai_api_key:
        return None

    url = f"{settings.coach_openai_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.coach_openai_model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload)},
        ],
    }
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.coach_openai_api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            content = payload["choices"][0]["message"]["content"]
            return json.loads(content)
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError):
        return None


async def _attempt_feedback_with_optional_llm(
    body: CoachAttemptFeedbackRequest, heuristic: dict[str, Any]
) -> dict[str, Any]:
    if not settings.coach_openai_api_key:
        return heuristic

    system_prompt = (
        "You are a live coding coach watching a draft in progress. Return strict JSON with keys: "
        "diagnosis, primaryFocus, immediateCorrection, microDrill, nextRepTarget, strengths, errorTags. "
        "Be concise, structural, and general. Do not give full solutions, code skeletons, or line-by-line rewrites. "
        "Prefer advice that generalizes to this approach and would still be useful on similar interview problems. "
        "Give one high-value next structural move."
        if body.draftMode
        else "You are a high-performance memory coach. Return strict JSON with keys: "
        "diagnosis, primaryFocus, immediateCorrection, microDrill, nextRepTarget, strengths, errorTags. "
        "Use concise, precise coaching grounded only in provided evidence."
    )
    llm_payload = {
        "card": {"id": body.cardId, "title": body.cardTitle, "prompt": body.prompt},
        "attempt": {
            "accuracy": body.accuracy,
            "exact": body.exact,
            "elapsedMs": body.elapsedMs,
            "expectedAnswer": body.expectedAnswer[:1200],
            "userAnswer": body.userAnswer[:1200],
        },
        "previousAttempts": body.previousAttempts[-3:],
        "draftMode": body.draftMode,
        "draftMilestones": body.draftMilestones,
        "heuristic": {
            "diagnosis": heuristic["diagnosis"],
            "primaryFocus": heuristic["primaryFocus"],
            "signals": heuristic["signals"],
        },
    }

    llm_response = await asyncio.to_thread(_call_chat_completion_json, system_prompt, llm_payload)
    if not llm_response:
        return heuristic

    required = ["diagnosis", "primaryFocus", "immediateCorrection", "microDrill", "nextRepTarget"]
    if any(key not in llm_response for key in required):
        return heuristic

    return {
        **heuristic,
        "diagnosis": str(llm_response.get("diagnosis", heuristic["diagnosis"])),
        "primaryFocus": str(llm_response.get("primaryFocus", heuristic["primaryFocus"])),
        "immediateCorrection": str(llm_response.get("immediateCorrection", heuristic["immediateCorrection"])),
        "microDrill": str(llm_response.get("microDrill", heuristic["microDrill"])),
        "nextRepTarget": str(llm_response.get("nextRepTarget", heuristic["nextRepTarget"])),
        "strengths": [str(x) for x in llm_response.get("strengths", heuristic["strengths"])][:3],
        "errorTags": [str(x) for x in llm_response.get("errorTags", heuristic["errorTags"])][:6],
        "llmUsed": True,
    }


async def _session_plan_with_optional_llm(
    body: CoachSessionPlanRequest, heuristic: dict[str, Any]
) -> dict[str, Any]:
    if not settings.coach_openai_api_key:
        return heuristic

    system_prompt = (
        "You are a training coach building practical next-session plans for recall training. "
        "Return strict JSON with keys: headline, focusTheme, warmup, mainSet, cooldown, note."
    )
    llm_payload = {
        "session": {
            "mode": body.mode.value,
            "questionType": body.questionType,
            "orderType": body.orderType,
            "attempts": body.attempts,
            "correctCount": body.correctCount,
            "avgAccuracy": body.avgAccuracy,
            "avgElapsedMs": body.avgElapsedMs,
        },
        "weakestCards": [c.model_dump() for c in body.weakestCards[:5]],
        "heuristic": heuristic,
    }

    llm_response = await asyncio.to_thread(_call_chat_completion_json, system_prompt, llm_payload)
    if not llm_response:
        return heuristic

    required = ["headline", "focusTheme", "warmup", "mainSet", "cooldown", "note"]
    if any(key not in llm_response for key in required):
        return heuristic

    return {
        "headline": str(llm_response.get("headline", heuristic["headline"])),
        "focusTheme": str(llm_response.get("focusTheme", heuristic["focusTheme"])),
        "warmup": str(llm_response.get("warmup", heuristic["warmup"])),
        "mainSet": str(llm_response.get("mainSet", heuristic["mainSet"])),
        "cooldown": str(llm_response.get("cooldown", heuristic["cooldown"])),
        "note": str(llm_response.get("note", heuristic["note"])),
        "llmUsed": True,
    }


@router.post("/attempt-feedback", response_model=CoachAttemptFeedbackResponse)
async def coach_attempt_feedback(body: CoachAttemptFeedbackRequest):
    heuristic = _heuristic_attempt_feedback(body)
    feedback = await _attempt_feedback_with_optional_llm(body, heuristic)
    feedback.pop("signals", None)
    return feedback


@router.post("/session-plan", response_model=CoachSessionPlanResponse)
async def coach_session_plan(body: CoachSessionPlanRequest):
    heuristic = _heuristic_session_plan(body)
    plan = await _session_plan_with_optional_llm(body, heuristic)
    return plan
