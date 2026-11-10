"""The one client for coach LLM providers (OpenAI, Claude, Gemma).

Every LLM call in the backend goes through here: one transport (certifi-verified
HTTPS), one adapter per provider, and one error type, :class:`LlmUnavailableError`,
whose ``code`` comes from a single taxonomy. Callers choose how to fail:

- :func:`complete_json` raises :class:`LlmUnavailableError`;
- :func:`call_llm_json` returns ``None`` instead (and logs why);
- :func:`call_llm_json_for_submission` returns ``(data, code, message, retryable)``
  for the narrator's retry loop;
- :func:`stream_openai_text` yields streamed text deltas.

Calls are synchronous; services run them off the event loop with ``asyncio.to_thread``.
"""

from __future__ import annotations

import json
import logging
import re
import ssl
import urllib.error
import urllib.request
from collections.abc import Callable, Iterator
from typing import Any

from app.config import settings
from app.contracts.errors import LlmUnavailableError, provider_label

try:
    import certifi
except ImportError:  # pragma: no cover - optional dependency during local dev
    certifi = None

logger = logging.getLogger(__name__)

ANTHROPIC_MODEL_CANDIDATES = (
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-20250514",
    "claude-3-haiku-20240307",
)
DEFAULT_GEMMA_MODEL = "gemma-4-31b-it"
JSON_ONLY = "Return only valid JSON. Do not include markdown."


# ─── Provider selection ───


def llm_provider_label(provider: str) -> str:
    return provider_label(provider)


def normalize_llm_provider(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"claude", "anthropic"}:
        return "claude"
    if normalized in {"openai", "chatgpt", "gpt"}:
        return "openai"
    if normalized in {"gemma", "gemma4", "google"}:
        return "gemma"
    return ""


def resolve_llm_provider(requested_provider: str) -> str:
    requested = normalize_llm_provider(str(requested_provider or ""))
    configured = normalize_llm_provider(str(settings.coach_llm_provider or ""))
    return requested or configured or "openai"


def preferred_provider_chain(requested_provider: str) -> list[str]:
    requested = normalize_llm_provider(str(requested_provider or ""))
    configured = normalize_llm_provider(str(settings.coach_llm_provider or ""))
    ordered: list[str] = []
    for provider in (requested, configured, "gemma", "claude", "openai"):
        if provider and provider not in ordered:
            ordered.append(provider)
    return ordered


def llm_provider_available(provider: str) -> bool:
    if provider == "claude":
        return bool(settings.coach_anthropic_api_key)
    if provider == "gemma":
        return bool(settings.coach_gemma_api_key)
    return bool(settings.coach_openai_api_key)


def resolve_available_llm_provider(requested_provider: str) -> str:
    for candidate in preferred_provider_chain(requested_provider):
        if llm_provider_available(candidate):
            return candidate
    return resolve_llm_provider(requested_provider)


def require_available_provider(requested_provider: str) -> str:
    """The provider to use, or :class:`LlmUnavailableError` when no provider has a key."""
    provider = resolve_available_llm_provider(requested_provider)
    if not llm_provider_available(provider):
        raise LlmUnavailableError(
            "coach_llm_missing_api_key",
            "Update backend .env with at least one coach LLM API key.",
            provider,
            "provider_auth_error",
        )
    return provider


# ─── Errors ───


def extract_provider_error_message(payload_text: str) -> str:
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


def submission_provider_error_from_http(provider_label: str, status_code: int, payload_text: str) -> tuple[str, str, bool]:
    """``(code, message, retryable)`` for a provider's HTTP error response."""
    detail = extract_provider_error_message(payload_text)
    lower = detail.lower()
    if "credit balance is too low" in lower or ("insufficient" in lower and "credit" in lower):
        return (
            "provider_insufficient_credits",
            f"{provider_label} API error: insufficient credits. Add credits in your provider billing and try again.",
            False,
        )
    if status_code in {401, 403} or "api key" in lower or "authentication" in lower:
        return (
            "provider_auth_error",
            f"{provider_label} API error: authentication failed. Verify the API key in backend .env.",
            False,
        )
    if status_code == 429 or ("rate" in lower and "limit" in lower):
        return "provider_rate_limited", f"{provider_label} API error: rate limited. Please retry in a moment.", True
    if status_code in {400, 404} and "model" in lower:
        return "provider_model_error", f"{provider_label} API error: model configuration is invalid or unavailable.", False
    if status_code >= 500:
        return (
            "provider_server_error",
            f"{provider_label} API error: upstream service issue ({status_code}). Please retry shortly.",
            True,
        )
    if detail:
        return "provider_request_error", f"{provider_label} API error: {detail}", False
    return "provider_request_error", f"{provider_label} API error: request failed with status {status_code}.", False


