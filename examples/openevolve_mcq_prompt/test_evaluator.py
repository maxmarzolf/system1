"""Verify that scoring retains the actual model output for the Evolve UI."""

import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import types
import unittest
from unittest.mock import patch

import openevolve.evaluation_result  # Load OpenEvolve before temporary sys.modules patches.
import evaluator


class EvaluatorPreviewTests(unittest.TestCase):
    def test_evaluation_only_generates_a_sliding_window_card(self):
        drill = {
            "id": "slide-1", "title": "Window sum", "pattern": "Sliding Window",
            "skill": "Shrink the window from the left when the sum is too large",
            "difficulty": "Med.", "question": "When the window sum is too large, which side moves?",
            "choices": [
                {"id": "A", "text": "Shrink from the left"},
                {"id": "B", "text": "Move only the right side"},
                {"id": "C", "text": "Reset the sum"},
                {"id": "D", "text": "Return immediately"},
            ],
            "correctChoiceId": "A",
            "explanation": "Shrink from the left until the sum fits the bound.",
            "tags": ["skill-map", "skill-map-mcq", "sliding-window"],
        }
        requests = []

        def create(**kwargs):
            requests.append(json.loads(kwargs["messages"][1]["content"]))
            return types.SimpleNamespace(choices=[types.SimpleNamespace(
                message=types.SimpleNamespace(content=json.dumps({"nextProbe": "Update the sum after a left removal.", "drills": [drill]})))])

        fake_openai = types.SimpleNamespace(OpenAI=lambda **_kwargs: types.SimpleNamespace(
            chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create))))
        with TemporaryDirectory() as directory:
            prompt = Path(directory) / "prompt.txt"
            prompt.write_text("Generate an MCQ")
            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}), patch.dict(sys.modules, {"openai": fake_openai}):
                result = evaluator.evaluate(str(prompt))

        previews = json.loads(result.artifacts["mcq_previews"])
        self.assertEqual(len(previews), 1)
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0]["skillMap"][0]["pattern"], "Sliding Window")
        self.assertEqual(requests[0]["answerHistory"], [])
        self.assertEqual(previews[0]["drill"], drill)
        self.assertEqual(previews[0]["nextProbe"], "Update the sum after a left removal.")
        self.assertEqual(result.metrics["combined_score"], 1.0)

    def test_invalid_single_response_scores_zero(self):
        response = types.SimpleNamespace(choices=[types.SimpleNamespace(
            message=types.SimpleNamespace(content="not JSON"))])
        fake_openai = types.SimpleNamespace(OpenAI=lambda **_kwargs: types.SimpleNamespace(
            chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=lambda **_kwargs: response))))
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "TYPESAFE_API_KEY": "", "EVOLVE_FEEDBACK_PATH": ""}), \
                patch.dict(sys.modules, {"openai": fake_openai}):
            result = evaluator.evaluate_prompt("Generate a Sliding Window MCQ")
        previews = json.loads(result.artifacts["mcq_previews"])
        self.assertEqual(len(previews), 1)
        self.assertEqual(previews[0]["raw"], "not JSON")
        self.assertIsNone(previews[0]["drill"])
        self.assertEqual(result.metrics["combined_score"], 0.0)

    def test_jev_score_is_part_of_openevolve_metric(self):
        response_text = json.dumps({"nextProbe": "Decide which boundary moves next.", "drills": [{
            "id": "one", "title": "Check the boundary", "pattern": "Sliding Window",
            "skill": "Shrink the window from the left when the sum is too large",
            "difficulty": "Med.", "question": "Which window boundary should move?",
            "choices": [{"id": key, "text": value} for key, value in zip("ABCD", (
                "Shrink left", "Expand right", "Reset both", "Stop now"))],
            "correctChoiceId": "A", "explanation": "Shrink from the left when the sum is too large.",
            "tags": ["skill-map", "skill-map-mcq", "sliding-window"],
        }]})
        response = types.SimpleNamespace(choices=[types.SimpleNamespace(
            message=types.SimpleNamespace(content=response_text))])
        requests = []
        def create(**kwargs):
            requests.append(json.loads(kwargs["messages"][1]["content"]))
            return response
        fake_openai = types.SimpleNamespace(OpenAI=lambda **_kwargs: types.SimpleNamespace(
            chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create))))
        jev_result = {"model": "jev-latest", "score": 0.8, "scores": {"grounded": 0.8}}
        with TemporaryDirectory() as directory:
            prompt = Path(directory) / "prompt.txt"
            prompt.write_text("Generate an MCQ")
            review_path = Path(directory) / "reviews.json"
            review_path.write_text(json.dumps([{"pattern": "Sliding Window", "rating": "needs_work",
                                                "note": "Make distractors more plausible",
                                                "previous_prompt": "Generate an MCQ",
                                                "previous_response": "The old question",
                                                "review_jev": {"score": 0.4, "scores": {"distractors": 0.2}}},
                                               {"kind": "answer", "pattern": "Sliding Window",
                                                "choice_text": "Move right", "correct_choice_id": "A",
                                                "correct": False, "previous_probe": "Move left",
                                                "previous_response": response_text}]))
            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "TYPESAFE_API_KEY": "test-jev-key",
                                              "EVOLVE_FEEDBACK_PATH": str(review_path)}), \
                    patch.dict(sys.modules, {"openai": fake_openai}), \
                    patch("jev_evaluator.judge_mcq", return_value=jev_result) as judge:
                result = evaluator.evaluate(str(prompt))

        self.assertEqual(judge.call_count, 1)
        self.assertEqual(result.metrics["jev_score"], 0.8)
        self.assertAlmostEqual(result.metrics["combined_score"],
                               round(0.4 * result.metrics["format_score"] + 0.6 * 0.8, 4), places=4)
        self.assertIn("evaluation_notes", result.artifacts)
        notes = json.loads(result.artifacts["evaluation_notes"])
        self.assertEqual(notes["human_reviews"][0]["review_jev"]["scores"]["distractors"], 0.2)
        self.assertEqual(notes["human_reviews"][0]["previous_response"], "The old question")
        self.assertEqual(requests[0]["priorQuestions"][0]["question"], "Which window boundary should move?")
        self.assertEqual(requests[0]["priorQuestions"][0]["selectedChoice"], "Move right")
        self.assertEqual(requests[0]["answerHistory"], requests[0]["priorQuestions"])


if __name__ == "__main__":
    unittest.main()
