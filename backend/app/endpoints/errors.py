"""App-wide exception handlers: domain errors become HTTP responses here, nowhere else."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.contracts.errors import LlmUnavailableError, provider_label


async def _llm_unavailable(_request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, LlmUnavailableError)
    return JSONResponse(
        status_code=503,
        content={
            "detail": {
                "code": error.code,
                "message": error.message,
                "provider": error.provider,
                "providerLabel": provider_label(error.provider),
                "apiErrorCode": error.api_error_code,
            }
        },
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(LlmUnavailableError, _llm_unavailable)
