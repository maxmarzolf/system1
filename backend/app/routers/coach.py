from __future__ import annotations

import ast
import asyncio
import builtins
import difflib
import json
import keyword
import logging
import queue as thread_queue
import random
import re
import urllib.error
import urllib.request
from collections import Counter
from collections.abc import Generator
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.database import get_pool
from app.models import (
    AdaptiveVariationRequest,
    AdaptiveVariationResponse,
    CoachAttemptEvaluationRequest,
    CoachAttemptEvaluationResponse,
    CoachAttemptFeedbackRequest,
    CoachAttemptFeedbackResponse,
    CoachPracticeHistoryRequest,
    CoachPracticeHistoryResponse,
    CoachSessionPlanRequest,
    CoachSessionPlanResponse,
    SkillMapDrillsRequest,
    SkillMapDrillsResponse,
    TemplateMode,
)
from app.readiness import READINESS_MODE_ORDER, summarize_readiness
from app.submission_rubric import compact_submission_rubric, summarize_submission_rubrics

router = APIRouter(prefix="/api/coach", tags=["coach"])
logger = logging.getLogger(__name__)

LIVE_STAGE_ORDER = {"early": 0, "mid": 1, "late": 2, "very-late": 3}
LIVE_FEEDBACK_FREQUENCIES = {"more-often", "balanced", "less-often"}
TEMPLATE_MODE_ORDER = ("pseudo", "invariant", "algorithm")
PYTHON_BUILTIN_NAMES = set(dir(builtins))
PYTHON_KEYWORDS = set(keyword.kwlist)
LIVE_TUNING_DEFAULTS: dict[str, Any] = {
    "focusMode": "memorization",
    "tone": "calm",
    "singleIssue": True,
    "showPatternNames": False,
    "specificitySource": "time-and-quality",
    "feedbackFrequency": "balanced",
    "allowExactEditsWhenStuck": True,
    "canonicalAnswerStage": "late",
    "affirmationMode": "stable-only",
    "driftThresholdAttempts": 3,
    "stallThresholdSeconds": 40,
}
SUBMISSION_TUNING_DEFAULTS: dict[str, Any] = {
    "gradingMode": "core-logic",
    "contractStrictness": "light",
    "rewardEquivalentPhrasing": True,
    "requireAnswerStep": True,
    "allowExtraParameters": True,
}
SUBMISSION_DIMENSION_LABELS = {
    "contract": "Problem contract",
    "pattern": "Core pattern",
    "state": "State representation",
    "control_flow": "Control flow shape",
    "invariant": "Invariant or decision rule",
    "state_updates": "State update correctness",
    "ordering": "Step ordering",
    "answer_path": "Answer recording or return path",
    "edge_cases": "Edge-case coverage",
    "recall_fidelity": "Recall fidelity",
    "executability": "Syntax and executability",
    "fluency": "Speed and fluency",
    "structure": "Solution structure",
    "correctness": "Correctness",
    "completeness": "Completeness",
    "patternFidelity": "Pattern fidelity",
    "syntax": "Syntax and executability",
    "completionTime": "Speed and fluency",
}
ANTHROPIC_MODEL_CANDIDATES = (
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-20250514",
    "claude-3-haiku-20240307",
)
SUBMISSION_LLM_MAX_RETRIES = 3
SUBMISSION_LLM_RETRY_DELAYS_SECONDS = (0.3, 0.6, 0.9)
ASSESSOR_MAX_TOKENS = 600
NARRATOR_MAX_TOKENS = 1800
DRILL_GEN_MAX_TOKENS = 8000
DRILL_GEN_OPENAI_TIMEOUT_SECONDS = 90
DRILL_GEN_TEMPERATURE = 0.7


class SubmissionFeedbackUnavailableError(RuntimeError):
    def __init__(self, code: str, message: str, provider: str, api_error_code: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.provider = provider
        self.api_error_code = api_error_code


def _llm_provider_label(provider: str) -> str:
    if provider == "claude":
        return "Claude"
    if provider == "gemma":
        return "Gemma"
    return "ChatGPT"


def _submission_feedback_error_detail(
    code: str,
    message: str,
    provider: str,
    api_error_code: str = "",
) -> dict[str, str]:
    return {
        "code": code,
        "message": message,
        "provider": provider,
        "providerLabel": _llm_provider_label(provider),
        "apiErrorCode": api_error_code,
    }


def _coach_llm_http_exception(error: SubmissionFeedbackUnavailableError) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=_submission_feedback_error_detail(
            error.code,
            error.message,
            error.provider,
            error.api_error_code,
        ),
    )


def _extract_provider_error_message(payload_text: str) -> str:
    text = payload_text.strip()
    if not text:
        return ""
    try:
        parsed = json.loads(text)
    except ValueError:
        return text[:300]

    if isinstance(parsed, dict):
        error_block = parsed.get("error")
        if isinstance(error_block, dict):
            message = str(error_block.get("message", "")).strip()
            if message:
                return message
        message = str(parsed.get("message", "")).strip()
        if message:
            return message
    return text[:300]


def _submission_provider_error_from_http(
    provider: str,
    status_code: int,
    payload_text: str,
) -> tuple[str, str, bool]:
    detail = _extract_provider_error_message(payload_text)
    detail_lower = detail.lower()
    label = _llm_provider_label(provider)

    if "credit balance is too low" in detail_lower or "insufficient" in detail_lower and "credit" in detail_lower:
        return (
            "provider_insufficient_credits",
            f"{label} API error: insufficient credits. Add credits in your provider billing and try again.",
            False,
        )
    if status_code in {401, 403} or "api key" in detail_lower or "authentication" in detail_lower:
        return (
            "provider_auth_error",
            f"{label} API error: authentication failed. Verify the API key in backend .env.",
            False,
        )
    if status_code == 429 or "rate" in detail_lower and "limit" in detail_lower:
        return (
            "provider_rate_limited",
            f"{label} API error: rate limited. Please retry in a moment.",
            True,
        )
    if status_code in {400, 404} and "model" in detail_lower:
        return (
            "provider_model_error",
            f"{label} API error: model configuration is invalid or unavailable.",
            False,
        )

    if status_code >= 500:
        return (
            "provider_server_error",
            f"{label} API error: upstream service issue ({status_code}). Please retry shortly.",
            True,
        )

    if detail:
        return (
            "provider_request_error",
            f"{label} API error: {detail}",
            False,
        )
    return (
        "provider_request_error",
        f"{label} API error: request failed with status {status_code}.",
        False,
    )


def _submission_provider_error_from_exception(provider: str, error: Exception) -> tuple[str, str, bool]:
    label = _llm_provider_label(provider)
    if isinstance(error, TimeoutError):
        return (
            "provider_timeout",
            f"{label} API error: request timed out. Please retry.",
            True,
        )
    if isinstance(error, urllib.error.URLError):
        reason = str(getattr(error, "reason", "")).strip()
        detail = f" ({reason})" if reason else ""
        return (
            "provider_network_error",
            f"{label} API error: network/connectivity issue{detail}.",
            True,
        )
    return (
        "provider_unknown_error",
        f"{label} API error: unexpected request failure.",
        True,
    )


