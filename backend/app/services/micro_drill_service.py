from __future__ import annotations

import asyncio
import re

from app.core.llm import call_llm_json, llm_provider_available, resolve_available_llm_provider
from app.models import FlowMicroDrillRequest, FlowMicroDrillResponse


class MicroDrillGenerationError(RuntimeError):
    pass


async def generate_flow_micro_drill(body: FlowMicroDrillRequest) -> FlowMicroDrillResponse:
    provider = resolve_available_llm_provider(body.llmProvider)
    if not llm_provider_available(provider):
        raise MicroDrillGenerationError("Configure a model provider to generate microdrills.")
    prompt = (
        "Create one self-contained coding reinforcement microdrill based on the supplied card and focus. "
        "Vary the scenario for this rep while preserving the core skill. Return strict JSON with "
        "prompt (a short task, no answers), language, template (raw code, no fences), and answers "
        "(an ordered array of strings, one per blank). Use exactly three underscores for each blank, "
        "and 1-4 blanks total. Each answer must fit on one line. Keep the template under 30 lines. "
        "Replacing blanks in order with answers must produce the correct complete solution. "
        "Do not use triple underscores anywhere else. No explanation field."
    )
    try:
        result = await asyncio.to_thread(call_llm_json, prompt, body.model_dump(), provider, 1800, 45, 0.7)
    except Exception as error:
        raise MicroDrillGenerationError("Microdrill generation failed. Try again.") from error
    if not isinstance(result, dict):
        raise MicroDrillGenerationError("Microdrill generation returned no result. Try again.")
    template = result.get("template", "")
    answers = result.get("answers", [])
    task = result.get("prompt", "")
    if (
        not isinstance(template, str) or not isinstance(task, str) or not task.strip()
        or not isinstance(answers, list) or not 1 <= len(answers) <= 4
        or len(re.findall(r"_{3,}", template)) != len(answers)
        or "```" in template or len(template.splitlines()) > 40
        or any(not isinstance(answer, str) or not answer.strip() or "\n" in answer or "\r" in answer for answer in answers)
    ):
        raise MicroDrillGenerationError("The generated microdrill was incomplete. Try again.")
    template = template.rstrip("\r\n")
    replacements = iter(answers)
    solution = re.sub(r"_{3,}", lambda _: next(replacements), template)
    return FlowMicroDrillResponse(prompt=task.strip(), template=template, solution=solution, language=str(result.get("language") or "python"))
