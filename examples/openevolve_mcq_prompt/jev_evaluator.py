"""TypeSafe Jev judge for the soundness and purpose of generated MCQs."""

from __future__ import annotations

import json
import os
import re
from urllib.request import Request, urlopen


JEV_URL = "https://api.typesafe.ai/v1/systemone"
JEV_MODEL = "jev-latest"


def proposed_probe(prompt: str) -> str:
    """Read a probe from a historical, fixed-probe prompt."""
    match = re.search(r"^NEXT_PROBE:\s*(.+?)\s*$", prompt, re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip() if match else ""


def response_probe(raw: str) -> str:
    """Read the probe chosen by a reusable prompt for this answer history."""
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return ""
    value = payload.get("nextProbe") if isinstance(payload, dict) else None
    return value.strip() if isinstance(value, str) else ""


def judge_mcq(prompt: str, case: dict, raw: str, reviews: list[dict] | None = None,
              api_key: str | None = None) -> dict:
    key = api_key or os.getenv("TYPESAFE_API_KEY", "").strip()
    if not key:
        raise RuntimeError("Set TYPESAFE_API_KEY before using Jev")

    related = [review for review in reviews or [] if review.get("pattern") == case["pattern"]]
    from evaluator import answer_history
    history = answer_history(related)
    questions = {
        "grounded": {"type": "noul", "instructions":
            "Is the generated MCQ specifically grounded in the requested Sliding Window skill?"},
        "one_correct": {"type": "noul", "instructions":
            "Does the MCQ have exactly one defensibly correct answer among its choices?"},
        "distractors": {"type": "noul", "instructions":
            "Are the incorrect choices plausible mistakes for this skill?"},
        "explanation": {"type": "noul", "instructions":
            "Does the explanation accurately justify the correct choice and teach the decision?"},
        "policy_use": {"type": "noul", "instructions":
            "Does generation_prompt give a reusable rule for choosing nextProbe from the input's answerHistory, "
            "and does the generated response follow that rule? A fixed probe written into the prompt "
            "is not a reusable rule. If nextProbe is empty, answer no."},
        "probe_choice": {"type": "noul", "instructions":
            "Does proposed_probe name a specific, useful NEXT Sliding Window reasoning decision, "
            "chosen with the observed answer history in mind? With no history, judge specificity and usefulness. "
            "A correct answer alone does not prove mastery or demand greater difficulty. "
            "If proposed_probe is empty, answer no. Judge the proposal, "
            "not a supposed diagnosis of the learner."},
        "probe_alignment": {"type": "noul", "instructions":
            "Does solving the generated MCQ actually require the specific proposed_probe decision, "
            "rather than merely mentioning it or asking the generic move-left rule? If proposed_probe "
            "is empty, answer no."},
    }
    if history:
        questions["novelty"] = {"type": "noul", "instructions":
            "Compared with the prior generated questions in answer_history, does this MCQ test a "
            "materially different reasoning decision? Changed numbers, setting, or wording alone do not count. "
            "Judge the generated MCQ, not a promise in the prompt."}

    payload = {
        "model": JEV_MODEL,
        "state": {
            "generation_prompt": prompt,
            "proposed_probe": response_probe(raw),
            "requested_case": {"pattern": case["pattern"], "skill": case["skill"]},
            "generated_response": raw,
            "answer_history": history,
            "human_reviews": [item for item in related[-3:] if item.get("kind") != "answer"],
        },
        "questions": questions,
    }
    request = Request(
        JEV_URL, data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=30) as response:
        result = json.load(response)

    answers = result.get("answers") if isinstance(result, dict) else None
    if not isinstance(answers, dict):
        raise ValueError("Jev returned no answers")
    scores = {}
    for name in questions:
        answer = answers.get(name)
        probability = answer.get("noul") if isinstance(answer, dict) else None
        if isinstance(probability, bool) or not isinstance(probability, (int, float)) or not 0 <= probability <= 1:
            raise ValueError(f"Jev returned an invalid answer for {name}")
        scores[name] = round(float(probability), 4)
    return {
        "model": result.get("model", JEV_MODEL),
        "score": round(sum(scores.values()) / len(scores), 4),
        "scores": scores,
        "feedback": [],
    }