def _call_llm_json_for_submission(
    system_prompt: str,
    user_payload: dict[str, Any],
    provider: str,
) -> tuple[dict[str, Any] | None, str, str, bool]:
    try:
        if provider == "claude":
            if not settings.coach_anthropic_api_key:
                return None, "provider_auth_error", "Claude API key is missing.", False
            url = f"{settings.coach_anthropic_base_url.rstrip('/')}/messages"
            model = str(settings.coach_anthropic_model or "").strip() or "claude-sonnet-4-6"
            body = {
                "model": model,
                "temperature": 0.2,
                "max_tokens": 1800,
                "system": f"{system_prompt}\nReturn only valid JSON. Do not include markdown.",
                "messages": [{"role": "user", "content": json.dumps(user_payload)}],
            }
            data = json.dumps(body).encode("utf-8")
            request = urllib.request.Request(
                url,
                data=data,
                method="POST",
                headers={
                    "x-api-key": settings.coach_anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read().decode("utf-8")
                payload = json.loads(raw)
                content = payload.get("content", [])
                if not isinstance(content, list):
                    return None, "provider_response_format_error", "Claude API returned an unexpected response format.", True
                text_parts: list[str] = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        text_parts.append(str(item.get("text", "")))
                if not text_parts:
                    return None, "provider_empty_response", "Claude API returned an empty response.", True
                parsed = _extract_json_dict("\n".join(text_parts))
                if not isinstance(parsed, dict):
                    return None, "provider_invalid_json", "Claude API response could not be parsed as JSON.", True
                return parsed, "", "", False

        if provider == "gemma":
            if not settings.coach_gemma_api_key:
                return None, "provider_auth_error", "Gemma API key is missing.", False
            model = str(settings.coach_gemma_model or "").strip() or "gemma-4-31b-it"
            url = f"{settings.coach_gemma_base_url.rstrip('/')}/models/{model}:generateContent?key={settings.coach_gemma_api_key}"
            prompt = f"{system_prompt}\nReturn only valid JSON. Do not include markdown.\n\n{json.dumps(user_payload)}"
            body = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
            }
            data = json.dumps(body).encode("utf-8")
            request = urllib.request.Request(
                url,
                data=data,
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read().decode("utf-8")
                payload = json.loads(raw)
                candidates = payload.get("candidates", [])
                if candidates and isinstance(candidates, list):
                    parts = candidates[0].get("content", {}).get("parts", [])
                    text_parts = [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("text")]
                    if text_parts:
                        parsed = _extract_json_dict("\n".join(text_parts))
                        if isinstance(parsed, dict):
                            return parsed, "", "", False
                return None, "provider_invalid_json", "Gemma API response could not be parsed as JSON.", True

        if not settings.coach_openai_api_key:
            return None, "provider_auth_error", "ChatGPT API key is missing.", False

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
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            content = payload["choices"][0]["message"]["content"]
            parsed = _extract_json_dict(content)
            if not isinstance(parsed, dict):
                return None, "provider_invalid_json", "ChatGPT API response could not be parsed as JSON.", True
            return parsed, "", "", False
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        code, message, retryable = _submission_provider_error_from_http(provider, error.code, details)
        logger.warning("%s request failed (%s): %s", _llm_provider_label(provider), error.code, details[:400])
        return None, code, message, retryable
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as error:
        code, message, retryable = _submission_provider_error_from_exception(provider, error)
        logger.warning("%s request failed: %s", _llm_provider_label(provider), error)
        return None, code, message, retryable



class _IdentifierCanonicalizer(ast.NodeTransformer):
    def __init__(self):
        self._scopes: list[dict[str, str]] = [{}]
        self._counters = {"func": 0, "var": 0}

    def _push_scope(self):
        self._scopes.append({})

    def _pop_scope(self):
        self._scopes.pop()

    def _lookup(self, name: str) -> str | None:
        for scope in reversed(self._scopes):
            if name in scope:
                return scope[name]
        return None

    def _bind(self, name: str, kind: str = "var") -> str:
        existing = self._scopes[-1].get(name)
        if existing:
            return existing
        self._counters[kind] += 1
        placeholder = f"{kind}_{self._counters[kind]}"
        self._scopes[-1][name] = placeholder
        return placeholder

    def visit_FunctionDef(self, node: ast.FunctionDef):
        node.name = self._bind(node.name, "func")
        node.decorator_list = [self.visit(item) for item in node.decorator_list]
        if node.returns:
            node.returns = self.visit(node.returns)
        self._push_scope()
        node.args = self.visit(node.args)
        node.body = [self.visit(statement) for statement in node.body]
        self._pop_scope()
        return node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        node.name = self._bind(node.name, "func")
        node.decorator_list = [self.visit(item) for item in node.decorator_list]
        if node.returns:
            node.returns = self.visit(node.returns)
        self._push_scope()
        node.args = self.visit(node.args)
        node.body = [self.visit(statement) for statement in node.body]
        self._pop_scope()
        return node

    def visit_Lambda(self, node: ast.Lambda):
        self._push_scope()
        node.args = self.visit(node.args)
        node.body = self.visit(node.body)
        self._pop_scope()
        return node

    def visit_arg(self, node: ast.arg):
        node.arg = self._bind(node.arg, "var")
        return node

    def visit_Name(self, node: ast.Name):
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            node.id = self._bind(node.id, "var")
            return node

        existing = self._lookup(node.id)
        if existing:
            node.id = existing
            return node

        if node.id in PYTHON_KEYWORDS or node.id in PYTHON_BUILTIN_NAMES:
            return node

        return node


def _canonicalize_identifier_names(code: str) -> str | None:
    try:
        parsed = ast.parse(code if code.endswith("\n") else f"{code}\n")
    except SyntaxError:
        return None

    canonicalizer = _IdentifierCanonicalizer()
    canonical_tree = canonicalizer.visit(parsed)
    ast.fix_missing_locations(canonical_tree)
    return ast.dump(canonical_tree, annotate_fields=True, include_attributes=False)


def _evaluate_attempt_soundness(expected_answer: str, user_answer: str) -> dict[str, Any]:
    normalized_expected = expected_answer.strip()
    normalized_user = user_answer.strip()
    syntax_valid = not _has_syntax_error(user_answer) if normalized_user else False
    expected_ast = _canonicalize_identifier_names(normalized_expected)
    user_ast = _canonicalize_identifier_names(normalized_user) if syntax_valid else None

    if not normalized_user:
        return {"accuracy": 0.0, "sound": False, "syntaxValid": False}

    if expected_ast and user_ast and expected_ast == user_ast:
        return {"accuracy": 100.0, "sound": True, "syntaxValid": True}

    similarity = difflib.SequenceMatcher(a=expected_ast or normalized_expected, b=user_ast or normalized_user).ratio()
    return {
        "accuracy": round(similarity * 100, 1),
        "sound": False,
        "syntaxValid": syntax_valid,
    }


def _evaluate_attempt_by_template_mode(
    expected_answer: str,
    user_answer: str,
    skill_tags: list[str],
    template_mode: str,
    submission_tuning: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if template_mode == TemplateMode.algorithm.value:
        return _evaluate_attempt_soundness(expected_answer, user_answer)
    return _analyze_template_attempt(user_answer, skill_tags, template_mode, submission_tuning, expected_answer)


def _merged_submission_tuning(raw_tuning: dict[str, Any] | None) -> dict[str, Any]:
    raw = raw_tuning if isinstance(raw_tuning, dict) else {}
    tuning = {**SUBMISSION_TUNING_DEFAULTS}

    grading_mode = str(raw.get("gradingMode", tuning["gradingMode"])).strip().lower()
    if grading_mode in {"core-logic", "balanced", "strict"}:
        tuning["gradingMode"] = grading_mode

    contract_strictness = str(raw.get("contractStrictness", tuning["contractStrictness"])).strip().lower()
    if contract_strictness in {"light", "balanced", "strict"}:
        tuning["contractStrictness"] = contract_strictness

    tuning["rewardEquivalentPhrasing"] = bool(raw.get("rewardEquivalentPhrasing", tuning["rewardEquivalentPhrasing"]))
    tuning["requireAnswerStep"] = bool(raw.get("requireAnswerStep", tuning["requireAnswerStep"]))
    tuning["allowExtraParameters"] = bool(raw.get("allowExtraParameters", tuning["allowExtraParameters"]))
    return tuning


def _has_syntax_error(code: str) -> bool:
    try:
        ast.parse(code if code.endswith("\n") else f"{code}\n")
        return False
    except SyntaxError:
        return True


def _template_mode_value(value: TemplateMode | str | None) -> str:
    if isinstance(value, TemplateMode):
        return value.value
    normalized = str(value or "").strip().lower()
    return normalized if normalized in TEMPLATE_MODE_ORDER else TemplateMode.algorithm.value


def _normalized_template_text(text: str) -> str:
    lowered = text.replace("\r\n", "\n").lower()
    lowered = re.sub(r"[^a-z0-9_+\-=\n\s]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _has_any_pattern(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def _template_progress_profile(skill_tags: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    pattern_tag = _primary_pattern_tag(skill_tags)

    generic_steps = [
        {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b", r"\bsolve\b"]},
        {"key": "state", "label": "state setup", "patterns": [r"\binit", r"\bstate\b", r"\bsetup\b", r"\btrack\b"]},
        {"key": "flow", "label": "main control flow", "patterns": [r"\bfor each\b", r"\biterate\b", r"\brepeat\b", r"\bfor\b", r"\bwhile\b"]},
        {"key": "update", "label": "state update", "patterns": [r"\bupdate\b", r"\badvance\b", r"\bmove\b", r"\bappend\b", r"\bpop\b", r"\b=\b"]},
        {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
    ]
    generic_critical = ["state", "flow", "update", "return"]

    profiles: dict[str, tuple[list[dict[str, Any]], list[str]]] = {
        "sliding-window": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b", r"\bsliding[_ ]window\b"]},
                {"key": "state", "label": "window state", "patterns": [r"\bleft\b", r"\bstate\b", r"\bcount\b", r"\bcounts\b", r"\bbest\b"]},
                {"key": "expand", "label": "expand step", "patterns": [r"\bfor right\b", r"\benumerate\b", r"\bincoming\b", r"\bexpand\b", r"\badd\b.+\bwindow\b"]},
                {"key": "repair", "label": "window repair", "patterns": [r"\bwhile\b.+\binvalid\b", r"\bwindow is invalid\b", r"\brestore validity\b", r"\bwhile len\b"]},
                {"key": "shrink", "label": "left-side shrink", "patterns": [r"\bremove\b.+\bleft\b", r"\bmove left\b", r"\bleft\s*\+=\s*1\b", r"\bshrink\b"]},
                {"key": "score", "label": "valid-window scoring", "patterns": [r"\bbest\s*=\s*max\(", r"\bupdate\b.+\bbest\b", r"\bre-?calculate\b.+\bbest\b", r"\brecord\b.+\banswer\b", r"\bscore\b", r"\bright - left \+ 1\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b.+\bbest\b", r"\breturn\b.+\bresult\b", r"\breturn\b"]},
            ],
            ["state", "expand", "repair", "shrink", "score", "return"],
        ),
        "two-pointers": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "pointers", "label": "pointer setup", "patterns": [r"\bleft\b", r"\bright\b", r"\btwo pointers\b"]},
                {"key": "loop", "label": "pointer scan loop", "patterns": [r"\bwhile left < right\b", r"\bfor each pair\b", r"\bscan from both ends\b"]},
                {"key": "compare", "label": "comparison rule", "patterns": [r"\bcompare\b", r"\btarget\b", r"\btoo small\b", r"\btoo large\b", r"\bif\b.+\btarget\b"]},
                {"key": "move", "label": "pointer movement", "patterns": [r"\bleft\s*\+=\s*1\b", r"\bright\s*-=\s*1\b", r"\bmove left\b", r"\bmove right\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bfound\b", r"\banswer\b"]},
            ],
            ["pointers", "loop", "compare", "move", "return"],
        ),
        "binary-search": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "bounds", "label": "interval setup", "patterns": [r"\bleft\b", r"\bright\b", r"\bsearch interval\b", r"\blow\b", r"\bhigh\b"]},
                {"key": "loop", "label": "search loop", "patterns": [r"\bwhile left <= right\b", r"\bwhile low <= high\b", r"\bwhile\b.+\binterval\b"]},
                {"key": "mid", "label": "midpoint step", "patterns": [r"\bmid\b", r"\bmiddle\b"]},
                {"key": "compare", "label": "midpoint comparison", "patterns": [r"\btarget\b", r"\bcompare\b", r"\btoo small\b", r"\btoo large\b", r"\bnums\[mid\]"]},
                {"key": "update", "label": "bound update", "patterns": [r"\bleft\s*=\s*mid", r"\bright\s*=\s*mid", r"\bdiscard\b.+\bhalf\b", r"\bmove left bound\b", r"\bmove right bound\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bnot found\b"]},
            ],
            ["bounds", "loop", "mid", "compare", "update", "return"],
        ),
        "dynamic-programming": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "state", "label": "state definition", "patterns": [r"\bdp\b", r"\bstate array\b", r"\bstate means\b", r"\bsubproblem\b"]},
                {"key": "base", "label": "base case", "patterns": [r"\bbase case\b", r"\bdp\[0\]", r"\banchor\b", r"\binitialize first\b"]},
                {"key": "loop", "label": "fill order", "patterns": [r"\bfor\b", r"\biterate\b", r"\bfill the table\b", r"\bmove through the states\b"]},
                {"key": "transition", "label": "transition update", "patterns": [r"\btransition\b", r"\bdp\[", r"\bfrom earlier state\b", r"\brecurrence\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bfinal state\b", r"\blast dp\b", r"\banswer\b"]},
            ],
            ["state", "base", "loop", "transition", "return"],
        ),
        "dp": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "state", "label": "state definition", "patterns": [r"\bdp\b", r"\bstate array\b", r"\bstate means\b", r"\bsubproblem\b"]},
                {"key": "base", "label": "base case", "patterns": [r"\bbase case\b", r"\bdp\[0\]", r"\banchor\b", r"\binitialize first\b"]},
                {"key": "loop", "label": "fill order", "patterns": [r"\bfor\b", r"\biterate\b", r"\bfill the table\b", r"\bmove through the states\b"]},
                {"key": "transition", "label": "transition update", "patterns": [r"\btransition\b", r"\bdp\[", r"\bfrom earlier state\b", r"\brecurrence\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bfinal state\b", r"\blast dp\b", r"\banswer\b"]},
            ],
            ["state", "base", "loop", "transition", "return"],
        ),
        "graph-traversal": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "frontier", "label": "frontier or visited setup", "patterns": [r"\bvisited\b", r"\bqueue\b", r"\bstack\b", r"\bfrontier\b"]},
                {"key": "loop", "label": "traversal loop", "patterns": [r"\bwhile queue\b", r"\bwhile stack\b", r"\bdfs\b", r"\bbfs\b", r"\bpop\b", r"\bpopleft\b"]},
                {"key": "guard", "label": "skip or visited rule", "patterns": [r"\bif\b.+\bvisited\b", r"\bskip\b", r"\balready seen\b"]},
                {"key": "neighbors", "label": "neighbor update", "patterns": [r"\bneighbor\b", r"\bnei\b", r"\benqueue\b", r"\bappend\b", r"\bexplore\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
            ],
            ["frontier", "loop", "guard", "neighbors", "return"],
        ),
        "dfs-bfs": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "frontier", "label": "frontier or visited setup", "patterns": [r"\bvisited\b", r"\bqueue\b", r"\bstack\b", r"\bfrontier\b"]},
                {"key": "loop", "label": "traversal loop", "patterns": [r"\bwhile queue\b", r"\bwhile stack\b", r"\bdfs\b", r"\bbfs\b", r"\bpop\b", r"\bpopleft\b"]},
                {"key": "guard", "label": "skip or visited rule", "patterns": [r"\bif\b.+\bvisited\b", r"\bskip\b", r"\balready seen\b"]},
                {"key": "neighbors", "label": "neighbor update", "patterns": [r"\bneighbor\b", r"\bnei\b", r"\benqueue\b", r"\bappend\b", r"\bexplore\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
            ],
            ["frontier", "loop", "guard", "neighbors", "return"],
        ),
        "backtracking": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "choice", "label": "choice iteration", "patterns": [r"\bfor choice\b", r"\bfor each choice\b", r"\biterate choices\b"]},
                {"key": "choose", "label": "choose step", "patterns": [r"\bappend\b", r"\badd choice\b", r"\bmake the choice\b"]},
                {"key": "recurse", "label": "recursive exploration", "patterns": [r"\bbacktrack\b", r"\bdfs\b", r"\brecurse\b"]},
                {"key": "undo", "label": "undo step", "patterns": [r"\bpop\b", r"\bremove last\b", r"\bundo\b"]},
                {"key": "return", "label": "base case or return path", "patterns": [r"\breturn\b", r"\bbase case\b", r"\banswer\b"]},
            ],
            ["choice", "choose", "recurse", "undo"],
        ),
        "heap": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "heap", "label": "heap setup", "patterns": [r"\bheap\b", r"\bheappush\b", r"\bpriority queue\b"]},
                {"key": "loop", "label": "item traversal", "patterns": [r"\bfor\b", r"\biterate\b", r"\bprocess each\b"]},
                {"key": "push", "label": "push step", "patterns": [r"\bheappush\b", r"\bpush\b.+\bheap\b", r"\badd to the heap\b"]},
                {"key": "prune", "label": "heap prune or pop", "patterns": [r"\bheappop\b", r"\bpop\b.+\bheap\b", r"\bif len\(heap\)\b", r"\bevict\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\btop of heap\b", r"\banswer\b"]},
            ],
            ["heap", "loop", "push", "prune", "return"],
        ),
        "union-find": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "parent", "label": "parent setup", "patterns": [r"\bparent\b", r"\brank\b", r"\bsize\b", r"\broot\b"]},
                {"key": "find", "label": "find step", "patterns": [r"\bfind\b", r"\bpath compression\b"]},
                {"key": "union", "label": "union step", "patterns": [r"\bunion\b", r"\bconnect roots\b", r"\bmerge sets\b"]},
                {"key": "loop", "label": "edge or item traversal", "patterns": [r"\bfor edge\b", r"\bfor each edge\b", r"\biterate edges\b", r"\bfor\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bcomponent\b"]},
            ],
            ["parent", "find", "union", "loop", "return"],
        ),
        "intervals": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "sort", "label": "sorted interval order", "patterns": [r"\bsort\b", r"\bsorted\b", r"\border by start\b"]},
                {"key": "current", "label": "current interval state", "patterns": [r"\bcurrent\b", r"\bstart\b", r"\bend\b"]},
                {"key": "compare", "label": "overlap test", "patterns": [r"\boverlap\b", r"\bintersect\b", r"\bif\b.+\bstart\b"]},
                {"key": "merge", "label": "merge or append step", "patterns": [r"\bmerge\b", r"\bappend\b", r"\bstart a new interval\b", r"\bextend\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bresult\b", r"\bmerged\b"]},
            ],
            ["sort", "current", "compare", "merge", "return"],
        ),
        "prefix-sums": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "prefix", "label": "prefix state setup", "patterns": [r"\bprefix\b", r"\brunning sum\b", r"\bcount map\b", r"\bhash map\b"]},
                {"key": "loop", "label": "item traversal", "patterns": [r"\bfor\b", r"\biterate\b", r"\bprocess each\b"]},
                {"key": "query", "label": "query before update", "patterns": [r"\bcheck\b.+\bprefix\b", r"\bquery\b", r"\bprefix - target\b", r"\bbefore updating\b"]},
                {"key": "update", "label": "prefix update", "patterns": [r"\bprefix\s*\+?=", r"\bupdate map\b", r"\brecord current prefix\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
            ],
            ["prefix", "loop", "query", "update", "return"],
        ),
        "monotonic-stack": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "stack", "label": "stack setup", "patterns": [r"\bstack\b", r"\bmonotonic\b"]},
                {"key": "loop", "label": "item traversal", "patterns": [r"\bfor\b", r"\biterate\b", r"\bscan\b"]},
                {"key": "resolve", "label": "resolve while invariant breaks", "patterns": [r"\bwhile\b.+\bstack\b", r"\bpop\b", r"\bbreaks the invariant\b"]},
                {"key": "push", "label": "push current item", "patterns": [r"\bappend\b", r"\bpush\b", r"\bstack\.append\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
            ],
            ["stack", "loop", "resolve", "push", "return"],
        ),
        "stack": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "stack", "label": "stack setup", "patterns": [r"\bstack\b"]},
                {"key": "loop", "label": "item traversal", "patterns": [r"\bfor\b", r"\bwhile\b", r"\bprocess\b"]},
                {"key": "update", "label": "push or pop step", "patterns": [r"\bappend\b", r"\bpush\b", r"\bpop\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bresult\b", r"\banswer\b"]},
            ],
            ["stack", "loop", "update", "return"],
        ),
    }
    return profiles.get(pattern_tag, (generic_steps, generic_critical))


