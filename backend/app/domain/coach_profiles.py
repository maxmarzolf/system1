from __future__ import annotations

from typing import Any


LIVE_STAGE_ORDER = {"early": 0, "mid": 1, "late": 2, "very-late": 3}
LIVE_FEEDBACK_FREQUENCIES = {"more-often", "balanced", "less-often"}
LIVE_TUNING_DEFAULTS: dict[str, Any] = {
    "focusMode": "memorization",
    "tone": "calm",
    "singleIssue": True,
    "showPatternNames": False,
    "specificitySource": "time-and-quality",
    "feedbackFrequency": "balanced",
    "allowExactEditsWhenStuck": True,
    "canonicalAnswerStage": "late",
    "affirmationMode": "stable-only",
    "driftThresholdAttempts": 3,
    "stallThresholdSeconds": 40,
}

SUBMISSION_DIMENSION_LABELS = {
    "contract": "Problem contract",
    "pattern": "Core pattern",
    "state": "State representation",
    "control_flow": "Control flow shape",
    "invariant": "Decision rule",
    "state_updates": "State update correctness",
    "ordering": "Step ordering",
    "answer_path": "Answer recording or return path",
    "edge_cases": "Edge-case coverage",
    "recall_fidelity": "Recall fidelity",
    "executability": "Syntax and executability",
    "fluency": "Speed and fluency",
    "structure": "Solution structure",
    "correctness": "Correctness",
    "completeness": "Completeness",
    "patternFidelity": "Pattern fidelity",
    "syntax": "Syntax and executability",
    "completionTime": "Speed and fluency",
}

ADAPTIVE_VARIATION_STRATEGIES = {
    "contract": "preserve the function signature and named inputs before changing logic",
    "pattern": "make the reusable algorithm shape unmistakable",
    "state": "force the state variables to be named and initialized",
    "control_flow": "make the loop and branch structure carry the algorithm",
    "invariant": "keep the answer inside the active decision space",
    "state_updates": "pressure the exact movement/update that changes state",
    "ordering": "keep setup, decision, update, and return in cause-and-effect order",
    "answer_path": "force explicit answer recording and return behavior",
    "edge_cases": "include the smallest boundary behavior",
    "recall_fidelity": "repeat the same core shape with fewer places to hide vague wording",
    "executability": "keep the scaffold syntactically concrete enough to run",
}
