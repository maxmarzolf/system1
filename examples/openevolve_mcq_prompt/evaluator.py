"""Evaluate an MCQ-generation prompt on one Sliding Window example."""

import json
import os
from pathlib import Path
import sys


EXAMPLE_DIR = Path(__file__).resolve().parent
if str(EXAMPLE_DIR) not in sys.path:
    sys.path.insert(0, str(EXAMPLE_DIR))


MODEL = "gpt-5.4-mini"
CASES = [
    {
        "pattern": "Sliding Window",
        "skill": "Shrink the window from the left when the sum is too large",
        "patternSlug": "sliding-window",
        "question_terms": ("window", "sum", "left"),
    },
]


def answer_history(reviews: list[dict]) -> list[dict]:
    """Keep the recent answers and the actual questions available to both models."""
    history = []
    for item in [entry for entry in reviews if entry.get("kind") == "answer"][-3:]:
        try:
            response = json.loads(item.get("previous_response") or "{}")
        except (TypeError, json.JSONDecodeError):
            response = {}
        drills = response.get("drills") if isinstance(response, dict) else None
        drill = drills[0] if isinstance(drills, list) and drills and isinstance(drills[0], dict) else {}
        choices = drill.get("choices") if isinstance(drill.get("choices"), list) else []
        correct_text = next((choice.get("text") for choice in choices if isinstance(choice, dict)
                             and choice.get("id") == item.get("correct_choice_id")), None)
        history.append({
            "question": drill.get("question") or item.get("previous_response", ""),
            "selectedChoice": item.get("choice_text"),
            "correctChoice": correct_text,
            "correct": item.get("correct"),
            "previousProbe": item.get("previous_probe", ""),
        })
    return history


def _score_drill(drill: object, case: dict) -> float:
    if not isinstance(drill, dict):
        return 0.0

    required = ("id", "title", "pattern", "skill", "difficulty", "question", "correctChoiceId", "explanation")
    score = 0.15 if all(isinstance(drill.get(key), str) and drill[key].strip() for key in required) else 0.0

    if (drill.get("pattern"), drill.get("skill"), drill.get("difficulty")) == (
        case["pattern"], case["skill"], "Med."
    ):
        score += 0.20

    choices = drill.get("choices")
    correct_text = ""
    if isinstance(choices, list) and len(choices) == 4 and all(isinstance(choice, dict) for choice in choices):
        ids = [choice.get("id") for choice in choices]
        texts = [choice.get("text") for choice in choices]
        if (
            all(isinstance(choice_id, str) for choice_id in ids)
            and set(ids) == {"A", "B", "C", "D"}
            and all(isinstance(text, str) and text.strip() for text in texts)
            and len({text.strip().lower() for text in texts}) == 4
            and drill.get("correctChoiceId") in ids
        ):
            score += 0.25
            correct_text = choices[ids.index(drill["correctChoiceId"])]["text"].lower()

    question = str(drill.get("question") or "").lower()
    if "?" in question and any(term in question for term in case["question_terms"]):
        score += 0.10
    if correct_text:
        score += 0.15

    explanation = str(drill.get("explanation") or "").lower()
    if len(explanation) >= 25:
        score += 0.10

    tags = drill.get("tags")
    if (
        isinstance(tags, list)
        and all(isinstance(tag, str) for tag in tags)
        and {"skill-map", "skill-map-mcq", case["patternSlug"]}.issubset(tags)
    ):
        score += 0.05
    return round(score, 4)


def evaluate(program_path: str):
    prompt = Path(program_path).read_text(encoding="utf-8").strip()
    return evaluate_prompt(prompt)