def _template_dimension_groups(skill_tags: list[str]) -> list[dict[str, Any]]:
    pattern_tag = _primary_pattern_tag(skill_tags)
    groups: dict[str, list[dict[str, Any]]] = {
        "sliding-window": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["state"], "weight": 0.18},
            {"key": "control_flow", "label": "Control flow", "steps": ["expand", "repair", "shrink"], "weight": 0.30},
            {"key": "invariant_logic", "label": "Invariant logic", "steps": ["repair", "shrink"], "weight": 0.24},
            {"key": "answer_update", "label": "Answer update", "steps": ["score"], "weight": 0.16},
        ],
        "two-pointers": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["pointers"], "weight": 0.2},
            {"key": "control_flow", "label": "Control flow", "steps": ["loop", "move"], "weight": 0.26},
            {"key": "invariant_logic", "label": "Invariant logic", "steps": ["compare", "move"], "weight": 0.26},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
        "binary-search": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["bounds", "mid"], "weight": 0.2},
            {"key": "control_flow", "label": "Control flow", "steps": ["loop", "update"], "weight": 0.24},
            {"key": "invariant_logic", "label": "Invariant logic", "steps": ["compare", "update"], "weight": 0.28},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
        "dynamic-programming": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["state", "base"], "weight": 0.26},
            {"key": "control_flow", "label": "Control flow", "steps": ["loop"], "weight": 0.18},
            {"key": "invariant_logic", "label": "Invariant logic", "steps": ["transition"], "weight": 0.28},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
        "dp": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["state", "base"], "weight": 0.26},
            {"key": "control_flow", "label": "Control flow", "steps": ["loop"], "weight": 0.18},
            {"key": "invariant_logic", "label": "Invariant logic", "steps": ["transition"], "weight": 0.28},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
    }
    return groups.get(
        pattern_tag,
        [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.16},
            {"key": "state_management", "label": "State management", "steps": ["state"], "weight": 0.22},
            {"key": "control_flow", "label": "Control flow", "steps": ["flow"], "weight": 0.24},
            {"key": "invariant_logic", "label": "Invariant logic", "steps": ["update"], "weight": 0.22},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
    )


def _extract_template_signature_params(text: str) -> list[str]:
    match = re.search(r"\b(?:def|define|function)\s+[a-z_][a-z0-9_]*\s*\(([^)]*)\)", text, re.IGNORECASE)
    if not match:
        return []
    raw_params = match.group(1).strip()
    if not raw_params:
        return []
    params: list[str] = []
    for chunk in raw_params.split(","):
        normalized = re.sub(r"[^a-z0-9_]", "", chunk.lower())
        if normalized:
            params.append(normalized)
    return params


def _template_contract_drift(expected_answer: str, user_answer: str, tuning: dict[str, Any]) -> dict[str, Any]:
    expected_params = _extract_template_signature_params(expected_answer)
    actual_params = _extract_template_signature_params(user_answer)
    if not expected_params or not actual_params:
        return {
            "expectedParams": expected_params,
            "actualParams": actual_params,
            "missingParams": [],
            "extraParams": [],
            "penalty": 0.0,
        }

    missing_params = [param for param in expected_params if param not in actual_params]
    extra_params = [param for param in actual_params if param not in expected_params]
    penalty = 0.0
    strictness = str(tuning.get("contractStrictness", "light"))

    if missing_params:
        penalty += {"light": 6.0, "balanced": 10.0, "strict": 15.0}.get(strictness, 6.0)
    if extra_params and not tuning.get("allowExtraParameters", True):
        penalty += {"light": 4.0, "balanced": 8.0, "strict": 12.0}.get(strictness, 4.0)
    elif extra_params:
        penalty += {"light": 1.5, "balanced": 4.0, "strict": 7.0}.get(strictness, 1.5)

    return {
        "expectedParams": expected_params,
        "actualParams": actual_params,
        "missingParams": missing_params,
        "extraParams": extra_params,
        "penalty": penalty,
    }


def _template_step_order_score(steps: list[dict[str, Any]], matched_positions: dict[str, int]) -> float:
    ordered_keys = [str(step["key"]) for step in steps if str(step["key"]) in matched_positions]
    if len(ordered_keys) <= 1:
        return 100.0 if ordered_keys else 0.0
    in_order_pairs = 0
    total_pairs = 0
    for left_index, left_key in enumerate(ordered_keys):
        for right_key in ordered_keys[left_index + 1 :]:
            total_pairs += 1
            if matched_positions[left_key] < matched_positions[right_key]:
                in_order_pairs += 1
    if total_pairs == 0:
        return 100.0
    return round((in_order_pairs / total_pairs) * 100, 1)


def _template_grading_threshold(tuning: dict[str, Any], template_mode: str) -> float:
    grading_mode = str(tuning.get("gradingMode", "core-logic"))
    base = {"core-logic": 68.0, "balanced": 76.0, "strict": 86.0}.get(grading_mode, 68.0)
    if template_mode == TemplateMode.invariant.value:
        base += 4.0
    return base


def _analyze_template_attempt(
    user_answer: str,
    skill_tags: list[str],
    template_mode: str,
    submission_tuning: dict[str, Any] | None = None,
    expected_answer: str = "",
) -> dict[str, Any]:
    normalized_text = _normalized_template_text(user_answer)
    steps, critical_keys = _template_progress_profile(skill_tags)
    tuning = _merged_submission_tuning(submission_tuning)

    matched_labels: list[str] = []
    missing_labels: list[str] = []
    missing_keys: list[str] = []
    matched_keys: list[str] = []
    matched_positions: dict[str, int] = {}
    for step in steps:
        key = str(step["key"])
        label = str(step["label"])
        patterns = [str(pattern) for pattern in step["patterns"]]
        if _has_any_pattern(normalized_text, patterns):
            matched_keys.append(key)
            matched_labels.append(label)
            positions = [match.start() for pattern in patterns for match in re.finditer(pattern, normalized_text, re.IGNORECASE)]
            if positions:
                matched_positions[key] = min(positions)
        else:
            missing_keys.append(key)
            missing_labels.append(label)

    total_steps = max(len(steps), 1)
    step_coverage = round((len(matched_keys) / total_steps) * 100, 1)
    critical_coverage = round(
        (sum(1 for key in critical_keys if key in matched_keys) / max(len(critical_keys), 1)) * 100,
        1,
    )
    order_score = _template_step_order_score(steps, matched_positions)

    dimension_scores: list[dict[str, Any]] = []
    weighted_dimension_total = 0.0
    weighted_dimension_count = 0.0
    for group in _template_dimension_groups(skill_tags):
        group_steps = [step for step in group["steps"] if isinstance(step, str)]
        if not group_steps:
            continue
        matched_count = sum(1 for step in group_steps if step in matched_keys)
        score = round((matched_count / len(group_steps)) * 100, 1)
        weight = float(group.get("weight", 0))
        dimension_scores.append({
            "key": str(group["key"]),
            "label": str(group["label"]),
            "score": score,
            "matched": matched_count,
            "total": len(group_steps),
        })
        weighted_dimension_total += score * weight
        weighted_dimension_count += weight

    dimension_average = round(
        weighted_dimension_total / weighted_dimension_count if weighted_dimension_count else step_coverage,
        1,
    )
    contract = _template_contract_drift(expected_answer, user_answer, tuning)
    if tuning.get("rewardEquivalentPhrasing", True):
        raw_accuracy = (dimension_average * 0.8) + (order_score * 0.1) + (step_coverage * 0.1)
    else:
        raw_accuracy = (step_coverage * 0.65) + (critical_coverage * 0.25) + (order_score * 0.1)
    accuracy = max(0.0, round(raw_accuracy - contract["penalty"], 1))

    dimension_by_key = {item["key"]: float(item["score"]) for item in dimension_scores}
    core_logic_score = round(
        (
            (dimension_by_key.get("state_management", step_coverage) * 0.25)
            + (dimension_by_key.get("control_flow", step_coverage) * 0.35)
            + (dimension_by_key.get("invariant_logic", step_coverage) * 0.25)
            + (dimension_by_key.get("answer_update", step_coverage) * 0.15)
        ),
        1,
    )

    answer_step_met = dimension_by_key.get("answer_update", 100.0) >= 50.0
    critical_met = critical_coverage >= 75.0
    threshold = _template_grading_threshold(tuning, template_mode)
    if not tuning.get("rewardEquivalentPhrasing", True):
        threshold += 4.0
    sound = bool(normalized_text) and critical_met and core_logic_score >= threshold
    if tuning.get("requireAnswerStep", True):
        sound = sound and answer_step_met
    syntax_valid = bool(user_answer.strip())
    if template_mode == TemplateMode.invariant.value and re.search(r"^\s*def\b", user_answer, re.MULTILINE):
        syntax_valid = not _has_syntax_error(user_answer)

    return {
        "accuracy": accuracy,
        "sound": sound,
        "syntaxValid": syntax_valid,
        "matchedLabels": matched_labels,
        "missingLabels": missing_labels,
        "matchedKeys": matched_keys,
        "missingKeys": missing_keys,
        "stepCoverage": step_coverage,
        "criticalCoverage": critical_coverage,
        "coreLogicScore": core_logic_score,
        "orderScore": order_score,
        "dimensions": dimension_scores,
        "contract": contract,
        "tuning": tuning,
    }



async def _load_attempt_history(body: CoachAttemptFeedbackRequest) -> list[dict[str, Any]]:
    return await _load_practice_history(body.cardId, body.questionType, body.skillTags, limit=20)


