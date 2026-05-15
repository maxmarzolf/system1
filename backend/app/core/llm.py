from __future__ import annotations

import json
import logging
import re
import ssl
import urllib.error
import urllib.request
from typing import Any

from app.config import settings

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


def _ssl_context() -> ssl.SSLContext | None:
    if certifi is None:
        return None
    return ssl.create_default_context(cafile=certifi.where())


def _urlopen(request: urllib.request.Request, timeout: int):
    context = _ssl_context()
    if context is None:
        return urllib.request.urlopen(request, timeout=timeout)
    return urllib.request.urlopen(request, timeout=timeout, context=context)


def llm_provider_label(provider: str) -> str:
    if provider == "claude":
        return "Claude"
    if provider == "gemma":
        return "Gemma"
    return "ChatGPT"


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
    chain = [requested, configured, "gemma", "claude", "openai"]
    ordered: list[str] = []
    for provider in chain:
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


def extract_json_dict(value: str) -> dict[str, Any] | None:
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


def call_openai_json(
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
        "messages": [
            {"role": "system", "content": f"{system_prompt}\nReturn only valid JSON. Do not include markdown."},
            {"role": "user", "content": json.dumps(user_payload)},
        ],
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    def post_completion(payload_body: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload_body).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {settings.coach_openai_api_key}",
                "Content-Type": "application/json",
            },
        )
        with _urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)

    try:
        payload = post_completion(body)
        content = payload["choices"][0]["message"]["content"]
        return extract_json_dict(content)
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
                return extract_json_dict(content)
            except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as fallback_error:
                logger.warning("OpenAI fallback request failed: %s", fallback_error)
                return None
        logger.warning("OpenAI request failed (%s): %s", error.code, details[:400])
        return None
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as error:
        logger.warning("OpenAI request failed: %s", error)
        return None


def call_claude_json(system_prompt: str, user_payload: dict[str, Any], max_tokens: int = 1800) -> dict[str, Any] | None:
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
        request = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={
                "x-api-key": settings.coach_anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        try:
            with _urlopen(request, timeout=30) as response:
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
                parsed = extract_json_dict("\n".join(text_parts))
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


def call_gemma_json(system_prompt: str, user_payload: dict[str, Any], max_tokens: int = 1800) -> dict[str, Any] | None:
    if not settings.coach_gemma_api_key:
        return None

    model = str(settings.coach_gemma_model or "").strip() or "gemma-4-31b-it"
    url = f"{settings.coach_gemma_base_url.rstrip('/')}/models/{model}:generateContent?key={settings.coach_gemma_api_key}"
    prompt = f"{system_prompt}\nReturn only valid JSON. Do not include markdown.\n\n{json.dumps(user_payload)}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": max_tokens, "responseMimeType": "application/json"},
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with _urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            candidates = payload.get("candidates", [])
            if candidates and isinstance(candidates, list):
                parts = candidates[0].get("content", {}).get("parts", [])
                text_parts = [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("text")]
                if text_parts:
                    return extract_json_dict("\n".join(text_parts))
            return None
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as error:
        logger.warning("Gemma request failed: %s", error)
        return None


def call_llm_json(
    system_prompt: str,
    user_payload: dict[str, Any],
    provider: str,
    max_tokens: int = 1800,
    timeout_seconds: int = 30,
    temperature: float = 0.2,
) -> dict[str, Any] | None:
    if provider == "claude":
        return call_claude_json(system_prompt, user_payload, max_tokens)
    if provider == "gemma":
        return call_gemma_json(system_prompt, user_payload, max_tokens)
    return call_openai_json(system_prompt, user_payload, max_tokens, timeout_seconds, temperature)