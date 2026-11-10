"""Small filesystem checks for the isolated Evolve run reader."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
import yaml

import evolve_service


class EvolveServiceTests(unittest.TestCase):
    def test_answer_round_resumes_parent_population_for_one_iteration(self):
        with TemporaryDirectory() as directory:
            runs_dir = Path(directory)
            parent_id = "20261023T120000Z-abcdef12"
            parent_dir = runs_dir / parent_id
            checkpoint = parent_dir / "results" / "checkpoints" / "checkpoint_3"
            (checkpoint / "programs").mkdir(parents=True)
            (checkpoint / "metadata.json").write_text(json.dumps({"last_iteration": 3, "best_program_id": "seed"}))
            (checkpoint / "programs" / "seed.json").write_text(json.dumps({
                "id": "seed", "code": "Existing prompt in population", "iteration_found": 2,
                "metrics": {"combined_score": 0.7},
            }))
            (parent_dir / "run.json").write_text(json.dumps({"id": parent_id, "status": "complete"}))
            process = MagicMock()
            process.pid = 12345
            process.poll.return_value = None
            context = [{"kind": "answer", "pattern": "Sliding Window", "correct": False,
                        "choice_text": "Move right", "previous_response": "Earlier question"}]
            with patch.object(evolve_service, "RUNS_DIR", runs_dir), \
                    patch.object(evolve_service, "overview", return_value={"ready": True, "runs": []}), \
                    patch.object(evolve_service, "_key", return_value="test-key"), \
                    patch.object(evolve_service.subprocess, "Popen", return_value=process) as popen, \
                    patch.object(evolve_service.threading, "Thread"):
                detail = evolve_service.start_run("Generate a fresh Sliding Window MCQ", context,
                                                  {"runId": parent_id, "candidateId": "seed"})
                command = popen.call_args.args[0]
                self.assertEqual(command[command.index("--checkpoint") + 1], str(checkpoint))
                self.assertEqual(command[command.index("--iterations") + 1], "1")
                config = yaml.safe_load(Path(command[command.index("--config") + 1]).read_text())
                message = config["prompt"]["system_message"]
                self.assertIn("Move right", message)
                self.assertIn("Earlier question", message)
                self.assertIn("reusable decision rule", message)
                self.assertEqual(detail["baseIteration"], 3)
                self.assertEqual(detail["iterations"], 1)
                self.assertEqual(detail["completedIterations"], 0)
                self.assertEqual([item["id"] for item in detail["candidates"]], ["seed"])
                evolve_service._processes.pop(detail["id"], None)

    def test_answer_is_saved_once_and_guides_next_run(self):
        with TemporaryDirectory() as directory:
            runs_dir = Path(directory)
            run_id = "20261023T120000Z-abcdef12"
            run_dir = runs_dir / run_id
            programs = run_dir / "results" / "checkpoints" / "checkpoint_1" / "programs"
            programs.mkdir(parents=True)
            (run_dir / "run.json").write_text(json.dumps({
                "id": run_id, "status": "complete", "startedAt": "2026-10-23T12:00:00Z",
                "finishedAt": "2026-10-23T12:02:00Z", "iterations": 3,
            }))
            preview = {"pattern": "Sliding Window", "skill": "Shrink left",
                       "nextProbe": "Update the sum after removing left",
                       "raw": "Generated question", "drill": {"correctChoiceId": "A",
                       "choices": [{"id": "A", "text": "Shrink from left"},
                                   {"id": "B", "text": "Move right"}]}}
            (programs / "seed.json").write_text(json.dumps({
                "id": "seed", "code": "Original prompt", "metrics": {"combined_score": 0.7},
                "artifacts_json": json.dumps({"mcq_previews": json.dumps([preview])}),
            }))
            with patch.object(evolve_service, "RUNS_DIR", runs_dir), \
                    patch.object(evolve_service, "_jev_key", return_value="test-key"), \
                    patch("jev_evaluator.judge_mcq") as judge, \
                    patch.object(evolve_service, "start_run", return_value={"id": "next"}) as start:
                answer = evolve_service.submit_answer(run_id, "seed", 0, "B")
                self.assertEqual(evolve_service.submit_answer(run_id, "seed", 0, "B"), answer)
                with self.assertRaisesRegex(ValueError, "already been answered"):
                    evolve_service.submit_answer(run_id, "seed", 0, "A")
                self.assertEqual(evolve_service.run_detail(run_id)["candidates"][0]["answers"], [answer])
                self.assertEqual(evolve_service.continue_with_answer(run_id, "seed"), {"id": "next"})

            judge.assert_not_called()
            self.assertNotIn("jev", answer)
            context = start.call_args.args[1]
            self.assertEqual(context[0]["kind"], "answer")
            self.assertEqual(context[0]["choice_id"], "B")
            self.assertNotIn("answer_signal", context[0])
            self.assertEqual(context[0]["previous_probe"], "Update the sum after removing left")
            self.assertEqual(context[0]["previous_response"], "Generated question")

    def test_clear_all_runs_removes_only_saved_ui_history(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            runs_dir = root / "ui-runs"
            runs_dir.mkdir()
            for suffix in ("abcdef12", "abcdef13"):
                run_dir = runs_dir / f"20261023T120000Z-{suffix}"
                run_dir.mkdir()
                (run_dir / "run.json").write_text(json.dumps({
                    "id": run_dir.name, "status": "complete",
                }))
                (run_dir / "reviews.json").write_text("[]")
            unrelated = root / "initial_prompt.txt"
            unrelated.write_text("Keep this seed prompt")

            with patch.object(evolve_service, "RUNS_DIR", runs_dir):
                self.assertEqual(evolve_service.clear_all_runs(), 2)
                self.assertEqual(evolve_service.clear_all_runs(), 0)

            self.assertFalse(runs_dir.exists())
            self.assertEqual(unrelated.read_text(), "Keep this seed prompt")

    def test_clear_all_runs_waits_for_active_run(self):
        with TemporaryDirectory() as directory:
            runs_dir = Path(directory) / "ui-runs"
            run_dir = runs_dir / "20261023T120000Z-abcdef12"
            run_dir.mkdir(parents=True)
            (run_dir / "run.json").write_text(json.dumps({
                "id": run_dir.name, "status": "running", "pid": 12345,
            }))

            with patch.object(evolve_service, "RUNS_DIR", runs_dir), \
                    patch.object(evolve_service, "_pid_exists", return_value=True):
                with self.assertRaisesRegex(RuntimeError, "Wait for the current evolution run"):
                    evolve_service.clear_all_runs()

            self.assertTrue((run_dir / "run.json").exists())

    def test_latest_checkpoint_exposes_prompt_lineage(self):
        with TemporaryDirectory() as directory:
            runs_dir = Path(directory)
            run_id = "20261023T120000Z-abcdef12"
            run_dir = runs_dir / run_id
            checkpoint = run_dir / "results" / "checkpoints" / "checkpoint_2"
            programs = checkpoint / "programs"
            programs.mkdir(parents=True)
            (run_dir / "run.json").write_text(json.dumps({
                "id": run_id, "status": "complete", "startedAt": "2026-10-23T12:00:00Z",
                "finishedAt": "2026-10-23T12:02:00Z", "iterations": 3,
            }))
            (run_dir / "initial_prompt.txt").write_text("Seed prompt")
            (checkpoint / "metadata.json").write_text(json.dumps({"best_program_id": "revision"}))
            for program in (
                {"id": "seed", "code": "Seed prompt", "iteration_found": 0,
                 "generation": 0, "metrics": {"combined_score": 0.5, "format_score": 0.65, "jev_score": 0.4},
                 "artifacts_json": json.dumps({"mcq_previews": json.dumps([{
                     "pattern": "Sliding Window", "skill": "Shrink left", "score": 0.5,
                     "raw": "model output", "drill": {"question": "What changes?"},
                     "jev": {"score": 0.4, "scores": {"grounded": 0.7, "distractors": 0.1}},
                 }])})},
                {"id": "revision", "code": "Better prompt", "iteration_found": 2,
                 "generation": 2, "parent_id": "seed", "metrics": {"combined_score": 0.8}},
            ):
                (programs / f"{program['id']}.json").write_text(json.dumps(program))

            with patch.object(evolve_service, "RUNS_DIR", runs_dir):
                detail = evolve_service.run_detail(run_id)

            self.assertEqual(detail["completedIterations"], 2)
            self.assertEqual([item["score"] for item in detail["candidates"]], [0.5, 0.8])
            self.assertEqual([item["isBest"] for item in detail["candidates"]], [False, True])
            self.assertEqual(detail["candidates"][1]["prompt"], "Better prompt")
            self.assertEqual(detail["candidates"][1]["nextProbe"], "")
            self.assertEqual(detail["candidates"][0]["previews"][0]["raw"], "model output")
            self.assertEqual(detail["candidates"][0]["jevScore"], 0.4)
            self.assertEqual(detail["candidates"][0]["formatScore"], 0.65)
            self.assertEqual(detail["candidates"][0]["jevCases"], [{
                "pattern": "Sliding Window", "scores": {"grounded": 0.7, "distractors": 0.1},
                "feedback": [],
            }])
            self.assertIsNone(detail["candidates"][1]["jevScore"])
            self.assertEqual(detail["candidates"][1]["jevCases"], [])
            self.assertEqual(detail["candidates"][1]["previews"], [])

    def test_invalid_run_id_cannot_read_outside_run_directory(self):
        with self.assertRaises(FileNotFoundError):
            evolve_service.run_detail("../../backend")

    def test_generate_preview_saves_and_reuses_result(self):
        with TemporaryDirectory() as directory:
            runs_dir = Path(directory)
            run_id = "20261023T120000Z-abcdef12"
            run_dir = runs_dir / run_id
            checkpoint = run_dir / "results" / "checkpoints" / "checkpoint_1"
            programs = checkpoint / "programs"
            programs.mkdir(parents=True)
            (run_dir / "run.json").write_text(json.dumps({
                "id": run_id, "status": "complete", "startedAt": "2026-10-23T12:00:00Z",
                "finishedAt": "2026-10-23T12:02:00Z", "iterations": 3,
            }))
            (checkpoint / "metadata.json").write_text(json.dumps({"best_program_id": "seed"}))
            (programs / "seed.json").write_text(json.dumps({
                "id": "seed", "code": "Generate questions", "metrics": {"combined_score": 0.7},
            }))
            previews = [{"pattern": "Sliding Window", "raw": "question output",
                         "nextProbe": "Track the left pointer after removal",
                         "jev": {"score": 0.7, "scores": {"one_correct": 0.9}}}]
            fake_result = SimpleNamespace(artifacts={"mcq_previews": json.dumps(previews)})
            with patch.object(evolve_service, "RUNS_DIR", runs_dir), patch.object(evolve_service, "_key", return_value="test-key"), \
                    patch("evaluator.evaluate_prompt", return_value=fake_result) as evaluate:
                self.assertEqual(evolve_service.generate_candidate_preview(run_id, "seed"), previews)
                self.assertEqual(evolve_service.generate_candidate_preview(run_id, "seed"), previews)
                candidate = evolve_service.run_detail(run_id)["candidates"][0]
                self.assertEqual(candidate["previews"], previews)
                self.assertEqual(candidate["nextProbe"], "Track the left pointer after removal")
                self.assertEqual(candidate["jevCases"], [{"pattern": "Sliding Window", "scores": {"one_correct": 0.9}, "feedback": []}])
                self.assertIsNone(candidate["jevScore"])
                evaluate.assert_called_once_with("Generate questions", api_key="test-key", reviews=[])

    def test_next_run_inherits_previous_answers_for_same_branch(self):
        with TemporaryDirectory() as directory:
            runs_dir = Path(directory)
            run_id = "20261023T120000Z-abcdef12"
            run_dir = runs_dir / run_id
            programs = run_dir / "results" / "checkpoints" / "checkpoint_1" / "programs"
            programs.mkdir(parents=True)
            (run_dir / "run.json").write_text(json.dumps({
                "id": run_id, "status": "complete", "startedAt": "2026-10-23T12:00:00Z",
                "finishedAt": "2026-10-23T12:02:00Z", "iterations": 3,
            }))
            inherited = [{"id": "prior", "kind": "answer", "pattern": "Sliding Window",
                          "choice_id": "B", "correct": False,
                          "answer_signal": {"kind": "window_state", "label": "window state"}}]
            (run_dir / "review_context.json").write_text(json.dumps(inherited))
            (run_dir / "answers.json").write_text(json.dumps([{
                "candidateId": "seed", "caseIndex": 0, "pattern": "Sliding Window",
                "choiceId": "A", "choiceText": "Shrink left", "correctChoiceId": "A",
                "correct": True, "jev": {"answerSignal": {"kind": "deepen", "label": "deeper"}},
            }]))
            (programs / "seed.json").write_text(json.dumps({
                "id": "seed", "code": "Current prompt", "metrics": {"combined_score": 0.7},
                "artifacts_json": json.dumps({"mcq_previews": json.dumps([{
                    "pattern": "Sliding Window", "skill": "Shrink left", "raw": "Current MCQ",
                }])}),
            }))
            with patch.object(evolve_service, "RUNS_DIR", runs_dir), \
                    patch.object(evolve_service, "_jev_key", return_value="test-jev-key"), \
                    patch.object(evolve_service, "start_run", return_value={"id": "next"}) as start:
                self.assertEqual(evolve_service.run_detail(run_id)["feedback"], inherited)
                evolve_service.continue_with_answer(run_id, "seed")

            context = start.call_args.args[1]
            self.assertEqual(context[0], inherited[0])
            self.assertEqual(context[1]["choice_id"], "A")
            self.assertNotIn("answer_signal", context[1])
            self.assertEqual(context[1]["previous_probe"], "")
            self.assertEqual(context[1]["previous_response"], "Current MCQ")
            self.assertEqual(context[1]["sourceRunId"], run_id)

    def test_feedback_context_is_passed_to_openevolve_evaluator(self):
        with TemporaryDirectory() as directory:
            fake_process = MagicMock()
            fake_process.pid = 12345
            fake_process.poll.return_value = None
            context = [{"pattern": "Sliding Window", "note": "Harder distractors"}]
            with patch.object(evolve_service, "RUNS_DIR", Path(directory)), \
                    patch.object(evolve_service, "overview", return_value={"ready": True, "runs": []}), \
                    patch.object(evolve_service, "_key", return_value="test-openai-key"), \
                    patch.object(evolve_service.subprocess, "Popen", return_value=fake_process) as popen, \
                    patch.object(evolve_service.threading, "Thread"):
                detail = evolve_service.start_run("Generate better MCQ questions", context)
                environment = popen.call_args.kwargs["env"]
                self.assertEqual(json.loads(Path(environment["EVOLVE_FEEDBACK_PATH"]).read_text()), context)
                self.assertEqual(detail["status"], "running")
                evolve_service._processes.pop(detail["id"], None)


if __name__ == "__main__":
    unittest.main()