def _parse_json_field(value: Any, default_value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return default_value
        return parsed if isinstance(parsed, type(default_value)) else default_value
    return default_value


async def _load_practice_history(
    card_id: str, question_type: str, skill_tags: list[str], limit: int = 20
) -> list[dict[str, Any]]:
    pool = get_pool()

    async with pool.acquire() as conn:
        if question_type:
            rows = await conn.fetch(
                """
                SELECT
                    sa.id AS "attemptId",
                    COALESCE(sa.interaction_id, '') AS "interactionId",
                    sa.card_id AS "cardId",
                    sa.card_title AS "cardTitle",
                    sa.question,
                    sa.correct_answer AS "correctAnswer",
                    sa.user_answer AS "userAnswer",
                    sa.accuracy,
                    sa.exact,
                    sa.elapsed_ms AS "elapsedMs",
                    sa.template_mode AS "templateMode",
                    sa.support_layer AS "supportLayer",
                    sa.live_coach_used AS "liveCoachUsed",
                    sa.category_tags AS "categoryTags",
                    sa.generated_card AS "generatedCard",
                    sa.coach_feedback AS "submissionFeedback",
                    sa.submission_rubric AS "submissionRubric",
                    sa.created_at,
                    COALESCE(live.live_feedback_count, 0) AS "liveFeedbackCount",
                    latest.feedback AS "latestLiveFeedback"
                FROM score_attempts sa
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS live_feedback_count
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                ) live ON TRUE
                LEFT JOIN LATERAL (
                    SELECT fe.feedback
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                    ORDER BY fe.created_at DESC
                    LIMIT 1
                ) latest ON TRUE
                WHERE sa.mode = 'main-recall'
                  AND sa.question_type = $2
                  AND (sa.card_id = $1 OR sa.generated_card_id = $1 OR sa.category_tags && $3::text[])
                ORDER BY sa.created_at DESC
                LIMIT $4
                """,
                card_id,
                question_type,
                skill_tags,
                limit,
            )
        elif skill_tags:
            rows = await conn.fetch(
                """
                SELECT
                    sa.id AS "attemptId",
                    COALESCE(sa.interaction_id, '') AS "interactionId",
                    sa.card_id AS "cardId",
                    sa.card_title AS "cardTitle",
                    sa.question,
                    sa.correct_answer AS "correctAnswer",
                    sa.user_answer AS "userAnswer",
                    sa.accuracy,
                    sa.exact,
                    sa.elapsed_ms AS "elapsedMs",
                    sa.template_mode AS "templateMode",
                    sa.support_layer AS "supportLayer",
                    sa.live_coach_used AS "liveCoachUsed",
                    sa.category_tags AS "categoryTags",
                    sa.generated_card AS "generatedCard",
                    sa.coach_feedback AS "submissionFeedback",
                    sa.submission_rubric AS "submissionRubric",
                    sa.created_at,
                    COALESCE(live.live_feedback_count, 0) AS "liveFeedbackCount",
                    latest.feedback AS "latestLiveFeedback"
                FROM score_attempts sa
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS live_feedback_count
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                ) live ON TRUE
                LEFT JOIN LATERAL (
                    SELECT fe.feedback
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                    ORDER BY fe.created_at DESC
                    LIMIT 1
                ) latest ON TRUE
                WHERE sa.mode = 'main-recall'
                  AND (sa.card_id = $1 OR sa.generated_card_id = $1 OR sa.category_tags && $2::text[])
                ORDER BY sa.created_at DESC
                LIMIT $3
                """,
                card_id,
                skill_tags,
                limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT
                    sa.id AS "attemptId",
                    COALESCE(sa.interaction_id, '') AS "interactionId",
                    sa.card_id AS "cardId",
                    sa.card_title AS "cardTitle",
                    sa.question,
                    sa.correct_answer AS "correctAnswer",
                    sa.user_answer AS "userAnswer",
                    sa.accuracy,
                    sa.exact,
                    sa.elapsed_ms AS "elapsedMs",
                    sa.template_mode AS "templateMode",
                    sa.support_layer AS "supportLayer",
                    sa.live_coach_used AS "liveCoachUsed",
                    sa.category_tags AS "categoryTags",
                    sa.generated_card AS "generatedCard",
                    sa.coach_feedback AS "submissionFeedback",
                    sa.submission_rubric AS "submissionRubric",
                    sa.created_at,
                    COALESCE(live.live_feedback_count, 0) AS "liveFeedbackCount",
                    latest.feedback AS "latestLiveFeedback"
                FROM score_attempts sa
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS live_feedback_count
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                ) live ON TRUE
                LEFT JOIN LATERAL (
                    SELECT fe.feedback
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                    ORDER BY fe.created_at DESC
                    LIMIT 1
                ) latest ON TRUE
                WHERE sa.mode = 'main-recall'
                  AND (sa.card_id = $1 OR sa.generated_card_id = $1)
                ORDER BY sa.created_at DESC
                LIMIT $2
                """,
                card_id,
                limit,
            )

    history: list[dict[str, Any]] = []
    for row in rows:
        history.append({
            "attemptId": int(row["attemptId"]),
            "interactionId": str(row["interactionId"] or ""),
            "cardId": row["cardId"],
            "cardTitle": row["cardTitle"],
            "question": row["question"] or "",
            "correctAnswer": row["correctAnswer"] or "",
            "userAnswer": row["userAnswer"] or "",
            "accuracy": float(row["accuracy"] or 0),
            "exact": bool(row["exact"]),
            "elapsedMs": int(row["elapsedMs"] or 0),
            "templateMode": str(row["templateMode"] or TemplateMode.algorithm.value),
            "supportLayer": str(row["supportLayer"] or "none"),
            "liveCoachUsed": bool(row["liveCoachUsed"]),
            "categoryTags": list(row["categoryTags"] or []),
            "generatedCard": _parse_json_field(row["generatedCard"], {}),
            "liveFeedbackCount": int(row["liveFeedbackCount"] or 0),
            "latestLiveFeedback": _parse_json_field(row["latestLiveFeedback"], {}),
            "submissionFeedback": _parse_json_field(row["submissionFeedback"], {}),
            "submissionRubric": compact_submission_rubric(row["submissionRubric"]),
            "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
        })
    return history


def _summarize_attempt_history(history: list[dict[str, Any]]) -> dict[str, Any]:
    template_mode_summaries = {
        mode: {
            **summarize_readiness([item for item in history if str(item.get("templateMode", "")) == mode]),
            "dimensionSummary": summarize_submission_rubrics([
                item for item in history if str(item.get("templateMode", "")) == mode
            ]),
        }
        for mode in READINESS_MODE_ORDER
    }
    readiness_summary = summarize_readiness(history)
    dimension_summary = summarize_submission_rubrics(history)
    if not history:
        return {
            "attemptCount": 0,
            "recentAvgAccuracy": 0,
            "weakestTag": "",
            "repeatedErrorTags": [],
            "recentPrimaryFocuses": [],
            "recentQuestions": [],
            "readiness": readiness_summary["readiness"],
            "daysSinceLastSubmit": readiness_summary["daysSinceLastSubmit"],
            "stale": readiness_summary["stale"],
            "dimensionSummary": dimension_summary,
            "templateModes": template_mode_summaries,
        }

    accuracies = [float(item.get("accuracy", 0)) for item in history]
    tag_scores: dict[str, list[float]] = {}
    error_counts: Counter[str] = Counter()
    primary_focuses: list[str] = []
    recent_questions: list[str] = []
    for item in history:
        for tag in item.get("categoryTags", []):
            tag_scores.setdefault(tag, []).append(float(item.get("accuracy", 0)))
        feedback = item.get("submissionFeedback", {})
        for tag in feedback.get("errorTags", []) if isinstance(feedback, dict) else []:
            error_counts[str(tag)] += 1
        if isinstance(feedback, dict) and feedback.get("primaryFocus"):
            primary_focuses.append(str(feedback["primaryFocus"]))
        if item.get("question"):
            recent_questions.append(str(item["question"]))

    weakest_tag = ""
    weakest_avg = 101.0
    for tag, values in tag_scores.items():
        if not values:
            continue
        avg = sum(values) / len(values)
        if avg < weakest_avg:
            weakest_avg = avg
            weakest_tag = tag

    return {
        "attemptCount": len(history),
        "recentAvgAccuracy": round(sum(accuracies) / len(accuracies), 1),
        "weakestTag": weakest_tag,
        "repeatedErrorTags": [tag for tag, count in error_counts.most_common(3) if count >= 2],
        "recentPrimaryFocuses": primary_focuses[:3],
        "recentQuestions": recent_questions[:3],
        "readiness": readiness_summary["readiness"],
        "daysSinceLastSubmit": readiness_summary["daysSinceLastSubmit"],
        "stale": readiness_summary["stale"],
        "dimensionSummary": dimension_summary,
        "templateModes": template_mode_summaries,
    }


def _summarize_skill_map_progress(
    skill_map: list[Any], history: list[dict[str, Any]]
) -> dict[str, Any]:
    progress_by_pattern: dict[str, dict[str, Any]] = {}

    for node in skill_map:
        slug = _pattern_slug(getattr(node, "pattern", ""))
        if not slug:
            continue
        progress_by_pattern[slug] = {
            "pattern": getattr(node, "pattern", slug),
            "attemptCount": 0,
            "avgAccuracy": 0.0,
            "readiness": 0.0,
            "exactRate": 0.0,
            "repeatedErrorTags": [],
            "latestPrimaryFocus": "",
            "latestQuestion": "",
            "stale": False,
            "dimensionSummary": {},
        }

    accuracy_buckets: dict[str, list[float]] = {slug: [] for slug in progress_by_pattern}
    exact_counts: Counter[str] = Counter()
    error_counts: dict[str, Counter[str]] = {slug: Counter() for slug in progress_by_pattern}

    for item in history:
        item_tags = {str(tag) for tag in item.get("categoryTags", [])}
        feedback = item.get("submissionFeedback", {})
        for slug, summary in progress_by_pattern.items():
            if slug not in item_tags:
                continue
            summary["attemptCount"] += 1
            accuracy_buckets[slug].append(float(item.get("accuracy", 0)))
            if item.get("exact"):
                exact_counts[slug] += 1
            for tag in feedback.get("errorTags", []) if isinstance(feedback, dict) else []:
                error_counts[slug][str(tag)] += 1
            if not summary["latestPrimaryFocus"] and isinstance(feedback, dict):
                summary["latestPrimaryFocus"] = str(feedback.get("primaryFocus", "")).strip()
            if not summary["latestQuestion"]:
                summary["latestQuestion"] = str(item.get("question", "")).strip()

    weak_patterns: list[str] = []
    for slug, summary in progress_by_pattern.items():
        accuracies = accuracy_buckets[slug]
        attempts = int(summary["attemptCount"])
        pattern_history = [item for item in history if slug in {str(tag) for tag in item.get("categoryTags", [])}]
        readiness_summary = summarize_readiness(pattern_history)
        if accuracies:
            summary["avgAccuracy"] = round(sum(accuracies) / len(accuracies), 1)
            summary["exactRate"] = round((exact_counts[slug] / len(accuracies)) * 100, 1)
        summary["repeatedErrorTags"] = [tag for tag, count in error_counts[slug].most_common(3) if count >= 2]
        summary["readiness"] = readiness_summary["readiness"]
        summary["stale"] = readiness_summary["stale"]
        summary["dimensionSummary"] = summarize_submission_rubrics(pattern_history)
        if attempts > 0 and float(summary["avgAccuracy"]) < 90:
            weak_patterns.append(slug)

    overall_attempts = len(history)
    overall_avg_accuracy = round(
        sum(float(item.get("accuracy", 0)) for item in history) / overall_attempts, 1
    ) if overall_attempts else 0.0

    return {
        "overall": {
            "attemptCount": overall_attempts,
            "avgAccuracy": overall_avg_accuracy,
            "weakPatterns": weak_patterns[:5],
            "readiness": summarize_readiness(history)["readiness"],
            "dimensionSummary": summarize_submission_rubrics(history),
        },
        "patterns": progress_by_pattern,
    }


def _progress_focus_note(progress: dict[str, Any]) -> str:
    if not progress or int(progress.get("attemptCount", 0)) == 0:
        return ""
    repeated = [str(tag) for tag in progress.get("repeatedErrorTags", []) if str(tag).strip()]
    if repeated:
        return f"Recent weak spot: {', '.join(repeated[:2])}."
    latest_focus = str(progress.get("latestPrimaryFocus", "")).strip()
    if latest_focus:
        return latest_focus
    return ""


async def _persist_feedback_event(
    body: CoachAttemptFeedbackRequest, feedback: dict[str, Any]
) -> None:
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO coach_feedback_events
                (interaction_id, card_id, generated_card_id, question_type, feedback_stage, live_mode,
                 prompt, expected_answer, user_answer, accuracy, exact, elapsed_ms, skill_tags,
                 previous_attempts, live_milestones, feedback, llm_used, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
            """,
            body.interactionId,
            body.cardId,
            body.cardId,
            body.questionType,
            "live" if body.liveMode else "submission",
            body.liveMode,
            body.prompt,
            body.expectedAnswer,
            body.userAnswer,
            body.accuracy,
            body.exact,
            body.elapsedMs,
            body.skillTags,
            json.dumps(body.previousAttempts),
            json.dumps(body.liveMilestones),
            json.dumps(feedback),
            bool(feedback.get("llmUsed")),
            now,
        )


def _primary_pattern_tag(skill_tags: list[str]) -> str:
    for tag in (
        "sliding-window",
        "two-pointers",
        "binary-search",
        "dfs-bfs",
        "graph-traversal",
        "backtracking",
        "heap",
        "union-find",
        "dynamic-programming",
        "dp",
        "intervals",
        "prefix-sums",
        "monotonic-stack",
        "stack",
    ):
        if tag in skill_tags:
            return tag
    return ""


def _pattern_display_name(skill_tags: list[str]) -> str:
    pattern_tag = _primary_pattern_tag(skill_tags)
    return {
        "sliding-window": "sliding window",
        "two-pointers": "two pointers",
        "binary-search": "binary search",
        "dfs-bfs": "DFS/BFS",
        "graph-traversal": "graph traversal",
        "backtracking": "backtracking",
        "heap": "heap",
        "union-find": "union find",
        "dynamic-programming": "dynamic programming",
        "dp": "dynamic programming",
        "intervals": "intervals",
        "prefix-sums": "prefix sums",
        "monotonic-stack": "monotonic stack",
        "stack": "stack",
    }.get(pattern_tag, "algorithm")


def _algorithmic_template_label(skill_tags: list[str], template_mode: str) -> str:
    pattern_name = _pattern_display_name(skill_tags)
    if pattern_name == "algorithm":
        return {
            TemplateMode.pseudo.value: "algorithm pseudocode",
            TemplateMode.invariant.value: "algorithm invariant",
            TemplateMode.algorithm.value: "algorithm template",
        }.get(template_mode, "algorithm template")
    return {
        TemplateMode.pseudo.value: f"{pattern_name} pseudocode",
        TemplateMode.invariant.value: f"{pattern_name} invariant",
        TemplateMode.algorithm.value: f"{pattern_name} template",
    }.get(template_mode, f"{pattern_name} template")


def _pattern_slug(pattern: str) -> str:
    import re
    return re.sub(
        r"\s+",
        "-",
        pattern.lower()
        .replace("/", " ")
        .replace("&", " ")
        .replace("-", " ")
        .strip(),
    )


def _clean_concise_prompt(value: str, max_chars: int = 80) -> str:
    prompt = re.sub(r"\s+", " ", str(value or "").strip())
    if len(prompt) <= max_chars:
        return prompt
    shortened = prompt[:max_chars].rsplit(" ", 1)[0].strip()
    return f"{shortened}..."


def _entry_point_from_template_target(template_mode: str, target: str) -> str:
    lines = str(target or "").replace("\r\n", "\n").split("\n")
    first_line = next((line.strip() for line in lines if line.strip()), "")
    if template_mode == TemplateMode.pseudo.value:
        match = re.match(r"define\s+(.+)$", first_line, flags=re.IGNORECASE)
        return re.sub(r":\s*$", "", match.group(1)).strip() if match else ""

    match = re.match(r"def\s+([A-Za-z_]\w*)\s*\(([^)]*)\):", first_line)
    return f"{match.group(1)}({match.group(2)})" if match else ""


