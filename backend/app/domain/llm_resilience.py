from __future__ import annotations

import json
import urllib.error

from fastapi import HTTPException


SUBMISSION_LLM_MAX_RETRIES = 3
SUBMISSION_LLM_RETRY_DELAYS_SECONDS = (0.3, 0.6, 0.9)


class SubmissionFeedbackUnavailableError(RuntimeError):
    def __init__(self, code: str, message: str, provider: str, api_error_code: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.provider = provider
        self.api_error_code = api_error_code


def submission_feedback_error_detail(
    code: str,
    message: str,
    provider: str,
    provider_label: str,
    api_error_code: str = "",
) -> dict[str, str]:
    return {
        "code": code,
        "message": message,
        "provider": provider,
        "providerLabel": provider_label,
        "apiErrorCode": api_error_code,
    }


def coach_llm_http_exception(
    error: SubmissionFeedbackUnavailableError,
    provider_label: str,
) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=submission_feedback_error_detail(
            error.code,
            error.message,
            error.provider,
            provider_label,
            error.api_error_code,
        ),
    )


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


def submission_provider_error_from_http(
    provider_label: str,
    status_code: int,
    payload_text: str,
) -> tuple[str, str, bool]:
    detail = extract_provider_error_message(payload_text)
    detail_lower = detail.lower()

    if "credit balance is too low" in detail_lower or "insufficient" in detail_lower and "credit" in detail_lower:
        return (
            "provider_insufficient_credits",
            f"{provider_label} API error: insufficient credits. Add credits in your provider billing and try again.",
            False,
        )
    if status_code in {401, 403} or "api key" in detail_lower or "authentication" in detail_lower:
        return (
            "provider_auth_error",
            f"{provider_label} API error: authentication failed. Verify the API key in backend .env.",
            False,
        )
    if status_code == 429 or "rate" in detail_lower and "limit" in detail_lower:
        return (
            "provider_rate_limited",
            f"{provider_label} API error: rate limited. Please retry in a moment.",
            True,
        )
    if status_code in {400, 404} and "model" in detail_lower:
        return (
            "provider_model_error",
            f"{provider_label} API error: model configuration is invalid or unavailable.",
            False,
        )

    if status_code >= 500:
        return (
            "provider_server_error",
            f"{provider_label} API error: upstream service issue ({status_code}). Please retry shortly.",
            True,
        )

    if detail:
        return (
            "provider_request_error",
            f"{provider_label} API error: {detail}",
            False,
        )
    return (
        "provider_request_error",
        f"{provider_label} API error: request failed with status {status_code}.",
        False,
    )


def submission_provider_error_from_exception(
    provider_label: str,
    error: Exception,
) -> tuple[str, str, bool]:
    if isinstance(error, TimeoutError):
        return (
            "provider_timeout",
            f"{provider_label} API error: request timed out. Please retry.",
            True,
        )
    if isinstance(error, urllib.error.URLError):
        reason = str(getattr(error, "reason", "")).strip()
        detail = f" ({reason})" if reason else ""
        return (
            "provider_network_error",
            f"{provider_label} API error: network/connectivity issue{detail}.",
            True,
        )
    return (
        "provider_unknown_error",
        f"{provider_label} API error: unexpected request failure.",
        True,
    )
