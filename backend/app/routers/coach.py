from __future__ import annotations

import ast
import asyncio
import builtins
import difflib
import json
import keyword
import logging
import re
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.database import get_pool
from app.models import (
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
TEMPLATE_MODE_ORDER = ("pseudo", "skeleton", "full")
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
ANTHROPIC_MODEL_FALLBACKS = (
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-20250514",
    "claude-3-haiku-20240307",
)
SUBMISSION_LLM_MAX_RETRIES = 3
SUBMISSION_LLM_RETRY_DELAYS_SECONDS = (0.3, 0.6, 0.9)
ASSESSOR_FASTEST_PROVIDER_CHAIN = ("gemma", "claude", "openai")
ASSESSOR_MAX_TOKENS = 600
NARRATOR_MAX_TOKENS = 1800
DRILL_GEN_MAX_TOKENS = 2000


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
    if template_mode == TemplateMode.full.value:
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
    return normalized if normalized in TEMPLATE_MODE_ORDER else TemplateMode.full.value


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
    if template_mode == TemplateMode.skeleton.value:
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
    if template_mode == TemplateMode.skeleton.value and re.search(r"^\s*def\b", user_answer, re.MULTILINE):
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


def _parse_json_field(value: Any, fallback: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return fallback
        return parsed if isinstance(parsed, type(fallback)) else fallback
    return fallback


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
            "templateMode": str(row["templateMode"] or TemplateMode.full.value),
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
            TemplateMode.skeleton.value: "algorithm skeleton",
            TemplateMode.full.value: "algorithm template",
        }.get(template_mode, "algorithm template")
    return {
        TemplateMode.pseudo.value: f"{pattern_name} pseudocode",
        TemplateMode.skeleton.value: f"{pattern_name} skeleton",
        TemplateMode.full.value: f"{pattern_name} template",
    }.get(template_mode, f"{pattern_name} template")


def _heuristic_session_plan(body: CoachSessionPlanRequest) -> dict[str, Any]:
    weak_cards = sorted(body.weakestCards, key=lambda c: (c.accuracy, -c.elapsedMs))[:3]
    weak_labels = ", ".join(f"#{c.cardId} ({round(c.accuracy)}%)" for c in weak_cards) or "none"

    if body.avgAccuracy >= 95:
        focus_theme = "Speed compression while protecting soundness."
        warmup = "2 cards, one untimed sound rep each."
        main_set = "6 timed reps at 85% of today’s average time. Stop if soundness drops twice."
    elif body.avgAccuracy >= 85:
        focus_theme = "Close the last precision gaps."
        warmup = "3 opening-anchor drills (signature + base case)."
        main_set = f"8 reps: alternate weak cards ({weak_labels}) with one strong card."
    else:
        focus_theme = "Stabilize structure before speed."
        warmup = "3 slow sound reps with full compare after each attempt."
        main_set = f"10 reps focused on weak cards ({weak_labels}); untimed until >90%."

    cooldown = "1 sound rep on your easiest card to end with a clean memory trace."
    note = (
        "Keep one coaching focus per session. If accuracy falls for two consecutive reps, "
        "drop speed pressure and rebuild soundness."
    )
    headline = (
        f"{body.mode.value} session: {body.correctCount}/{body.attempts} sound, "
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


def _pattern_slug(pattern: str) -> str:
    return (
        pattern.lower()
        .replace("/", " ")
        .replace("&", " ")
        .replace("-", " ")
        .strip()
        .replace("  ", " ")
        .replace(" ", "-")
    )


def _generic_skill_drill(pattern: str, methods: list[str], index: int) -> dict[str, Any]:
    method = methods[0] if methods else "core invariant"
    slug = _pattern_slug(pattern)
    return {
        "id": f"skill-{slug}-{index + 1}",
        "title": f"Skill Map • {pattern}: {method.title()}",
        "difficulty": "Med.",
        "prompt": f"Memorize a reusable {pattern.lower()} snippet that makes the {method} explicit.",
        "solution": "def solve(items):\n    for item in items:\n        {{missing}}\n    return items",
        "missing": "pass",
        "hint": f"Keep the {method} explicit enough that you could reuse it inside a real interview problem.",
        "tags": ["skill-map", slug],
    }


def _method_focus_tag(method: str) -> str:
    return _pattern_slug(method).replace(" ", "-")


def _method_focused_skill_drill(
    pattern: str,
    method: str,
    index: int,
    base_template: dict[str, Any] | None = None,
) -> dict[str, Any]:
    slug = _pattern_slug(pattern)
    focus = method.strip() or "core invariant"
    template = {**(base_template or _generic_skill_drill(pattern, [focus], index))}
    tags = [str(tag) for tag in template.get("tags", []) if str(tag).strip()]
    method_tag = f"method-{_method_focus_tag(focus)}"
    if method_tag not in tags:
        tags.append(method_tag)

    return {
        **template,
        "id": f"skill-{slug}-{_method_focus_tag(focus)}-{index + 1}",
        "title": f"Skill Map • {pattern}: {focus.title()}",
        "prompt": f"Memorize a reusable {pattern.lower()} snippet while making the {focus} explicit.",
        "hint": f"{str(template.get('hint', '')).strip()} Focus lens: {focus}.".strip(),
        "tags": tags,
    }


def _fallback_skill_map_drills(
    body: SkillMapDrillsRequest, progress_summary: dict[str, Any] | None = None
) -> dict[str, Any]:
    templates: dict[str, dict[str, Any]] = {
        "sliding-window": {
            "title": "Skill Map • Sliding Window: Window Score Update",
            "prompt": "Memorize the reusable sliding-window template for tracking the best valid window after expand / shrink steps.",
            "solution": "def longest_at_most_k(nums, k):\n    left = 0\n    counts = {}\n    best = 0\n    for right, value in enumerate(nums):\n        counts[value] = counts.get(value, 0) + 1\n        while len(counts) > k:\n            counts[nums[left]] -= 1\n            if counts[nums[left]] == 0:\n                del counts[nums[left]]\n            left += 1\n        {{missing}}\n    return best",
            "missing": "best = max(best, right - left + 1)",
            "hint": "The pattern is expand, shrink until valid, then score the current window.",
            "tags": ["skill-map", "sliding-window"],
        },
        "two-pointers": {
            "title": "Skill Map • Two Pointers: Sorted Pair Scan",
            "prompt": "Memorize the two-pointer invariant for scanning a sorted array toward a target sum.",
            "solution": "def has_pair(nums, target):\n    left, right = 0, len(nums) - 1\n    while left < right:\n        total = nums[left] + nums[right]\n        if total == target:\n            return True\n        if total < target:\n            {{missing}}\n        else:\n            right -= 1\n    return False",
            "missing": "left += 1",
            "hint": "Only move the pointer whose direction can improve the invariant.",
            "tags": ["skill-map", "two-pointers"],
        },
        "binary-search": {
            "title": "Skill Map • Binary Search: Lower Bound",
            "prompt": "Memorize the lower-bound binary search template that finds the first index with value >= target.",
            "solution": "def lower_bound(nums, target):\n    left, right = 0, len(nums)\n    while left < right:\n        mid = left + (right - left) // 2\n        if nums[mid] < target:\n            left = mid + 1\n        else:\n            {{missing}}\n    return left",
            "missing": "right = mid",
            "hint": "Keep the answer inside the half-open interval [left, right).",
            "tags": ["skill-map", "binary-search"],
        },
        "dfs-bfs": {
            "title": "Skill Map • DFS / BFS: Visited Rule",
            "prompt": "Memorize the BFS visited-state rule that keeps graph traversal stable and reusable.",
            "solution": "from collections import deque\n\ndef bfs_order(graph, start):\n    queue = deque([start])\n    seen = {start}\n    order = []\n    while queue:\n        node = queue.popleft()\n        order.append(node)\n        for nei in graph[node]:\n            if nei in seen:\n                continue\n            {{missing}}\n            queue.append(nei)\n    return order",
            "missing": "seen.add(nei)",
            "hint": "In BFS, decide exactly when a node becomes seen and do it consistently.",
            "tags": ["skill-map", "dfs-bfs", "graph"],
        },
        "backtracking": {
            "title": "Skill Map • Backtracking: Undo Step",
            "prompt": "Memorize the choice / explore / undo rhythm that makes backtracking reusable.",
            "solution": "def subsets(nums):\n    result = []\n    path = []\n    def dfs(index):\n        result.append(path[:])\n        for i in range(index, len(nums)):\n            path.append(nums[i])\n            dfs(i + 1)\n            {{missing}}\n    dfs(0)\n    return result",
            "missing": "path.pop()",
            "hint": "The undo step is what keeps sibling branches correct.",
            "tags": ["skill-map", "backtracking"],
        },
        "heap-priority-queue": {
            "title": "Skill Map • Heap: Keep Top K",
            "prompt": "Memorize the min-heap maintenance pattern for keeping the top-k values in a stream.",
            "solution": "import heapq\n\ndef top_k(nums, k):\n    heap = []\n    for value in nums:\n        heapq.heappush(heap, value)\n        if len(heap) > k:\n            {{missing}}\n    return heap",
            "missing": "heapq.heappop(heap)",
            "hint": "A min-heap keeps only the k best items by ejecting the smallest overflow item.",
            "tags": ["skill-map", "heap"],
        },
        "union-find": {
            "title": "Skill Map • Union Find: Path Compression",
            "prompt": "Memorize the path-compression step inside find so the structure stays reusable across connectivity problems.",
            "solution": "def find(parent, x):\n    if parent[x] != x:\n        {{missing}}\n    return parent[x]",
            "missing": "parent[x] = find(parent, parent[x])",
            "hint": "Compress on the way back so later finds become almost constant time.",
            "tags": ["skill-map", "union-find", "graph"],
        },
        "dynamic-programming": {
            "title": "Skill Map • DP: Transition Update",
            "prompt": "Memorize a 1D dynamic-programming transition that makes state definition and update explicit.",
            "solution": "def min_cost(costs):\n    dp = [0] * (len(costs) + 1)\n    for i in range(2, len(costs) + 1):\n        one = dp[i - 1] + costs[i - 1]\n        two = dp[i - 2] + costs[i - 2]\n        {{missing}}\n    return dp[-1]",
            "missing": "dp[i] = min(one, two)",
            "hint": "Say the state aloud first: what does dp[i] mean before you update it?",
            "tags": ["skill-map", "dynamic-programming", "dp"],
        },
        "graph-traversal": {
            "title": "Skill Map • Graph Traversal: Zero-Indegree Frontier",
            "prompt": "Memorize the topological-sort frontier rule for nodes whose indegree just dropped to zero.",
            "solution": "from collections import deque\n\ndef topo_sort(graph, indegree):\n    queue = deque([node for node, degree in indegree.items() if degree == 0])\n    order = []\n    while queue:\n        node = queue.popleft()\n        order.append(node)\n        for nei in graph[node]:\n            indegree[nei] -= 1\n            if indegree[nei] == 0:\n                {{missing}}\n    return order",
            "missing": "queue.append(nei)",
            "hint": "Topological BFS is just frontier management over zero-indegree nodes.",
            "tags": ["skill-map", "graph-traversal", "graph"],
        },
        "intervals": {
            "title": "Skill Map • Intervals: Append New Segment",
            "prompt": "Memorize the post-sort interval merge pattern for deciding whether to extend or append.",
            "solution": "def merge_intervals(intervals):\n    intervals.sort()\n    merged = [intervals[0][:]]\n    for start, end in intervals[1:]:\n        last_end = merged[-1][1]\n        if start <= last_end:\n            merged[-1][1] = max(last_end, end)\n        else:\n            {{missing}}\n    return merged",
            "missing": "merged.append([start, end])",
            "hint": "After sorting, every interval either extends the last one or starts a new bucket.",
            "tags": ["skill-map", "intervals"],
        },
        "prefix-sums": {
            "title": "Skill Map • Prefix Sums: Running Count Map",
            "prompt": "Memorize the prefix-sum hashmap update that powers reusable subarray-counting patterns.",
            "solution": "def count_subarrays(nums, k):\n    seen = {0: 1}\n    total = 0\n    count = 0\n    for value in nums:\n        total += value\n        count += seen.get(total - k, 0)\n        {{missing}}\n    return count",
            "missing": "seen[total] = seen.get(total, 0) + 1",
            "hint": "Query with the old prefix first, then record the current one.",
            "tags": ["skill-map", "prefix-sums"],
        },
        "monotonic-stack": {
            "title": "Skill Map • Monotonic Stack: Resolve While Popping",
            "prompt": "Memorize the monotonic-stack pop rule that resolves the answer for each index as soon as the invariant breaks.",
            "solution": "def next_greater(nums):\n    stack = []\n    answer = [-1] * len(nums)\n    for i, value in enumerate(nums):\n        while stack and nums[stack[-1]] < value:\n            index = stack.pop()\n            {{missing}}\n        stack.append(i)\n    return answer",
            "missing": "answer[index] = value",
            "hint": "The stack stores unresolved indices until a breaking value arrives.",
            "tags": ["skill-map", "monotonic-stack", "stack"],
        },
    }

    drills: list[dict[str, Any]] = []
    progress_by_pattern = progress_summary.get("patterns", {}) if isinstance(progress_summary, dict) else {}
    nodes = body.skillMap[: body.count] or []
    for index, node in enumerate(nodes):
        slug = _pattern_slug(node.pattern)
        method_focus = node.methods[0].strip() if len(node.methods) == 1 else ""
        base_template = templates.get(slug) or _generic_skill_drill(node.pattern, node.methods, index)
        template = (
            _method_focused_skill_drill(node.pattern, method_focus, index, base_template)
            if method_focus
            else base_template
        )
        progress = progress_by_pattern.get(slug, {})
        focus_note = _progress_focus_note(progress)
        difficulty = template["difficulty"] if "difficulty" in template else "Med."
        prompt = template["prompt"]
        hint = template["hint"]

        if int(progress.get("attemptCount", 0)) > 0 and float(progress.get("avgAccuracy", 0)) < 85:
            difficulty = "Easy"
            if focus_note:
                hint = f"{hint} {focus_note}".strip()
        elif int(progress.get("attemptCount", 0)) >= 2 and float(progress.get("avgAccuracy", 0)) >= 95:
            difficulty = "Hard"
            prompt = f"{prompt} Keep this rep tight and exact with fewer mental cues."

        drills.append({
            "id": f"skill-{slug}-{index + 1}",
            "title": template["title"],
            "difficulty": difficulty,
            "prompt": prompt,
            "solution": template["solution"],
            "missing": template["missing"],
            "hint": hint,
            "tags": template["tags"],
        })

    return {"drills": drills, "llmUsed": False}


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


def _resolve_fastest_llm_provider() -> str:
    """Pick the fastest-available provider for the Heuristic Assessor.

    Ignores the user's preferred provider — latency matters more here.
    Order: Gemma → Claude → OpenAI.
    """
    for candidate in ASSESSOR_FASTEST_PROVIDER_CHAIN:
        if _llm_provider_available(candidate):
            return candidate
    return ASSESSOR_FASTEST_PROVIDER_CHAIN[-1]


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


def _call_openai_json(system_prompt: str, user_payload: dict[str, Any], max_tokens: int = 1800) -> dict[str, Any] | None:
    if not settings.coach_openai_api_key:
        return None

    url = f"{settings.coach_openai_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.coach_openai_model,
        "temperature": 0.2,
        "max_tokens": max_tokens,
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
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            content = payload["choices"][0]["message"]["content"]
            return _extract_json_dict(content)
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError):
        return None


def _call_claude_json(system_prompt: str, user_payload: dict[str, Any], max_tokens: int = 1800) -> dict[str, Any] | None:
    if not settings.coach_anthropic_api_key:
        return None

    url = f"{settings.coach_anthropic_base_url.rstrip('/')}/messages"
    configured_model = str(settings.coach_anthropic_model or "").strip()
    candidate_models: list[str] = []
    for model in (configured_model, *ANTHROPIC_MODEL_FALLBACKS):
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
                logger.warning("Anthropic model '%s' unavailable (%s). Trying fallback model.", model, error.code)
                continue
            logger.warning("Anthropic request failed (%s): %s", error.code, details[:400])
            return None
        except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as error:
            logger.warning("Anthropic request failed for model '%s': %s", model, error)
            return None

    logger.warning("No usable Anthropic model found from configured/fallback candidates.")
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


def _call_llm_json(system_prompt: str, user_payload: dict[str, Any], provider: str, max_tokens: int = 1800) -> dict[str, Any] | None:
    if provider == "claude":
        return _call_claude_json(system_prompt, user_payload, max_tokens)
    if provider == "gemma":
        return _call_gemma_json(system_prompt, user_payload, max_tokens)
    return _call_openai_json(system_prompt, user_payload, max_tokens)


# ---------------------------------------------------------------------------
# Heuristic Assessor — Role 1
# Lightweight structural analysis call. Fastest available provider, small
# token budget. Used as the ONLY LLM call for live feedback, and as Stage 1
# for submission feedback (feeds the Narrator).
# ---------------------------------------------------------------------------

def _assessor_system_prompt(live_mode: bool) -> str:
    dimensions_spec = (
        "dimensions: {"
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
        f"Return strict JSON: {{v: 1, patternIdentified: str, {dimensions_spec}, "
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


def _fallback_heuristic_assessment(
    body: CoachAttemptFeedbackRequest,
    template_mode: str,
) -> dict[str, Any]:
    """Pure-Python fallback when all LLM providers are unavailable."""
    primary_tag = body.skillTags[0] if body.skillTags else "general"
    accuracy = float(body.accuracy or 0)
    verdict = "sound" if accuracy >= 95 else ("close" if accuracy >= 80 else "needs-work")
    primary_blocker = "review and complete the full solution structure"
    blocker_key = "structure"

    assessment: dict[str, Any] = {
        "v": 1,
        "patternIdentified": primary_tag,
        "dimensions": {
            "structure":       {"score": round(accuracy * 0.7), "note": ""},
            "correctness":     {"score": round(accuracy), "note": ""},
            "completeness":    {"score": round(accuracy * 0.8), "note": ""},
            "patternFidelity": {"score": round(accuracy * 0.7), "note": ""},
            "syntax":          {"valid": True, "error": None},
            "completionTime":  {"score": 50, "note": ""},
        },
        "structuralElements": {
            "hasSignature":   False,
            "hasLoop":        False,
            "hasShrinkStep":  False,
            "hasScoreUpdate": False,
            "hasGuard":       False,
        },
        "primaryBlocker": primary_blocker,
        "blockerKey":     blocker_key,
        "verdict":        verdict,
        "errorTags":      [],
        "strengths":      [],
        "llmUsed":        False,
    }

    if body.liveMode:
        assessment.update({
            "diagnosis":           f"Focus on completing the {primary_tag} structure.",
            "primaryFocus":        "Add the missing structural elements.",
            "immediateCorrection": primary_blocker,
            "affirmation":         "",
            "nextMove":            primary_blocker,
            "why":                 "One structural gap at a time.",
            "keepInMind":          f"The {primary_tag} pattern has a fixed contract.",
            "microDrill":          "One focused rep on the primary structure.",
            "nextRepTarget":       "Sound solution with >= 90% rubric strength.",
        })

    return assessment


async def _run_heuristic_assessor(
    body: CoachAttemptFeedbackRequest,
    template_mode: str,
) -> dict[str, Any]:
    """Call the Heuristic Assessor LLM (fastest available provider).

    Returns a structured assessment dict. Falls back to pure-Python defaults
    when all providers are unavailable or the response is invalid.
    """
    provider = _resolve_fastest_llm_provider()
    if not _llm_provider_available(provider):
        return _fallback_heuristic_assessment(body, template_mode)

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
        logger.warning("Heuristic assessor returned non-dict response from provider '%s'.", provider)
        return _fallback_heuristic_assessment(body, template_mode)

    required_keys = {"v", "patternIdentified", "dimensions", "primaryBlocker", "blockerKey", "verdict"}
    missing = required_keys - result.keys()
    if missing:
        logger.warning("Heuristic assessor response missing keys %s from provider '%s'.", missing, provider)
        return _fallback_heuristic_assessment(body, template_mode)

    result.setdefault("llmUsed", True)
    result.setdefault("errorTags", [])
    result.setdefault("strengths", [])
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
# Receives a clean Assessor output instead of raw heuristic signals.
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
        "Base your diagnosis on the provided assessment dimensions. "
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
            "dimensions":        assessment.get("dimensions", {}),
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
                "templateMode": item.get("templateMode", TemplateMode.full.value),
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


async def _session_plan_with_optional_llm(
    body: CoachSessionPlanRequest, heuristic: dict[str, Any]
) -> dict[str, Any]:
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
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

    llm_response = await asyncio.to_thread(_call_llm_json, system_prompt, llm_payload, provider)
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


async def _load_skill_map_generation_summary(body: SkillMapDrillsRequest) -> dict[str, Any]:
    pattern_tags = [_pattern_slug(node.pattern) for node in body.skillMap[: body.count] if _pattern_slug(node.pattern)]
    history = await _load_practice_history("", body.questionType, pattern_tags, limit=max(20, body.count * 6))
    return _summarize_skill_map_progress(body.skillMap[: body.count], history)


async def _skill_map_drills_with_optional_llm(
    body: SkillMapDrillsRequest, heuristic: dict[str, Any], progress_summary: dict[str, Any]
) -> dict[str, Any]:
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        return heuristic

    system_prompt = (
        "You generate atomic Python recall drills for coding interview preparation. "
        "Return strict JSON with key drills, where drills is an array of objects with keys "
        "id, title, difficulty, prompt, solution, missing, hint, tags. "
        "Each drill must teach one reusable LeetCode move from the provided skill map, not a story problem. "
        "Make them concise and pattern-first. Prioritize patterns with low readiness or high error rates, "
        "then fill remaining slots across remaining patterns. "
        "The solution must include exactly one '{{missing}}' placeholder, and missing must be the exact code that replaces it. "
        "Keep snippets short enough to memorize, but realistic enough to reuse in senior-level interviews. "
        "Tags must include 'skill-map' and a slug for the pattern."
    )

    # Trim skill map nodes to just pattern + methods — no extra serialization overhead
    trimmed_skill_map = [
        {"pattern": node.pattern, "methods": node.methods}
        for node in body.skillMap[: body.count]
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
        "skillMap": trimmed_skill_map,
        "practiceHistory": {
            "overall": progress_summary.get("overall", {}),
            "patterns": pattern_progress,
        },
        "schema": {
            "fields":     ["id", "title", "difficulty", "prompt", "solution", "missing", "hint", "tags"],
            "constraint": "solution must contain exactly one {{missing}} placeholder",
        },
    }

    llm_response = await asyncio.to_thread(_call_llm_json, system_prompt, llm_payload, provider, DRILL_GEN_MAX_TOKENS)
    if not llm_response or not isinstance(llm_response.get("drills"), list):
        return heuristic

    drills: list[dict[str, Any]] = []
    for index, raw in enumerate(llm_response["drills"][: body.count]):
        if not isinstance(raw, dict):
            return heuristic
        solution = str(raw.get("solution", "")).strip()
        missing = str(raw.get("missing", "")).strip()
        if "{{missing}}" not in solution or not missing:
            return heuristic
        tags_raw = raw.get("tags", [])
        tags = [str(tag).strip() for tag in tags_raw if str(tag).strip()] if isinstance(tags_raw, list) else []
        if "skill-map" not in tags:
            tags = ["skill-map", *tags]
        drills.append({
            "id": str(raw.get("id", f"skill-map-{index + 1}")),
            "title": str(raw.get("title", f"Skill Map Drill {index + 1}")),
            "difficulty": str(raw.get("difficulty", "Med.")),
            "prompt": str(raw.get("prompt", "")).strip(),
            "solution": solution,
            "missing": missing,
            "hint": str(raw.get("hint", "")).strip(),
            "tags": tags,
        })

    if len(drills) != min(body.count, len(body.skillMap)):
        return heuristic

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
    if not body.liveMode and not _llm_provider_available(provider):
        raise HTTPException(
            status_code=400,
            detail=_submission_feedback_error_detail(
                "submission_feedback_missing_api_key",
                "Update backend .env with your API key.",
                provider,
                "provider_auth_error",
            ),
        )

    template_mode = _template_mode_value(body.templateMode)
    history = await _load_attempt_history(body)
    history_summary = _summarize_attempt_history(history)
    assessment = await _run_heuristic_assessor(body, template_mode)

    if body.liveMode:
        feedback = _assessment_to_live_response(assessment)
    else:
        try:
            feedback = await _attempt_feedback_with_narrator(body, assessment, history, history_summary)
        except SubmissionFeedbackUnavailableError as error:
            raise HTTPException(
                status_code=503,
                detail=_submission_feedback_error_detail(
                    error.code,
                    error.message,
                    error.provider,
                    error.api_error_code,
                ),
            ) from error

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

    feedback["llmProvider"] = provider if bool(feedback.get("llmUsed")) else ""
    await _persist_feedback_event(body, feedback)
    feedback.pop("signals", None)
    return feedback


@router.post("/session-plan", response_model=CoachSessionPlanResponse)
async def coach_session_plan(body: CoachSessionPlanRequest):
    heuristic = _heuristic_session_plan(body)
    plan = await _session_plan_with_optional_llm(body, heuristic)
    return plan


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
    heuristic = _fallback_skill_map_drills(body, progress_summary)
    drills = await _skill_map_drills_with_optional_llm(body, heuristic, progress_summary)
    stamped = _stamp_skill_map_drills(drills["drills"])
    await _persist_skill_map_drills(stamped, bool(drills.get("llmUsed")), progress_summary)
    return {"drills": stamped, "llmUsed": bool(drills.get("llmUsed"))}