def _template_prompt_from_target(pattern: str, template_mode: str, target: str) -> str:
    mode_label = {
        TemplateMode.pseudo.value: "Pseudo",
        TemplateMode.invariant.value: "Invariant",
        TemplateMode.algorithm.value: "Algorithm",
    }.get(template_mode, "Recall")
    entry_point = _entry_point_from_template_target(template_mode, target)
    if entry_point:
        return f"{mode_label}: recall {entry_point}."
    return f"{mode_label}: recall {pattern.lower()}."


def _template_targets_for_drill(
    body: SkillMapDrillsRequest,
    pattern_slug: str,
    solution: str,
    missing: str,
    raw_template_targets: Any = None,
) -> dict[str, str]:
    request_targets = body.templateTargets.get(pattern_slug, {})
    targets = {
        mode: str(target)
        for mode, target in request_targets.items()
        if mode in TEMPLATE_MODE_ORDER and str(target).strip()
    }
    if isinstance(raw_template_targets, dict):
        for mode, target in raw_template_targets.items():
            if mode in TEMPLATE_MODE_ORDER and str(target).strip():
                targets[mode] = str(target).replace("\r\n", "\n").strip()
    algorithm_target = str(solution or "").replace("{{missing}}", str(missing or "")).strip()
    if algorithm_target:
        targets[TemplateMode.algorithm.value] = algorithm_target
    return targets


def _template_prompt_map(
    body: SkillMapDrillsRequest,
    pattern: str,
    pattern_slug: str,
    solution: str,
    missing: str,
    raw_template_prompts: Any = None,
    template_targets: dict[str, str] | None = None,
) -> dict[str, str]:
    targets = template_targets or _template_targets_for_drill(body, pattern_slug, solution, missing)
    raw_prompts = raw_template_prompts if isinstance(raw_template_prompts, dict) else {}
    prompts: dict[str, str] = {}

    for mode in TEMPLATE_MODE_ORDER:
        raw_prompt = _clean_concise_prompt(str(raw_prompts.get(mode, "")).strip())
        if raw_prompt:
            prompts[mode] = raw_prompt
            continue
        target = targets.get(mode, "")
        if target:
            prompts[mode] = _template_prompt_from_target(pattern, mode, target)

    return prompts


ADAPTIVE_VARIATION_STRATEGIES = {
    "contract": "preserve the function signature and named inputs before changing logic",
    "pattern": "make the reusable algorithm shape unmistakable",
    "state": "force the state variables to be named and initialized",
    "control_flow": "make the loop and branch structure carry the algorithm",
    "invariant": "state the decision rule that keeps the answer inside the search space",
    "state_updates": "pressure the exact movement/update that changes state",
    "ordering": "keep setup, decision, update, and return in cause-and-effect order",
    "answer_path": "force explicit answer recording and return behavior",
    "edge_cases": "include the smallest boundary behavior",
    "recall_fidelity": "repeat the same core shape with fewer places to hide vague wording",
    "executability": "keep the scaffold syntactically concrete enough to run",
}


def _adaptive_primary_failure(rubric: dict[str, Any]) -> dict[str, Any]:
    primary = rubric.get("primaryFailure") if isinstance(rubric.get("primaryFailure"), dict) else {}
    primary_key = str(primary.get("key", "")).strip()
    if primary_key and primary_key != "sound":
        return {
            "key": primary_key,
            "label": str(primary.get("label", "") or SUBMISSION_DIMENSION_LABELS.get(primary_key, primary_key.replace("_", " ").title())),
        }

    weakest: dict[str, Any] = {}
    dimensions = rubric.get("dimensions") if isinstance(rubric.get("dimensions"), dict) else {}
    modifiers = rubric.get("modifiers") if isinstance(rubric.get("modifiers"), dict) else {}
    for key, dimension in {**dimensions, **modifiers}.items():
        if not isinstance(dimension, dict):
            continue
        try:
            score = float(dimension.get("score", 100) or 100)
        except (TypeError, ValueError):
            score = 100.0
        if not weakest or score < float(weakest.get("score", 100)):
            weakest = {
                "key": str(dimension.get("key") or key),
                "label": str(dimension.get("label") or SUBMISSION_DIMENSION_LABELS.get(str(key), str(key).replace("_", " ").title())),
                "score": score,
            }

    if weakest:
        return weakest
    return {"key": "pattern", "label": SUBMISSION_DIMENSION_LABELS["pattern"]}


def _score_from_signal(signal: dict[str, Any]) -> float:
    if "score" in signal:
        try:
            return round(float(signal.get("score", 0) or 0), 1)
        except (TypeError, ValueError):
            return 0.0
    if "valid" in signal:
        return 100.0 if bool(signal.get("valid")) else 0.0
    return 0.0


def _status_from_score(score: float) -> str:
    if score >= 80:
        return "pass"
    if score >= 45:
        return "partial"
    return "fail"


def _submission_rubric_from_assessment(
    body: CoachAttemptFeedbackRequest,
    assessment: dict[str, Any],
) -> dict[str, Any]:
    raw_signals = assessment.get("signals") if isinstance(assessment.get("signals"), dict) else {}
    dimensions: dict[str, dict[str, Any]] = {}
    modifiers: dict[str, dict[str, Any]] = {}

    for key, raw_signal in raw_signals.items():
        if not isinstance(raw_signal, dict):
            continue
        score = _score_from_signal(raw_signal)
        label = SUBMISSION_DIMENSION_LABELS.get(str(key), str(key).replace("_", " ").title())
        dimension = {
            "key": str(key),
            "label": label,
            "status": _status_from_score(score),
            "score": score,
            "evidence": [str(raw_signal.get("note", "")).strip()] if str(raw_signal.get("note", "")).strip() else [],
            "missing": [],
        }
        if str(key) in {"syntax", "completionTime"}:
            modifiers[str(key)] = dimension
        else:
            dimensions[str(key)] = dimension

    verdict = str(assessment.get("verdict", "")).strip() or ("sound" if body.exact else "needs-work")
    blocker_key = str(assessment.get("blockerKey", "")).strip()
    if verdict == "sound" or not blocker_key:
        primary_failure = {
            "key": "sound",
            "label": "Sound recall",
            "severity": "minor",
            "evidence": [str(item) for item in assessment.get("strengths", [])[:2] if str(item).strip()]
            if isinstance(assessment.get("strengths"), list)
            else [],
        }
    else:
        primary_failure = {
            "key": blocker_key,
            "label": SUBMISSION_DIMENSION_LABELS.get(blocker_key, blocker_key.replace("_", " ").title()),
            "severity": "blocking" if verdict == "needs-work" else "major",
            "evidence": [str(assessment.get("primaryBlocker", "")).strip()]
            if str(assessment.get("primaryBlocker", "")).strip()
            else [],
        }

    dimension_scores = [
        float(item.get("score", 0) or 0)
        for item in [*dimensions.values(), *modifiers.values()]
        if item.get("status") != "not_applicable"
    ]
    overall = round(sum(dimension_scores) / len(dimension_scores), 1) if dimension_scores else round(float(body.accuracy or 0), 1)

    return {
        "verdict": verdict,
        "score": {
            "overall": overall,
            "conceptual": overall,
            "fidelity": dimensions.get("patternFidelity", {}).get("score", overall),
            "executable": modifiers.get("syntax", {}).get("score", 100.0),
            "fluency": modifiers.get("completionTime", {}).get("score", 0.0),
        },
        "primaryFailure": primary_failure,
        "dimensions": dimensions,
        "modifiers": modifiers,
        "recommendedAction": str(assessment.get("primaryBlocker", "")).strip(),
    }


async def _adaptive_variation_with_llm(body: AdaptiveVariationRequest) -> dict[str, Any]:
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_missing_api_key",
            message="Update backend .env with at least one coach LLM API key.",
            provider=provider,
            api_error_code="provider_auth_error",
        )

    template_mode = _template_mode_value(body.templateMode)
    primary_failure = _adaptive_primary_failure(body.submissionRubric if isinstance(body.submissionRubric, dict) else {})
    failure_key = str(primary_failure.get("key", "pattern"))
    failure_label = str(primary_failure.get("label", SUBMISSION_DIMENSION_LABELS.get(failure_key, "Core pattern")))
    pattern_name = _pattern_display_name(body.skillTags) or "algorithm"
    system_prompt = (
        "Generate one adaptive recall variation for a coding interview trainer. "
        "Return strict JSON with keys prompt, specimen, hint, title, variationReason. "
        "The specimen is the exact next target the user should recall. "
        "Keep the same algorithm family, but vary the specimen to pressure the targetDimension. "
        "For pseudo mode, specimen must be concise pseudocode. For invariant or full mode, specimen must be Python. "
        "Prompt must be 12 words or fewer. Do not include markdown. Do not include '{{missing}}'."
    )
    llm_payload = {
        "pattern": pattern_name,
        "templateMode": template_mode,
        "targetDimension": {"key": failure_key, "label": failure_label},
        "strategy": ADAPTIVE_VARIATION_STRATEGIES.get(failure_key, ADAPTIVE_VARIATION_STRATEGIES["pattern"]),
        "previousPrompt": body.prompt,
        "previousTarget": body.expectedAnswer,
        "userAnswer": body.userAnswer,
        "submissionRubric": body.submissionRubric,
    }
    llm_response = await asyncio.to_thread(_call_llm_json, system_prompt, llm_payload, provider)
    if not isinstance(llm_response, dict):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_no_response",
            message=f"Adaptive variation cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_empty_response",
        )

    specimen = str(llm_response.get("specimen", "")).replace("\r\n", "\n").replace("{{missing}}", "").strip()
    if not specimen:
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_invalid_response",
            message=f"Adaptive variation cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    prompt = _clean_concise_prompt(str(llm_response.get("prompt", "")).strip())
    title = str(llm_response.get("title", "")).strip()
    hint = str(llm_response.get("hint", "")).strip()
    reason = str(llm_response.get("variationReason", "")).strip()
    if not all([prompt, title, hint, reason]):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_invalid_response",
            message=f"Adaptive variation cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    target_dimension_tag = f"adaptive-{_pattern_slug(failure_key)}"
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    tags = [str(tag) for tag in body.skillTags if str(tag).strip()]
    for tag in ("skill-map", "adaptive-variation", target_dimension_tag):
        if tag not in tags:
            tags.append(tag)

    drill = {
        "id": f"adaptive-{_pattern_slug(pattern_name)}-{_pattern_slug(failure_key)}-{stamp}",
        "title": title,
        "difficulty": "Med.",
        "prompt": prompt,
        "templatePrompts": {template_mode: prompt},
        "templateTargets": {template_mode: specimen, TemplateMode.algorithm.value: specimen},
        "solution": f"{specimen}\n{{{{missing}}}}",
        "missing": "# repair complete",
        "hint": hint,
        "tags": tags,
    }
    return {
        "drill": drill,
        "targetDimension": failure_key,
        "variationReason": reason,
        "llmUsed": True,
    }


def _normalize_llm_provider(value: str) -> str:
    normalized = value.strip().lower()
    if not normalized:
        return ""
    if normalized in {"claude", "anthropic"}:
        return "claude"
    if normalized in {"openai", "chatgpt", "gpt"}:
        return "openai"
    if normalized in {"gemma", "gemma4", "google"}:
        return "gemma"
    return ""


def _resolve_llm_provider(requested_provider: str) -> str:
    requested = _normalize_llm_provider(str(requested_provider or ""))
    configured = _normalize_llm_provider(str(settings.coach_llm_provider or ""))
    return requested or configured or "openai"


def _preferred_provider_chain(requested_provider: str) -> list[str]:
    requested = _normalize_llm_provider(str(requested_provider or ""))
    configured = _normalize_llm_provider(str(settings.coach_llm_provider or ""))
    chain = [requested, configured, "gemma", "claude", "openai"]
    ordered: list[str] = []
    for provider in chain:
        if provider and provider not in ordered:
            ordered.append(provider)
    return ordered


def _resolve_available_llm_provider(requested_provider: str) -> str:
    for candidate in _preferred_provider_chain(requested_provider):
        if _llm_provider_available(candidate):
            return candidate
    return _resolve_llm_provider(requested_provider)


def _llm_provider_available(provider: str) -> bool:
    if provider == "claude":
        return bool(settings.coach_anthropic_api_key)
    if provider == "gemma":
        return bool(settings.coach_gemma_api_key)
    return bool(settings.coach_openai_api_key)


def _extract_json_dict(value: str) -> dict[str, Any] | None:
    text = value.strip()

    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)
    except ValueError:
        decoder = json.JSONDecoder()
        for match in re.finditer(r"\{", text):
            try:
                parsed, _ = decoder.raw_decode(text[match.start() :])
                if isinstance(parsed, dict):
                    return parsed
            except ValueError:
                continue
        return None
    return parsed if isinstance(parsed, dict) else None


