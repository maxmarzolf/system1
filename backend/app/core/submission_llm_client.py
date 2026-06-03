from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from app.config import settings
from app.core.llm import extract_json_dict as _extract_json_dict
from app.core.llm import llm_provider_label as _llm_provider_label
from app.domain.llm_resilience import (
    submission_provider_error_from_exception,
    submission_provider_error_from_http,
)

logger = logging.getLogger(__name__)


def call_llm_json_for_submission(
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
        code, message, retryable = submission_provider_error_from_http(
            _llm_provider_label(provider),
            error.code,
            details,
        )
        logger.warning("%s request failed (%s): %s", _llm_provider_label(provider), error.code, details[:400])
        return None, code, message, retryable
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError) as error:
        code, message, retryable = submission_provider_error_from_exception(
            _llm_provider_label(provider),
            error,
        )
        logger.warning("%s request failed: %s", _llm_provider_label(provider), error)
        return None, code, message, retryable