def submission_provider_error_from_exception(provider_label: str, error: Exception) -> tuple[str, str, bool]:
    """``(code, message, retryable)`` for a transport failure."""
    if isinstance(error, TimeoutError):
        return "provider_timeout", f"{provider_label} API error: request timed out. Please retry.", True
    if isinstance(error, urllib.error.URLError):
        reason = str(getattr(error, "reason", "")).strip()
        detail = f" ({reason})" if reason else ""
        return "provider_network_error", f"{provider_label} API error: network/connectivity issue{detail}.", True
    return "provider_unknown_error", f"{provider_label} API error: unexpected request failure.", True


# ─── Transport ───


def _ssl_context() -> ssl.SSLContext | None:
    if certifi is None:
        return None
    return ssl.create_default_context(cafile=certifi.where())


def _urlopen(request: urllib.request.Request, timeout: int):
    context = _ssl_context()
    if context is None:
        return urllib.request.urlopen(request, timeout=timeout)
    return urllib.request.urlopen(request, timeout=timeout, context=context)


def _request(url: str, body: dict[str, Any], headers: dict[str, str]) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )


def _post_json(url: str, body: dict[str, Any], headers: dict[str, str], timeout: int) -> dict[str, Any]:
    with _urlopen(_request(url, body, headers), timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_json_dict(value: str) -> dict[str, Any] | None:
    """The JSON object in a model reply: plain, fenced, or embedded in prose."""
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
                parsed, _ = decoder.raw_decode(text[match.start():])
                if isinstance(parsed, dict):
                    return parsed
            except ValueError:
                continue
        return None
    return parsed if isinstance(parsed, dict) else None


# ─── Provider adapters: each returns the reply text or raises LlmUnavailableError ───


def _invalid(provider: str, message: str, code: str = "provider_invalid_json") -> LlmUnavailableError:
    return LlmUnavailableError(code, f"{llm_provider_label(provider)} API error: {message}", provider, code, retryable=True)


def _openai_text(system_prompt: str, payload: dict[str, Any], max_tokens: int, timeout: int, temperature: float) -> str:
    url = f"{settings.coach_openai_base_url.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {settings.coach_openai_api_key}"}
    body: dict[str, Any] = {
        "model": settings.coach_openai_model,
        "messages": [
            {"role": "system", "content": f"{system_prompt}\n{JSON_ONLY}"},
            {"role": "user", "content": json.dumps(payload)},
        ],
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    try:
        reply = _post_json(url, body, headers, timeout)
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        if not (error.code == 400 and "max_completion_tokens" in details and "unsupported" in details.lower()):
            raise _http_error("openai", error.code, details) from error
        # Older models take max_tokens instead.
        retry_body = {key: value for key, value in body.items() if key != "max_completion_tokens"}
        reply = _post_json(url, {**retry_body, "max_tokens": max_tokens}, headers, timeout)
    try:
        return str(reply["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as error:
        raise _invalid("openai", "unexpected response format.", "provider_response_format_error") from error


def _claude_text(system_prompt: str, payload: dict[str, Any], max_tokens: int, timeout: int, temperature: float) -> str:
    url = f"{settings.coach_anthropic_base_url.rstrip('/')}/messages"
    headers = {"x-api-key": settings.coach_anthropic_api_key, "anthropic-version": "2023-06-01"}
    configured = str(settings.coach_anthropic_model or "").strip()
    models = list(dict.fromkeys(model for model in (configured, *ANTHROPIC_MODEL_CANDIDATES) if model))
    last_error: LlmUnavailableError | None = None
    for model in models:
        body = {
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "system": f"{system_prompt}\n{JSON_ONLY}",
            "messages": [{"role": "user", "content": json.dumps(payload)}],
        }
        try:
            reply = _post_json(url, body, headers, timeout)
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            if error.code in {400, 404} and "model" in details.lower():
                logger.warning("Anthropic model '%s' unavailable (%s). Trying the next model.", model, error.code)
                last_error = _http_error("claude", error.code, details)
                continue
            raise _http_error("claude", error.code, details) from error
        except (TimeoutError, urllib.error.URLError) as error:
            timed_out = isinstance(error, TimeoutError) or "timed out" in str(getattr(error, "reason", "") or error).lower()
            if not timed_out:
                raise
            logger.warning("Anthropic request timed out for model '%s': %s", model, error)
            last_error = _exception_error("claude", error)
            continue
        content = reply.get("content", [])
        if not isinstance(content, list):
            raise _invalid("claude", "unexpected response format.", "provider_response_format_error")
        texts = [str(item.get("text", "")) for item in content if isinstance(item, dict) and item.get("type") == "text"]
        if not texts:
            raise _invalid("claude", "empty response.", "provider_empty_response")
        return "\n".join(texts)
    raise last_error or _invalid("claude", "no usable model found.", "provider_model_error")


def _gemma_text(system_prompt: str, payload: dict[str, Any], max_tokens: int, timeout: int, temperature: float) -> str:
    model = str(settings.coach_gemma_model or "").strip() or DEFAULT_GEMMA_MODEL
    # The key goes in a header, not the URL, so it never lands in logs or proxies.
    url = f"{settings.coach_gemma_base_url.rstrip('/')}/models/{model}:generateContent"
    body = {
        "contents": [{"parts": [{"text": f"{system_prompt}\n{JSON_ONLY}\n\n{json.dumps(payload)}"}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens, "responseMimeType": "application/json"},
    }
    reply = _post_json(url, body, {"x-goog-api-key": settings.coach_gemma_api_key}, timeout)
    candidates = reply.get("candidates", [])
    if candidates and isinstance(candidates, list):
        parts = candidates[0].get("content", {}).get("parts", [])
        texts = [part.get("text", "") for part in parts if isinstance(part, dict) and part.get("text")]
        if texts:
            return "\n".join(texts)
    raise _invalid("gemma", "response could not be parsed as JSON.")


_ADAPTERS: dict[str, Callable[[str, dict[str, Any], int, int, float], str]] = {
    "openai": _openai_text,
    "claude": _claude_text,
    "gemma": _gemma_text,
}


def _http_error(provider: str, status: int, details: str) -> LlmUnavailableError:
    code, message, retryable = submission_provider_error_from_http(llm_provider_label(provider), status, details)
    return LlmUnavailableError(code, message, provider, code, retryable)


def _exception_error(provider: str, error: Exception) -> LlmUnavailableError:
    code, message, retryable = submission_provider_error_from_exception(llm_provider_label(provider), error)
    return LlmUnavailableError(code, message, provider, code, retryable)


def _missing_key(provider: str) -> LlmUnavailableError:
    return LlmUnavailableError(
        "provider_auth_error", f"{llm_provider_label(provider)} API key is missing.", provider, "provider_auth_error"
    )


# ─── Public calls ───


def complete_json(
    system_prompt: str,
    user_payload: dict[str, Any],
    provider: str,
    max_tokens: int = 1800,
    timeout_seconds: int = 30,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """The JSON object the model replies with, or :class:`LlmUnavailableError`."""
    provider = provider if provider in _ADAPTERS else "openai"
    if not llm_provider_available(provider):
        raise _missing_key(provider)
    try:
        text = _ADAPTERS[provider](system_prompt, user_payload, max_tokens, timeout_seconds, temperature)
    except LlmUnavailableError:
        raise
    except urllib.error.HTTPError as error:
        raise _http_error(provider, error.code, error.read().decode("utf-8", errors="replace")) from error
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as error:
        raise _exception_error(provider, error) from error
    parsed = extract_json_dict(text)
    if parsed is None:
        raise _invalid(provider, "response could not be parsed as JSON.")
    return parsed


def call_llm_json(
    system_prompt: str,
    user_payload: dict[str, Any],
    provider: str,
    max_tokens: int = 1800,
    timeout_seconds: int = 30,
    temperature: float = 0.2,
) -> dict[str, Any] | None:
    """Like :func:`complete_json`, but ``None`` on any failure."""
    try:
        return complete_json(system_prompt, user_payload, provider, max_tokens, timeout_seconds, temperature)
    except LlmUnavailableError as error:
        if error.code != "provider_auth_error" or "missing" not in error.message:
            logger.warning("%s request failed (%s): %s", llm_provider_label(error.provider), error.code, error.message)
        return None


def call_llm_json_for_submission(
    system_prompt: str,
    user_payload: dict[str, Any],
    provider: str,
) -> tuple[dict[str, Any] | None, str, str, bool]:
    """``(data, error_code, error_message, retryable)`` for the narrator's retry loop."""
    try:
        timeout = 60 if provider == "gemma" else 30
        return complete_json(system_prompt, user_payload, provider, 1800, timeout, 0.2), "", "", False
    except LlmUnavailableError as error:
        return None, error.code, error.message, error.retryable


def stream_openai_text(
    system_prompt: str,
    user_payload: dict[str, Any],
    max_tokens: int = 1800,
    timeout_seconds: int = 90,
    temperature: float = 0.7,
) -> Iterator[str]:
    """Text deltas of a streamed OpenAI JSON completion; nothing when OpenAI has no key."""
    if not settings.coach_openai_api_key:
        return
    url = f"{settings.coach_openai_base_url.rstrip('/')}/chat/completions"
    body = {
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
    request = _request(url, body, {"Authorization": f"Bearer {settings.coach_openai_api_key}"})
    with _urlopen(request, timeout=timeout_seconds) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                delta = json.loads(data).get("choices", [{}])[0].get("delta", {}).get("content", "")
            except (json.JSONDecodeError, KeyError, IndexError, AttributeError):
                continue
            if delta:
                yield delta