def _call_openai_json(
    system_prompt: str,
    user_payload: dict[str, Any],
    max_tokens: int = 1800,
    timeout_seconds: int = 30,
    temperature: float = 0.2,
) -> dict[str, Any] | None:
    if not settings.coach_openai_api_key:
        return None

    url = f"{settings.coach_openai_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.coach_openai_model,
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload)},
        ],
    }

    def post_completion(request_body: dict[str, Any]) -> dict[str, Any]:
        data = json.dumps(request_body).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={
                "Authorization": f"Bearer {settings.coach_openai_api_key}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)

    try:
        payload = post_completion(body)
        content = payload["choices"][0]["message"]["content"]
        return _extract_json_dict(content)
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        if (
            error.code == 400
            and "max_completion_tokens" in details
            and "unsupported" in details.lower()
        ):
            fallback_body = {**body}
            fallback_body.pop("max_completion_tokens", None)
            fallback_body["max_tokens"] = max_tokens
            try:
                payload = post_completion(fallback_body)
                content = payload["choices"][0]["message"]["content"]
                return _extract_json_dict(content)
            except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as fallback_error:
                logger.warning("OpenAI fallback request failed: %s", fallback_error)
                return None
        logger.warning("OpenAI request failed (%s): %s", error.code, details[:400])
        return None
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as error:
        logger.warning("OpenAI request failed: %s", error)
        return None


def _call_claude_json(system_prompt: str, user_payload: dict[str, Any], max_tokens: int = 1800) -> dict[str, Any] | None:
    if not settings.coach_anthropic_api_key:
        return None

    url = f"{settings.coach_anthropic_base_url.rstrip('/')}/messages"
    configured_model = str(settings.coach_anthropic_model or "").strip()
    candidate_models: list[str] = []
    for model in (configured_model, *ANTHROPIC_MODEL_CANDIDATES):
        if model and model not in candidate_models:
            candidate_models.append(model)

    for model in candidate_models:
        body = {
            "model": model,
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "system": f"{system_prompt}\nReturn only valid JSON. Do not include markdown.",
            "messages": [
                {"role": "user", "content": json.dumps(user_payload)},
            ],
        }
        data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={
                "x-api-key": settings.coach_anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read().decode("utf-8")
                payload = json.loads(raw)
                content = payload.get("content", [])
                if not isinstance(content, list):
                    logger.warning("Anthropic response content was not a list for model '%s'.", model)
                    return None
                text_parts: list[str] = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        text_parts.append(str(item.get("text", "")))
                if not text_parts:
                    logger.warning("Anthropic response had no text blocks for model '%s'.", model)
                    return None
                parsed = _extract_json_dict("\n".join(text_parts))
                if parsed is None:
                    logger.warning("Anthropic response did not contain parseable JSON for model '%s'.", model)
                return parsed
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            model_not_found = error.code in {400, 404} and "model" in details.lower()
            if model_not_found:
                logger.warning("Anthropic model '%s' unavailable (%s). Trying next configured model.", model, error.code)
                continue
            logger.warning("Anthropic request failed (%s): %s", error.code, details[:400])
            return None
        except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as error:
            logger.warning("Anthropic request failed for model '%s': %s", model, error)
            return None

    logger.warning("No usable Anthropic model found from configured candidates.")
    return None


def _call_gemma_json(system_prompt: str, user_payload: dict[str, Any], max_tokens: int = 1800) -> dict[str, Any] | None:
    if not settings.coach_gemma_api_key:
        return None

    model = str(settings.coach_gemma_model or "").strip() or "gemma-4-31b-it"
    url = f"{settings.coach_gemma_base_url.rstrip('/')}/models/{model}:generateContent?key={settings.coach_gemma_api_key}"
    prompt = f"{system_prompt}\nReturn only valid JSON. Do not include markdown.\n\n{json.dumps(user_payload)}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": max_tokens, "responseMimeType": "application/json"},
    }
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            candidates = payload.get("candidates", [])
            if candidates and isinstance(candidates, list):
                parts = candidates[0].get("content", {}).get("parts", [])
                text_parts = [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("text")]
                if text_parts:
                    return _extract_json_dict("\n".join(text_parts))
            return None
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as error:
        logger.warning("Gemma request failed: %s", error)
        return None


def _call_llm_json(
    system_prompt: str,
    user_payload: dict[str, Any],
    provider: str,
    max_tokens: int = 1800,
    timeout_seconds: int = 30,
    temperature: float = 0.2,
) -> dict[str, Any] | None:
    if provider == "claude":
        return _call_claude_json(system_prompt, user_payload, max_tokens)
    if provider == "gemma":
        return _call_gemma_json(system_prompt, user_payload, max_tokens)
    return _call_openai_json(system_prompt, user_payload, max_tokens, timeout_seconds, temperature)


# ---------------------------------------------------------------------------
# Streaming helpers for SSE drill generation
# ---------------------------------------------------------------------------


class _DrillStreamParser:
    """Incrementally extract complete JSON objects from a streaming ``{"drills": [...]}`` response."""

    __slots__ = ("_buf", "_in_str", "_esc", "_top", "_arr", "_obj", "_obj_start", "drills")

    def __init__(self) -> None:
        self._buf: list[str] = []
        self._in_str = False
        self._esc = False
        self._top = 0
        self._arr = False
        self._obj = 0
        self._obj_start = -1
        self.drills: list[dict[str, Any]] = []

    def feed(self, chunk: str) -> list[dict[str, Any]]:
        """Feed a chunk of streaming text. Returns newly completed drill dicts."""
        new: list[dict[str, Any]] = []
        for ch in chunk:
            self._buf.append(ch)
            pos = len(self._buf) - 1
            if self._esc:
                self._esc = False
                continue
            if self._in_str:
                if ch == "\\":
                    self._esc = True
                elif ch == '"':
                    self._in_str = False
                continue
            if ch == '"':
                self._in_str = True
                continue
            if self._arr:
                if ch == "{":
                    if self._obj == 0:
                        self._obj_start = pos
                    self._obj += 1
                elif ch == "}":
                    self._obj -= 1
                    if self._obj == 0 and self._obj_start >= 0:
                        item_str = "".join(self._buf[self._obj_start : pos + 1])
                        self._obj_start = -1
                        try:
                            obj = json.loads(item_str)
                            if isinstance(obj, dict):
                                new.append(obj)
                                self.drills.append(obj)
                        except (json.JSONDecodeError, ValueError):
                            pass
                elif ch == "]" and self._obj == 0:
                    self._arr = False
            else:
                if ch == "{":
                    self._top += 1
                elif ch == "}":
                    self._top = max(0, self._top - 1)
                elif ch == "[" and self._top == 1:
                    self._arr = True
        return new


def _call_openai_streaming(
    system_prompt: str,
    user_payload: dict[str, Any],
    max_tokens: int = 1800,
    timeout_seconds: int = 90,
    temperature: float = 0.7,
) -> Generator[str, None, None]:
    """Yield content-delta strings from the OpenAI streaming API."""
    if not settings.coach_openai_api_key:
        return
    url = f"{settings.coach_openai_base_url.rstrip('/')}/chat/completions"
    body: dict[str, Any] = {
        "model": settings.coach_openai_model,
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "stream": True,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload)},
        ],
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.coach_openai_api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8").strip()
            if not line or not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
                delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                if delta:
                    yield delta
            except (json.JSONDecodeError, KeyError, IndexError):
                continue


def _process_raw_drill(
    raw: Any,
    index: int,
    body: SkillMapDrillsRequest,
    generation_skill_map: list[Any],
) -> dict[str, Any] | None:
    """Validate and process a single raw drill from LLM output. Returns None if invalid."""
    if not isinstance(raw, dict):
        return None
    solution = str(raw.get("solution", "")).strip()
    missing = str(raw.get("missing", "")).strip()
    if "{{missing}}" not in solution or not missing:
        return None
    tags_raw = raw.get("tags", [])
    tags = [str(tag).strip() for tag in tags_raw if str(tag).strip()] if isinstance(tags_raw, list) else []
    if "skill-map" not in tags:
        tags = ["skill-map", *tags]
    source_node = generation_skill_map[index] if index < len(generation_skill_map) else None
    pattern = source_node.pattern if source_node else str(raw.get("title", "algorithm"))
    pattern_slug = _pattern_slug(pattern)
    if pattern_slug and pattern_slug not in tags:
        tags.append(pattern_slug)
    template_targets = _template_targets_for_drill(body, pattern_slug, solution, missing, raw.get("templateTargets", {}))
    template_prompts = _template_prompt_map(body, pattern, pattern_slug, solution, missing, raw.get("templatePrompts", {}), template_targets)
    selected_prompt = (
        template_prompts.get(_template_mode_value(body.templateMode))
        or _clean_concise_prompt(str(raw.get("prompt", "")).strip())
        or _template_prompt_from_target(pattern, _template_mode_value(body.templateMode), solution.replace("{{missing}}", missing))
    )
    return {
        "id": str(raw.get("id", f"skill-map-{index + 1}")),
        "title": str(raw.get("title", f"Skill Map Card {index + 1}")),
        "difficulty": _normalize_drill_difficulty(raw.get("difficulty", "Med.")),
        "prompt": selected_prompt,
        "templatePrompts": template_prompts,
        "templateTargets": template_targets,
        "solution": solution,
        "missing": missing,
        "hint": str(raw.get("hint", "")).strip(),
        "tags": tags,
    }


# ---------------------------------------------------------------------------
# Signal Assessor — Role 1
# Lightweight structural analysis call using the request-selected provider.
# Used as the ONLY LLM call for live feedback, and as Stage 1 for submission
# feedback (feeds the Narrator).
# ---------------------------------------------------------------------------

def _assessor_system_prompt(live_mode: bool) -> str:
    signals_spec = (
        "signals: {"
        "structure: {score: 0-100, note: str}, "
        "correctness: {score: 0-100, note: str}, "
        "completeness: {score: 0-100, note: str}, "
        "patternFidelity: {score: 0-100, note: str}, "
        "syntax: {valid: bool, error: str|null}, "
        "completionTime: {score: 0-100, note: str}"
        "}"
    )
    base = (
        "You are a coding pattern analyst. Analyze the provided answer against the expected answer. "
        f"Return strict JSON: {{v: 1, patternIdentified: str, {signals_spec}, "
        "structuralElements: {hasSignature: bool, hasLoop: bool, hasShrinkStep: bool, hasScoreUpdate: bool, hasGuard: bool}, "
        "primaryBlocker: str, blockerKey: str, verdict: 'sound'|'close'|'needs-work', "
        "errorTags: str[], strengths: str[]"
    )
    if live_mode:
        return (
            base
            + ", diagnosis: str, primaryFocus: str, immediateCorrection: str, "
            "affirmation: str, nextMove: str, why: str, keepInMind: str, "
            "microDrill: str, nextRepTarget: str}. "
            "All narrative string fields must be 20 words or fewer. "
            "Focus on one structural blocker only. "
            "Leave affirmation empty unless something concrete is already correct. "
            "Return only valid JSON. Do not include markdown."
        )
    return base + "}. Structural assessment only — no narrative fields. Return only valid JSON. Do not include markdown."