def evaluate_prompt(prompt: str, api_key: str | None = None, reviews: list[dict] | None = None):
    from openevolve.evaluation_result import EvaluationResult

    key = api_key or os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("Set OPENAI_API_KEY before evaluating MCQ prompts")

    from openai import OpenAI

    if not prompt:
        return EvaluationResult(metrics={"combined_score": 0.0})

    client = OpenAI(api_key=key, timeout=30.0, max_retries=0)
    scores = []
    format_scores = []
    jev_scores = []
    previews = []
    review_path = os.getenv("EVOLVE_FEEDBACK_PATH")
    if reviews is None:
        reviews = json.loads(Path(review_path).read_text(encoding="utf-8")) if review_path else []
    if not isinstance(reviews, list):
        raise ValueError("EVOLVE_FEEDBACK_PATH must contain a list of reviews")
    use_jev = bool(os.getenv("TYPESAFE_API_KEY", "").strip())
    if reviews and not use_jev:
        raise RuntimeError("TYPESAFE_API_KEY is required for an answer-guided run")
    for case in CASES:
        request = {
            "questionType": "skill-map-mcq",
            "count": 1,
            "difficulty": "Med.",
            "sourceMode": "skill-map",
            "flowMode": "random",
            "skillMap": [{"pattern": case["pattern"], "methods": [case["skill"]], "patternSlug": case["patternSlug"]}],
        }
        prior_questions = answer_history([item for item in reviews if item.get("pattern") == case["pattern"]])
        request["answerHistory"] = prior_questions
        if prior_questions:
            request["priorQuestions"] = prior_questions
        response = client.chat.completions.create(
            model=MODEL,
            reasoning_effort="none",
            max_completion_tokens=1200,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(request)},
            ],
        )
        raw = response.choices[0].message.content or ""
        drill = None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = None
        drills = payload.get("drills") if isinstance(payload, dict) else None
        next_probe = payload.get("nextProbe") if isinstance(payload, dict) else None
        next_probe = next_probe.strip() if isinstance(next_probe, str) else ""
        if isinstance(drills, list) and len(drills) == 1 and isinstance(drills[0], dict):
            drill = drills[0]
        format_score = round(0.9 * _score_drill(drill, case)
                             + 0.1 * (1 if 8 <= len(next_probe) <= 300 else 0), 4)
        jev = None
        if use_jev and drill:
            from jev_evaluator import judge_mcq
            jev = judge_mcq(prompt, case, raw, reviews)
        jev_score = jev["score"] if jev else 0.0
        score = round(0.4 * format_score + 0.6 * jev_score, 4) if use_jev else format_score
        scores.append(score)
        format_scores.append(format_score)
        if use_jev:
            jev_scores.append(jev_score)
        previews.append({
            "pattern": case["pattern"],
            "skill": case["skill"],
            "score": score,
            "raw": raw,
            "drill": drill,
            "nextProbe": next_probe,
            "jev": jev,
        })

    metrics = {
        "combined_score": round(sum(scores) / len(scores), 4),
        "format_score": round(sum(format_scores) / len(format_scores), 4),
    }
    if use_jev:
        metrics["jev_score"] = round(sum(jev_scores) / len(jev_scores), 4)
    notes = {
        "answer_history": answer_history(reviews),
        "human_reviews": [{"id": item.get("id"), "pattern": item.get("pattern"), "skill": item.get("skill"),
                           "rating": item.get("rating"), "note": item.get("note", ""),
                           "previous_prompt": item.get("previous_prompt"),
                           "previous_response": item.get("previous_response"),
                           "review_jev": item.get("review_jev")} for item in reviews[-3:] if item.get("kind") != "answer"],
        "jev_feedback": [{"pattern": item["pattern"], "scores": item["jev"]["scores"],
                          "feedback": item["jev"].get("feedback", [])}
                         for item in previews if item["jev"]],
    }
    return EvaluationResult(
        metrics=metrics,
        artifacts={"mcq_previews": json.dumps(previews), "evaluation_notes": json.dumps(notes)},
    )


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("initial_prompt.txt")
    result = evaluate(str(path))
    print(result.metrics)
    for preview in json.loads(result.artifacts.get("mcq_previews", "[]")):
        print(f"\n{preview['pattern']}:\n{preview['raw']}")
