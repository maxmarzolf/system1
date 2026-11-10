"""Validate Jev's question and next-probe evaluation payload."""

import io
import json
import unittest
from unittest.mock import patch

import jev_evaluator


class JevEvaluatorTests(unittest.TestCase):
    def test_answer_history_adds_novelty_without_classifying_the_learner(self):
        captured = {}

        def fake_urlopen(request, timeout):
            captured["payload"] = json.loads(request.data)
            captured["authorization"] = request.get_header("Authorization")
            captured["timeout"] = timeout
            answers = {name: {"type": "noul", "noul": 0.8}
                       for name in captured["payload"]["questions"]}
            return io.BytesIO(json.dumps({"model": "jev-test", "answers": answers}).encode())

        history = {"kind": "answer", "pattern": "Sliding Window", "correct": True,
                   "choice_id": "A", "previous_response": "Earlier MCQ"}
        prompt = "Choose nextProbe from answerHistory and generate one MCQ."
        raw = json.dumps({"nextProbe": "Decide whether to shrink again after the first removal.",
                          "drills": []})
        with patch.object(jev_evaluator, "urlopen", side_effect=fake_urlopen):
            result = jev_evaluator.judge_mcq(prompt, {"pattern": "Sliding Window", "skill": "Shrink left"},
                                             raw, reviews=[history], api_key="test-key")

        state = captured["payload"]["state"]
        self.assertEqual(state["proposed_probe"], "Decide whether to shrink again after the first removal.")
        self.assertEqual(state["answer_history"][0]["question"], "Earlier MCQ")
        self.assertTrue(state["answer_history"][0]["correct"])
        self.assertNotIn("answer_signal", state["answer_history"][0])
        self.assertEqual(state["generated_response"], raw)
        self.assertEqual(captured["authorization"], "Bearer test-key")
        self.assertIn("novelty", captured["payload"]["questions"])
        self.assertIn("policy_use", captured["payload"]["questions"])
        self.assertIn("probe_alignment", captured["payload"]["questions"])
        self.assertTrue(all(question["type"] == "noul" for question in captured["payload"]["questions"].values()))
        self.assertNotIn("learner_answer", state)
        self.assertEqual(result["score"], 0.8)
        self.assertEqual(result["feedback"], [])

    def test_first_question_has_no_novelty_comparison(self):
        def fake_urlopen(request, timeout):
            questions = json.loads(request.data)["questions"]
            return io.BytesIO(json.dumps({"answers": {
                name: {"type": "noul", "noul": 0.7} for name in questions
            }}).encode())

        with patch.object(jev_evaluator, "urlopen", side_effect=fake_urlopen):
            result = jev_evaluator.judge_mcq("Choose nextProbe from answerHistory.\n",
                                             {"pattern": "Sliding Window", "skill": "Shrink left"},
                                             json.dumps({"nextProbe": "Track the sum after removing left."}),
                                             api_key="test-key")
        self.assertNotIn("novelty", result["scores"])
        self.assertIn("probe_choice", result["scores"])

    def test_historical_written_reviews_remain_readable(self):
        captured = {}

        def fake_urlopen(request, timeout):
            captured["payload"] = json.loads(request.data)
            return io.BytesIO(json.dumps({"answers": {
                name: {"type": "noul", "noul": 0.6}
                for name in captured["payload"]["questions"]
            }}).encode())

        review = {"kind": "review", "pattern": "Sliding Window", "note": "Old written feedback"}
        with patch.object(jev_evaluator, "urlopen", side_effect=fake_urlopen):
            jev_evaluator.judge_mcq("Old prompt", {"pattern": "Sliding Window", "skill": "Shrink left"},
                                    "MCQ", reviews=[review], api_key="test-key")
        self.assertEqual(captured["payload"]["state"]["human_reviews"], [review])
        self.assertEqual(captured["payload"]["state"]["proposed_probe"], "")
        self.assertNotIn("novelty", captured["payload"]["questions"])