async def _run_signal_assessor(
    body: CoachAttemptFeedbackRequest,
    template_mode: str,
) -> dict[str, Any]:
    """Call the Signal Assessor LLM selected by the request.

    Returns a structured assessment dict. LLM availability and valid signal
    output are required for the coach pipeline to proceed.
    """
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise SubmissionFeedbackUnavailableError(
            code="signal_assessor_missing_api_key",
            message="Update backend .env with at least one coach LLM API key.",
            provider=provider,
            api_error_code="provider_auth_error",
        )

    system_prompt = _assessor_system_prompt(body.liveMode)
    payload = {
        "skillTags":           body.skillTags,
        "templateMode":        template_mode,
        "userAnswer":          (body.userAnswer or "")[:800],
        "expectedAnswer":      (body.expectedAnswer or "")[:800],
        "elapsedMs":           body.elapsedMs,
        "precomputedAccuracy": body.accuracy,
    }

    result = await asyncio.to_thread(_call_llm_json, system_prompt, payload, provider, ASSESSOR_MAX_TOKENS)

    if not isinstance(result, dict):
        logger.warning("Signal assessor returned non-dict response from provider '%s'.", provider)
        raise SubmissionFeedbackUnavailableError(
            code="signal_assessor_no_response",
            message=f"Signal assessment cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_empty_response",
        )

    required_keys = {"v", "patternIdentified", "signals", "primaryBlocker", "blockerKey", "verdict", "errorTags", "strengths"}
    if body.liveMode:
        required_keys |= {"diagnosis", "primaryFocus", "immediateCorrection", "nextMove", "why", "microDrill", "nextRepTarget"}
    missing = required_keys - result.keys()
    if missing or not isinstance(result.get("signals"), dict):
        logger.warning("Signal assessor response missing keys %s from provider '%s'.", missing, provider)
        raise SubmissionFeedbackUnavailableError(
            code="signal_assessor_invalid_response",
            message=f"Signal assessment cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    result["llmUsed"] = True
    return result


def _assessment_to_live_response(assessment: dict[str, Any]) -> dict[str, Any]:
    """Map an Assessor result to the CoachAttemptFeedbackResponse shape for live mode."""
    strengths = [str(s) for s in assessment.get("strengths", [])[:3]]
    primary_blocker = str(assessment.get("primaryBlocker", ""))
    blocker_key = str(assessment.get("blockerKey", "primary gap"))
    return {
        "diagnosis":           str(assessment.get("diagnosis", primary_blocker)),
        "primaryFocus":        str(assessment.get("primaryFocus", f"Fix {blocker_key}.")),
        "immediateCorrection": str(assessment.get("immediateCorrection", primary_blocker)),
        "affirmation":         str(assessment.get("affirmation", strengths[0] if strengths else "")),
        "nextMove":            str(assessment.get("nextMove", primary_blocker)),
        "why":                 str(assessment.get("why", "")),
        "keepInMind":          str(assessment.get("keepInMind", "")),
        "microDrill":          str(assessment.get("microDrill", "")),
        "nextRepTarget":       str(assessment.get("nextRepTarget", "")),
        "strengths":           strengths,
        "errorTags":           [str(t) for t in assessment.get("errorTags", [])[:6]],
        "fullFeedback":        "",
        "correctedVersion":    "",
        "llmUsed":             bool(assessment.get("llmUsed", True)),
    }


# ---------------------------------------------------------------------------
# Feedback Narrator — Role 2 (submission only)
# Higher-quality narrative coaching text. Uses the user's preferred provider.
# Receives a clean Assessor output instead of raw signals.
# ---------------------------------------------------------------------------

def _narrator_submission_system_prompt(template_label: str, body: CoachAttemptFeedbackRequest) -> str:
    tuning = _merged_submission_tuning(body.submissionTuning)
    grading_mode = str(tuning.get("gradingMode", "core-logic"))
    grading_instruction = {
        "core-logic": "Focus on whether the core algorithmic logic is sound.",
        "strict":     "Grade strictly — every structural detail matters.",
        "lenient":    "Focus on intent and overall correctness; minor gaps are acceptable.",
    }.get(grading_mode, "Focus on whether the core algorithmic logic is sound.")

    return (
        f"You are a senior interview coach reviewing a {template_label} solution. "
        "Grade the submission in exactly one sentence in fullFeedback — lead with 'sound', 'close', or 'needs work'. "
        f"{grading_instruction} "
        "Base your diagnosis on the provided assessment signals. "
        "Use correctedVersion only for meaningful structural corrections, never line-by-line rewrites. "
        "Return strict JSON: diagnosis, primaryFocus, immediateCorrection, fullFeedback, correctedVersion, "
        "microDrill, nextRepTarget, strengths (max 3), errorTags. "
        "No markdown fences, no bullet prefixes."
    )


def _build_narrator_payload(
    body: CoachAttemptFeedbackRequest,
    assessment: dict[str, Any],
    history: list[dict[str, Any]],
    history_summary: dict[str, Any],
    reveal_expected_answer: bool,
) -> dict[str, Any]:
    return {
        "card": {"id": body.cardId, "title": body.cardTitle},
        "attempt": {
            "accuracy":       body.accuracy,
            "exact":          body.exact,
            "elapsedMs":      body.elapsedMs,
            "expectedAnswer": (body.expectedAnswer or "")[:1200] if reveal_expected_answer else "",
            "userAnswer":     (body.userAnswer or "")[:1200],
        },
        "assessment": {
            "patternIdentified": assessment.get("patternIdentified", ""),
            "signals":           assessment.get("signals", {}),
            "primaryBlocker":    assessment.get("primaryBlocker", ""),
            "blockerKey":        assessment.get("blockerKey", ""),
            "verdict":           assessment.get("verdict", "needs-work"),
            "errorTags":         assessment.get("errorTags", []),
            "strengths":         assessment.get("strengths", []),
        },
        "skillTags": body.skillTags,
        "historicalAttempts": [
            {
                "accuracy":     item.get("accuracy", 0),
                "exact":        item.get("exact", False),
                "templateMode": item.get("templateMode", TemplateMode.algorithm.value),
                "errorTags":    item.get("submissionFeedback", {}).get("errorTags", []) if isinstance(item.get("submissionFeedback"), dict) else [],
                "primaryFocus": item.get("submissionFeedback", {}).get("primaryFocus", "") if isinstance(item.get("submissionFeedback"), dict) else "",
                "createdAt":    item.get("createdAt", ""),
            }
            for item in history[:8]
        ],
        "submissionTuning": _merged_submission_tuning(body.submissionTuning),
    }


async def _attempt_feedback_with_narrator(
    body: CoachAttemptFeedbackRequest,
    assessment: dict[str, Any],
    history: list[dict[str, Any]],
    history_summary: dict[str, Any],
) -> dict[str, Any]:
    """Submission-only Narrator path. Calls LLM with the Assessor output as structured context."""
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise SubmissionFeedbackUnavailableError(
            code="submission_feedback_missing_api_key",
            message="Update backend .env with your API key.",
            provider=provider,
        )

    template_mode = _template_mode_value(body.templateMode)
    submission_template_label = _algorithmic_template_label(body.skillTags, template_mode)
    reveal_expected_answer = True  # always reveal on submission

    system_prompt = _narrator_submission_system_prompt(submission_template_label, body)
    llm_payload = _build_narrator_payload(body, assessment, history, history_summary, reveal_expected_answer)

    llm_response: dict[str, Any] | None = None
    last_error_code = ""
    last_error_message = ""

    for attempt in range(1, SUBMISSION_LLM_MAX_RETRIES + 1):
        llm_response, error_code, error_message, retryable = await asyncio.to_thread(
            _call_llm_json_for_submission,
            system_prompt,
            llm_payload,
            provider,
        )
        has_content = isinstance(llm_response, dict) and any(
            key in llm_response and str(llm_response.get(key, "")).strip()
            for key in ("fullFeedback", "diagnosis", "primaryFocus", "immediateCorrection")
        )
        if has_content:
            break

        last_error_code = error_code
        last_error_message = error_message
        logger.warning(
            "Submission feedback LLM attempt %s/%s failed for provider '%s'.",
            attempt, SUBMISSION_LLM_MAX_RETRIES, provider,
        )
        if attempt < SUBMISSION_LLM_MAX_RETRIES and retryable:
            await asyncio.sleep(SUBMISSION_LLM_RETRY_DELAYS_SECONDS[attempt - 1])
        elif attempt < SUBMISSION_LLM_MAX_RETRIES and not retryable:
            break

    if not isinstance(llm_response, dict) or not any(
        key in llm_response and str(llm_response.get(key, "")).strip()
        for key in ("fullFeedback", "diagnosis", "primaryFocus", "immediateCorrection")
    ):
        raise SubmissionFeedbackUnavailableError(
            code="submission_feedback_no_response",
            message=last_error_message or f"Feedback cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code=last_error_code,
        )

    corrected_version = str(llm_response.get("correctedVersion", "")).strip()
    corrected_version = corrected_version.removeprefix("```python").removeprefix("```").removesuffix("```").strip()

    return {
        "diagnosis":           str(llm_response.get("diagnosis", assessment.get("primaryBlocker", ""))),
        "primaryFocus":        str(llm_response.get("primaryFocus", f"Fix {assessment.get('blockerKey', 'the primary miss')}.")),
        "immediateCorrection": str(llm_response.get("immediateCorrection", "")),
        "keepInMind":          str(llm_response.get("keepInMind", "")),
        "affirmation":         str(llm_response.get("affirmation", "")),
        "nextMove":            str(llm_response.get("nextMove", "")),
        "why":                 str(llm_response.get("why", "")),
        "microDrill":          str(llm_response.get("microDrill", "")),
        "nextRepTarget":       str(llm_response.get("nextRepTarget", "")),
        "strengths":           [str(x) for x in llm_response.get("strengths", assessment.get("strengths", []))][:3],
        "errorTags":           [str(x) for x in llm_response.get("errorTags", assessment.get("errorTags", []))][:6],
        "fullFeedback":        str(llm_response.get("fullFeedback", "")),
        "correctedVersion":    corrected_version,
        "llmUsed":             True,
    }


async def _session_plan_with_llm(body: CoachSessionPlanRequest) -> dict[str, Any]:
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_missing_api_key",
            message="Update backend .env with at least one coach LLM API key.",
            provider=provider,
            api_error_code="provider_auth_error",
        )

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
    }

    llm_response = await asyncio.to_thread(_call_llm_json, system_prompt, llm_payload, provider)
    if not llm_response:
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_no_response",
            message=f"Session plan cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_empty_response",
        )

    required = ["headline", "focusTheme", "warmup", "mainSet", "cooldown", "note"]
    if any(key not in llm_response for key in required):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_invalid_response",
            message=f"Session plan cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    return {
        "headline": str(llm_response["headline"]),
        "focusTheme": str(llm_response["focusTheme"]),
        "warmup": str(llm_response["warmup"]),
        "mainSet": str(llm_response["mainSet"]),
        "cooldown": str(llm_response["cooldown"]),
        "note": str(llm_response["note"]),
        "llmUsed": True,
    }


def _normalize_drill_difficulty(value: Any) -> str:
    difficulty = str(value or "").strip().lower().rstrip(".")
    if difficulty in {"easy", "e", "beginner", "simple"}:
        return "Easy"
    if difficulty in {"hard", "h", "advanced", "difficult"}:
        return "Hard"
    return "Med."


async def _load_skill_map_generation_summary(body: SkillMapDrillsRequest) -> dict[str, Any]:
    pattern_tags = [_pattern_slug(node.pattern) for node in body.skillMap[: body.count] if _pattern_slug(node.pattern)]
    history = await _load_practice_history("", body.questionType, pattern_tags, limit=max(20, body.count * 6))
    return _summarize_skill_map_progress(body.skillMap[: body.count], history)


async def _skill_map_drills_with_llm(
    body: SkillMapDrillsRequest, progress_summary: dict[str, Any]
) -> dict[str, Any]:
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_missing_api_key",
            message="Update backend .env with at least one coach LLM API key.",
            provider=provider,
            api_error_code="provider_auth_error",
        )

    system_prompt = (
        "You generate focused Python practice cards for coding interview preparation. "
        "Return only a top-level JSON object shaped exactly like {\"drills\": [...]}. "
        "The drills array must contain exactly the requested count of objects with keys "
        "id, title, difficulty, prompt, templatePrompts, templateTargets, solution, missing, hint, tags. "
        "Do not return a single drill object without the drills wrapper. "
        "Generate exactly one drill for each skillMap entry, in the same order as the skillMap array. "
        "Do not generate a second drill for any pattern until every provided skillMap entry has one drill. "
        "Each drill must teach one reusable LeetCode move from the provided skill map, not a story problem. "
        "Use the generationSeed and shuffled method order to vary titles, snippets, missing lines, and selected methods across calls. "
        "Make them concise and pattern-first. Prioritize patterns with low readiness or high error rates, "
        "then fill remaining slots across remaining patterns. "
        "The solution must include exactly one '{{missing}}' placeholder, and missing must be the exact code that replaces it. "
        "The prompt must be very short: 12 words or fewer. "
        "templateTargets may include pseudo and invariant. Pseudo must be concise pseudocode. Invariant must be a Python scaffold. "
        "When you return templateTargets, make them specific to the drill's pattern and method instead of generic pattern text. "
        "templatePrompts must be an object keyed by pseudo, invariant, and full when those targets are provided. "
        "Each templatePrompts value must be 12 words or fewer and must describe the exact provided template target, not a legacy or story prompt. "
        "Keep snippets short enough to memorize, but realistic enough to reuse in senior-level interviews. "
        "Tags must include 'skill-map' and a slug for the pattern."
    )

    rng = random.SystemRandom()
    generation_seed = f"{datetime.now(tz=timezone.utc).strftime('%Y%m%d%H%M%S%f')}-{rng.randrange(1_000_000)}"
    generation_skill_map = list(body.skillMap[: body.count])
    rng.shuffle(generation_skill_map)

    # Trim skill map nodes to just pattern + shuffled methods — no extra serialization overhead
    trimmed_skill_map = [
        {"pattern": node.pattern, "methods": rng.sample(list(node.methods), len(node.methods)) if node.methods else []}
        for node in generation_skill_map
    ]

    # Only send patterns that have been attempted or have low readiness — skip untouched zero-data entries
    pattern_progress = {
        slug: data
        for slug, data in progress_summary.get("patterns", {}).items()
        if data.get("attemptCount", 0) > 0 or data.get("readiness", 100) < 90
    }

    llm_payload = {
        "questionType": body.questionType,
        "count": body.count,
        "generationSeed": generation_seed,
        "templateMode": _template_mode_value(body.templateMode),
        "templateTargets": body.templateTargets,
        "skillMap": trimmed_skill_map,
        "practiceHistory": {
            "overall": progress_summary.get("overall", {}),
            "patterns": pattern_progress,
        },
        "schema": {
            "fields": [
                "id",
                "title",
                "difficulty",
                "prompt",
                "templatePrompts",
                "templateTargets",
                "solution",
                "missing",
                "hint",
                "tags",
            ],
            "constraint": "solution must contain exactly one {{missing}} placeholder",
            "coverage": "drills[i] must correspond to skillMap[i]",
            "variation": "avoid reusing the same title, prompt, missing line, or exact snippet shape from a previous generation",
        },
    }

    llm_response = await asyncio.to_thread(
        _call_llm_json,
        system_prompt,
        llm_payload,
        provider,
        DRILL_GEN_MAX_TOKENS,
        DRILL_GEN_OPENAI_TIMEOUT_SECONDS,
        DRILL_GEN_TEMPERATURE,
    )
    if not llm_response or not isinstance(llm_response.get("drills"), list):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_no_response",
            message=f"Skill-map practice cards cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_empty_response",
        )

    drills: list[dict[str, Any]] = []
    for index, raw in enumerate(llm_response["drills"][: body.count]):
        if not isinstance(raw, dict):
            raise SubmissionFeedbackUnavailableError(
                code="coach_llm_invalid_response",
                message=f"Skill-map practice cards cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
                provider=provider,
                api_error_code="provider_invalid_json",
            )
        solution = str(raw.get("solution", "")).strip()
        missing = str(raw.get("missing", "")).strip()
        if "{{missing}}" not in solution or not missing:
            raise SubmissionFeedbackUnavailableError(
                code="coach_llm_invalid_response",
                message=f"Skill-map practice cards cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
                provider=provider,
                api_error_code="provider_invalid_json",
            )
        tags_raw = raw.get("tags", [])
        tags = [str(tag).strip() for tag in tags_raw if str(tag).strip()] if isinstance(tags_raw, list) else []
        if "skill-map" not in tags:
            tags = ["skill-map", *tags]
        source_node = generation_skill_map[index] if index < len(generation_skill_map) else None
        pattern = source_node.pattern if source_node else str(raw.get("title", "algorithm"))
        pattern_slug = _pattern_slug(pattern)
        if pattern_slug and pattern_slug not in tags:
            tags.append(pattern_slug)
        template_targets = _template_targets_for_drill(body, pattern_slug, solution, missing, raw.get("templateTargets", {}))
        template_prompts = _template_prompt_map(
            body,
            pattern,
            pattern_slug,
            solution,
            missing,
            raw.get("templatePrompts", {}),
            template_targets,
        )
        selected_prompt = (
            template_prompts.get(_template_mode_value(body.templateMode))
            or _clean_concise_prompt(str(raw.get("prompt", "")).strip())
            or _template_prompt_from_target(pattern, _template_mode_value(body.templateMode), solution.replace("{{missing}}", missing))
        )
        drills.append({
            "id": str(raw.get("id", f"skill-map-{index + 1}")),
            "title": str(raw.get("title", f"Skill Map Card {index + 1}")),
            "difficulty": _normalize_drill_difficulty(raw.get("difficulty", "Med.")),
            "prompt": selected_prompt,
            "templatePrompts": template_prompts,
            "templateTargets": template_targets,
            "solution": solution,
            "missing": missing,
            "hint": str(raw.get("hint", "")).strip(),
            "tags": tags,
        })

    if len(drills) != min(body.count, len(generation_skill_map)):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_invalid_response",
            message=f"Skill-map practice cards cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    return {"drills": drills, "llmUsed": True}


