"""Errors any layer may raise and the HTTP layer maps to responses."""

from __future__ import annotations


class LlmUnavailableError(RuntimeError):
    """An LLM call that could not produce a usable answer. ``code`` names why."""

    def __init__(self, code: str, message: str, provider: str, api_error_code: str = "", retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.provider = provider
        self.api_error_code = api_error_code
        self.retryable = retryable


PROVIDER_LABELS = {"claude": "Claude", "gemma": "Gemma"}


def provider_label(provider: str) -> str:
    return PROVIDER_LABELS.get(provider, "ChatGPT")
