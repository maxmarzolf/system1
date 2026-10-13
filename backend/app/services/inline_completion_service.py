from __future__ import annotations

import asyncio

from fastapi import HTTPException

from app.core.llm import call_llm_json, llm_provider_available, resolve_available_llm_provider
from app.models import InlineCompletionRequest, InlineCompletionResponse


_SYSTEM_PROMPT = (
    "You provide short inline code completions at the cursor in a coding practice editor. "
    "Use the task and surrounding code to continue the learner's own approach. "
    "Return JSON with one key, completion, containing only the code to insert at the cursor. "
    "Usually complete the current line or the next one or two lines. "
    "Preserve indentation and syntax. Do not repeat code before or after the cursor, "
    "and do not include markdown, explanations, or a complete solution unless the existing code requires it. "
    "If there is no useful continuation, return an empty completion."
)


async def generate_inline_completion(body: InlineCompletionRequest) -> InlineCompletionResponse:
    if not body.prefix.strip():
        return InlineCompletionResponse()

    provider = resolve_available_llm_provider(body.llmProvider)
    if not llm_provider_available(provider):
        raise HTTPException(status_code=503, detail="Configure a model provider for AI code completion.")

    payload = {
        "language": body.language,
        "cardTitle": body.cardTitle,
        "task": body.prompt,
        "codeBeforeCursor": body.prefix,
        "codeAfterCursor": body.suffix,
    }
    try:
        result = await asyncio.to_thread(call_llm_json, _SYSTEM_PROMPT, payload, provider, 300, 20, 0.2)
    except Exception as error:
        raise HTTPException(status_code=502, detail="AI code completion is unavailable right now.") from error
    if not isinstance(result, dict):
        return InlineCompletionResponse()
    prediction = result.get("completion")
    if not isinstance(prediction, str) or "```" in prediction:
        return InlineCompletionResponse()
    return InlineCompletionResponse(prediction=prediction[:600])