def _stamp_skill_map_drills(drills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    stamped: list[dict[str, Any]] = []
    for index, drill in enumerate(drills):
        tags = [str(tag) for tag in drill.get("tags", [])]
        if "skill-map" not in tags:
            tags = ["skill-map", *tags]
        stamped.append({
            **drill,
            "id": f"skill-map-{stamp}-{index + 1}",
            "tags": tags,
        })
    return stamped


async def _persist_skill_map_drills(
    drills: list[dict[str, Any]], llm_used: bool, progress_summary: dict[str, Any]
) -> None:
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        for drill in drills:
            tags = [str(tag) for tag in drill.get("tags", []) if str(tag).strip()]
            pattern_slug = next((tag for tag in tags if tag != "skill-map"), "")
            generation_context = {
                "llmUsed": llm_used,
                "historySummary": progress_summary.get("overall", {}),
                "patternProgress": progress_summary.get("patterns", {}).get(pattern_slug, {}),
            }
            await conn.execute(
                """
                INSERT INTO generated_skill_map_cards
                    (id, question_type, title, difficulty, prompt, solution, missing, hint, tags,
                     llm_used, generation_context, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT (id) DO NOTHING
                """,
                drill["id"],
                "skill-map",
                drill["title"],
                drill["difficulty"],
                drill["prompt"],
                drill["solution"],
                drill["missing"],
                drill["hint"],
                drill["tags"],
                llm_used,
                json.dumps(generation_context),
                now,
            )


@router.post("/evaluate-attempt", response_model=CoachAttemptEvaluationResponse)
async def coach_attempt_evaluation(body: CoachAttemptEvaluationRequest):
    return _evaluate_attempt_by_template_mode(
        body.expectedAnswer,
        body.userAnswer,
        body.skillTags,
        _template_mode_value(body.templateMode),
        body.submissionTuning,
    )


@router.post("/attempt-feedback", response_model=CoachAttemptFeedbackResponse)
async def coach_attempt_feedback(body: CoachAttemptFeedbackRequest):
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise HTTPException(
            status_code=503,
            detail=_submission_feedback_error_detail(
                "coach_llm_missing_api_key",
                "Update backend .env with at least one coach LLM API key.",
                provider,
                "provider_auth_error",
            ),
        )

    template_mode = _template_mode_value(body.templateMode)
    history = await _load_attempt_history(body)
    history_summary = _summarize_attempt_history(history)
    try:
        assessment = await _run_signal_assessor(body, template_mode)
    except SubmissionFeedbackUnavailableError as error:
        raise _coach_llm_http_exception(error) from error

    if body.liveMode:
        feedback = _assessment_to_live_response(assessment)
    else:
        try:
            feedback = await _attempt_feedback_with_narrator(body, assessment, history, history_summary)
        except SubmissionFeedbackUnavailableError as error:
            raise _coach_llm_http_exception(error) from error

        if not bool(feedback.get("llmUsed")):
            raise HTTPException(
                status_code=503,
                detail=_submission_feedback_error_detail(
                    "submission_feedback_no_response",
                    f"Feedback cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
                    provider,
                    "provider_empty_response",
                ),
            )

    if not body.liveMode:
        feedback["submissionRubric"] = _submission_rubric_from_assessment(body, assessment)
    feedback["llmProvider"] = provider if bool(feedback.get("llmUsed")) else ""
    await _persist_feedback_event(body, feedback)
    feedback.pop("signals", None)
    return feedback


@router.post("/session-plan", response_model=CoachSessionPlanResponse)
async def coach_session_plan(body: CoachSessionPlanRequest):
    try:
        return await _session_plan_with_llm(body)
    except SubmissionFeedbackUnavailableError as error:
        raise _coach_llm_http_exception(error) from error


@router.post("/history", response_model=CoachPracticeHistoryResponse)
async def coach_practice_history(body: CoachPracticeHistoryRequest):
    history = await _load_practice_history(body.cardId, body.questionType, body.skillTags, limit=body.limit)
    return {
        "summary": _summarize_attempt_history(history),
        "entries": history,
    }


@router.post("/skill-map-drills", response_model=SkillMapDrillsResponse)
async def coach_skill_map_drills(body: SkillMapDrillsRequest):
    progress_summary = await _load_skill_map_generation_summary(body)
    try:
        drills = await _skill_map_drills_with_llm(body, progress_summary)
    except SubmissionFeedbackUnavailableError as error:
        raise _coach_llm_http_exception(error) from error
    stamped = _stamp_skill_map_drills(drills["drills"])
    await _persist_skill_map_drills(stamped, bool(drills.get("llmUsed")), progress_summary)
    return {"drills": stamped, "llmUsed": bool(drills.get("llmUsed"))}


@router.post("/skill-map-drills-stream")
async def coach_skill_map_drills_stream(body: SkillMapDrillsRequest):
    progress_summary = await _load_skill_map_generation_summary(body)
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise _coach_llm_http_exception(SubmissionFeedbackUnavailableError(
            code="coach_llm_missing_api_key",
            message="Update backend .env with at least one coach LLM API key.",
            provider=provider,
            api_error_code="provider_auth_error",
        ))

    system_prompt = (
        "You generate focused Python practice cards for coding interview preparation. "
        "Return only a top-level JSON object shaped exactly like {\"drills\": [...]}. "
        "The drills array must contain exactly the requested count of objects with keys "
        "id, title, difficulty, prompt, templatePrompts, templateTargets, solution, missing, hint, tags. "
        "Do not return a single drill object without the drills wrapper. "
        "Generate exactly one drill for each skillMap entry, in the same order as the skillMap array. "
        "Do not generate a second drill for any pattern until every provided skillMap entry has one drill. "
        "Each drill must teach one reusable LeetCode move from the provided skill map, not a story problem. "
        "Use the generationSeed and shuffled method order to vary titles, snippets, missing lines, and selected methods across calls. "
        "Make them concise and pattern-first. Prioritize patterns with low readiness or high error rates, "
        "then fill remaining slots across remaining patterns. "
        "The solution must include exactly one '{{missing}}' placeholder, and missing must be the exact code that replaces it. "
        "The prompt must be very short: 12 words or fewer. "
        "templateTargets may include pseudo and invariant. Pseudo must be concise pseudocode. Invariant must be a Python scaffold. "
        "When you return templateTargets, make them specific to the drill's pattern and method instead of generic pattern text. "
        "templatePrompts must be an object keyed by pseudo, invariant, and full when those targets are provided. "
        "Each templatePrompts value must be 12 words or fewer and must describe the exact provided template target, not a legacy or story prompt. "
        "Keep snippets short enough to memorize, but realistic enough to reuse in senior-level interviews. "
        "Tags must include 'skill-map' and a slug for the pattern."
    )

    rng = random.SystemRandom()
    generation_seed = f"{datetime.now(tz=timezone.utc).strftime('%Y%m%d%H%M%S%f')}-{rng.randrange(1_000_000)}"
    generation_skill_map = list(body.skillMap[: body.count])
    rng.shuffle(generation_skill_map)
    trimmed_skill_map = [
        {"pattern": node.pattern, "methods": rng.sample(list(node.methods), len(node.methods)) if node.methods else []}
        for node in generation_skill_map
    ]
    pattern_progress = {
        slug: data
        for slug, data in progress_summary.get("patterns", {}).items()
        if data.get("attemptCount", 0) > 0 or data.get("readiness", 100) < 90
    }
    llm_payload = {
        "questionType": body.questionType,
        "count": body.count,
        "generationSeed": generation_seed,
        "templateMode": _template_mode_value(body.templateMode),
        "templateTargets": body.templateTargets,
        "skillMap": trimmed_skill_map,
        "practiceHistory": {
            "overall": progress_summary.get("overall", {}),
            "patterns": pattern_progress,
        },
        "schema": {
            "fields": ["id", "title", "difficulty", "prompt", "templatePrompts", "templateTargets", "solution", "missing", "hint", "tags"],
            "constraint": "solution must contain exactly one {{missing}} placeholder",
            "coverage": "drills[i] must correspond to skillMap[i]",
            "variation": "avoid reusing the same title, prompt, missing line, or exact snippet shape from a previous generation",
        },
    }
    total_drills = min(body.count, len(generation_skill_map))
    stamp_prefix = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")

    async def generate():
        q: thread_queue.Queue[tuple[str, Any]] = thread_queue.Queue()

        def _blocking():
            try:
                parser = _DrillStreamParser()
                drill_index = 0
                use_streaming = provider == "openai" and settings.coach_openai_api_key

                if use_streaming:
                    try:
                        for token in _call_openai_streaming(
                            system_prompt, llm_payload, DRILL_GEN_MAX_TOKENS,
                            DRILL_GEN_OPENAI_TIMEOUT_SECONDS, DRILL_GEN_TEMPERATURE,
                        ):
                            new_drills = parser.feed(token)
                            for raw_drill in new_drills:
                                processed = _process_raw_drill(raw_drill, drill_index, body, generation_skill_map)
                                if processed:
                                    tags = [str(t) for t in processed.get("tags", [])]
                                    if "skill-map" not in tags:
                                        tags = ["skill-map", *tags]
                                    stamped = {**processed, "id": f"skill-map-{stamp_prefix}-{drill_index + 1}", "tags": tags}
                                    q.put(("drill", {"index": drill_index, "drill": stamped, "total": total_drills}))
                                    drill_index += 1
                    except Exception as stream_err:
                        logger.warning("OpenAI streaming failed, falling back: %s", stream_err)
                        drill_index = 0
                        use_streaming = False

                if not use_streaming:
                    result = _call_llm_json(
                        system_prompt, llm_payload, provider,
                        DRILL_GEN_MAX_TOKENS, DRILL_GEN_OPENAI_TIMEOUT_SECONDS, DRILL_GEN_TEMPERATURE,
                    )
                    if result and isinstance(result.get("drills"), list):
                        for raw_drill in result["drills"][:body.count]:
                            processed = _process_raw_drill(raw_drill, drill_index, body, generation_skill_map)
                            if processed:
                                tags = [str(t) for t in processed.get("tags", [])]
                                if "skill-map" not in tags:
                                    tags = ["skill-map", *tags]
                                stamped = {**processed, "id": f"skill-map-{stamp_prefix}-{drill_index + 1}", "tags": tags}
                                q.put(("drill", {"index": drill_index, "drill": stamped, "total": total_drills}))
                                drill_index += 1

                q.put(("done", drill_index))
            except Exception as exc:
                logger.exception("Drill stream generation failed")
                q.put(("error", str(exc)))

        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(None, _blocking)
        all_drills: list[dict[str, Any]] = []

        while True:
            while q.empty():
                if future.done():
                    break
                await asyncio.sleep(0.05)

            if q.empty() and future.done():
                exc = future.exception()
                if exc:
                    yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"
                break

            try:
                event_type, data = q.get_nowait()
            except thread_queue.Empty:
                continue

            if event_type == "drill":
                all_drills.append(data["drill"])
                yield f"event: drill\ndata: {json.dumps(data)}\n\n"
            elif event_type == "done":
                await _persist_skill_map_drills(all_drills, True, progress_summary)
                yield f"event: done\ndata: {json.dumps({'count': len(all_drills), 'llmUsed': True})}\n\n"
                break
            elif event_type == "error":
                yield f"event: error\ndata: {json.dumps({'message': data})}\n\n"
                break

        await future

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/adaptive-variation", response_model=AdaptiveVariationResponse)
async def coach_adaptive_variation(body: AdaptiveVariationRequest):
    try:
        return await _adaptive_variation_with_llm(body)
    except SubmissionFeedbackUnavailableError as error:
        raise _coach_llm_http_exception(error) from error
