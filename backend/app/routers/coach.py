from __future__ import annotations

import ast
import asyncio
import builtins
import difflib
import json
import keyword
import re
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.config import settings
from app.database import get_pool
from app.models import (
    CoachAttemptEvaluationRequest,
    CoachAttemptEvaluationResponse,
    CoachAttemptFeedbackRequest,
    CoachAttemptFeedbackResponse,
    CoachPracticeHistoryRequest,
    CoachPracticeHistoryResponse,
    CoachSessionPlanRequest,
    CoachSessionPlanResponse,
    SkillMapDrillsRequest,
    SkillMapDrillsResponse,
)

router = APIRouter(prefix="/api/coach", tags=["coach"])

LIVE_STAGE_ORDER = {"early": 0, "mid": 1, "late": 2, "very-late": 3}
PYTHON_BUILTIN_NAMES = set(dir(builtins))
PYTHON_KEYWORDS = set(keyword.kwlist)
LIVE_TUNING_DEFAULTS: dict[str, Any] = {
    "focusMode": "memorization",
    "tone": "calm",
    "singleIssue": True,
    "showPatternNames": False,
    "specificitySource": "time-and-quality",
    "allowExactEditsWhenStuck": True,
    "canonicalAnswerStage": "late",
    "affirmationMode": "stable-only",
    "driftThresholdAttempts": 3,
    "drillDownEnabled": True,
    "stallThresholdSeconds": 40,
}


def _normalize_code(code: str) -> str:
    return (
        code.replace("\r\n", "\n")
        .split("\n")
    )


def _trim_line(line: str) -> str:
    return line.rstrip()


class _IdentifierCanonicalizer(ast.NodeTransformer):
    def __init__(self):
        self._scopes: list[dict[str, str]] = [{}]
        self._counters = {"func": 0, "var": 0}

    def _push_scope(self):
        self._scopes.append({})

    def _pop_scope(self):
        self._scopes.pop()

    def _lookup(self, name: str) -> str | None:
        for scope in reversed(self._scopes):
            if name in scope:
                return scope[name]
        return None

    def _bind(self, name: str, kind: str = "var") -> str:
        existing = self._scopes[-1].get(name)
        if existing:
            return existing
        self._counters[kind] += 1
        placeholder = f"{kind}_{self._counters[kind]}"
        self._scopes[-1][name] = placeholder
        return placeholder

    def visit_FunctionDef(self, node: ast.FunctionDef):
        node.name = self._bind(node.name, "func")
        node.decorator_list = [self.visit(item) for item in node.decorator_list]
        if node.returns:
            node.returns = self.visit(node.returns)
        self._push_scope()
        node.args = self.visit(node.args)
        node.body = [self.visit(statement) for statement in node.body]
        self._pop_scope()
        return node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        node.name = self._bind(node.name, "func")
        node.decorator_list = [self.visit(item) for item in node.decorator_list]
        if node.returns:
            node.returns = self.visit(node.returns)
        self._push_scope()
        node.args = self.visit(node.args)
        node.body = [self.visit(statement) for statement in node.body]
        self._pop_scope()
        return node

    def visit_Lambda(self, node: ast.Lambda):
        self._push_scope()
        node.args = self.visit(node.args)
        node.body = self.visit(node.body)
        self._pop_scope()
        return node

    def visit_arg(self, node: ast.arg):
        node.arg = self._bind(node.arg, "var")
        return node

    def visit_Name(self, node: ast.Name):
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            node.id = self._bind(node.id, "var")
            return node

        existing = self._lookup(node.id)
        if existing:
            node.id = existing
            return node

        if node.id in PYTHON_KEYWORDS or node.id in PYTHON_BUILTIN_NAMES:
            return node

        return node


def _canonicalize_identifier_names(code: str) -> str | None:
    try:
        parsed = ast.parse(code if code.endswith("\n") else f"{code}\n")
    except SyntaxError:
        return None

    canonicalizer = _IdentifierCanonicalizer()
    canonical_tree = canonicalizer.visit(parsed)
    ast.fix_missing_locations(canonical_tree)
    return ast.dump(canonical_tree, annotate_fields=True, include_attributes=False)


def _evaluate_attempt_soundness(expected_answer: str, user_answer: str) -> dict[str, Any]:
    normalized_expected = expected_answer.strip()
    normalized_user = user_answer.strip()
    syntax_valid = not _has_syntax_error(user_answer) if normalized_user else False
    expected_ast = _canonicalize_identifier_names(normalized_expected)
    user_ast = _canonicalize_identifier_names(normalized_user) if syntax_valid else None

    if not normalized_user:
        return {"accuracy": 0.0, "sound": False, "syntaxValid": False}

    if expected_ast and user_ast and expected_ast == user_ast:
        return {"accuracy": 100.0, "sound": True, "syntaxValid": True}

    similarity = difflib.SequenceMatcher(a=expected_ast or normalized_expected, b=user_ast or normalized_user).ratio()
    return {
        "accuracy": round(similarity * 100, 1),
        "sound": False,
        "syntaxValid": syntax_valid,
    }


def _live_stage_rank(stage: str) -> int:
    return LIVE_STAGE_ORDER.get(stage, 0)


def _live_stage_from_rank(rank: int) -> str:
    normalized = max(0, min(rank, max(LIVE_STAGE_ORDER.values())))
    for stage, stage_rank in LIVE_STAGE_ORDER.items():
        if stage_rank == normalized:
            return stage
    return "early"


def _merged_live_tuning(body: CoachAttemptFeedbackRequest) -> dict[str, Any]:
    raw = body.liveCoachTuning if isinstance(body.liveCoachTuning, dict) else {}
    tuning = {**LIVE_TUNING_DEFAULTS}

    tuning["focusMode"] = str(raw.get("focusMode", tuning["focusMode"])).strip() or tuning["focusMode"]
    tuning["tone"] = str(raw.get("tone", tuning["tone"])).strip() or tuning["tone"]
    tuning["singleIssue"] = bool(raw.get("singleIssue", tuning["singleIssue"]))
    tuning["showPatternNames"] = bool(raw.get("showPatternNames", tuning["showPatternNames"]))
    specificity = str(raw.get("specificitySource", tuning["specificitySource"])).strip()
    tuning["specificitySource"] = specificity or tuning["specificitySource"]
    tuning["allowExactEditsWhenStuck"] = bool(
        raw.get("allowExactEditsWhenStuck", tuning["allowExactEditsWhenStuck"])
    )
    canonical_stage = str(raw.get("canonicalAnswerStage", tuning["canonicalAnswerStage"])).strip()
    tuning["canonicalAnswerStage"] = (
        canonical_stage if canonical_stage in LIVE_STAGE_ORDER else tuning["canonicalAnswerStage"]
    )
    affirmation_mode = str(raw.get("affirmationMode", tuning["affirmationMode"])).strip()
    tuning["affirmationMode"] = affirmation_mode or tuning["affirmationMode"]
    try:
        tuning["driftThresholdAttempts"] = max(1, int(raw.get("driftThresholdAttempts", tuning["driftThresholdAttempts"])))
    except (TypeError, ValueError):
        pass
    tuning["drillDownEnabled"] = bool(raw.get("drillDownEnabled", tuning["drillDownEnabled"]))
    try:
        tuning["stallThresholdSeconds"] = max(15, int(raw.get("stallThresholdSeconds", tuning["stallThresholdSeconds"])))
    except (TypeError, ValueError):
        pass
    return tuning


def _ignored_drill_down_key(body: CoachAttemptFeedbackRequest) -> str:
    context = body.liveCoachContext if isinstance(body.liveCoachContext, dict) else {}
    return str(context.get("ignoredDrillDownKey", "")).strip()


def _completed_drill_down_key(body: CoachAttemptFeedbackRequest) -> str:
    context = body.liveCoachContext if isinstance(body.liveCoachContext, dict) else {}
    return str(context.get("completedDrillDownKey", "")).strip()


def _stage_at_least(stage: str, minimum_stage: str) -> bool:
    return _live_stage_rank(stage) >= _live_stage_rank(minimum_stage)


def _line_similarity(expected: str, actual: str) -> float:
    if not expected and not actual:
        return 1.0
    max_len = max(len(expected), len(actual), 1)
    matches = sum(1 for idx in range(min(len(expected), len(actual))) if expected[idx] == actual[idx])
    return matches / max_len


def _first_mismatch_line(expected_lines: list[str], actual_lines: list[str]) -> int | None:
    max_len = max(len(expected_lines), len(actual_lines))
    for idx in range(max_len):
        exp = _trim_line(expected_lines[idx]) if idx < len(expected_lines) else ""
        got = _trim_line(actual_lines[idx]) if idx < len(actual_lines) else ""
        if exp != got:
            return idx + 1
    return None


def _indent_errors(expected_lines: list[str], actual_lines: list[str]) -> int:
    errors = 0
    for idx in range(min(len(expected_lines), len(actual_lines))):
        exp = _trim_line(expected_lines[idx])
        got = _trim_line(actual_lines[idx])
        if exp.lstrip() and exp.lstrip() == got.lstrip():
            exp_indent = len(exp) - len(exp.lstrip(" "))
            got_indent = len(got) - len(got.lstrip(" "))
            if exp_indent != got_indent:
                errors += 1
    return errors


def _missing_extra_counts(expected_lines: list[str], actual_lines: list[str]) -> tuple[int, int]:
    expected_counter = Counter(line.strip() for line in expected_lines if line.strip())
    actual_counter = Counter(line.strip() for line in actual_lines if line.strip())
    missing = 0
    extra = 0
    for line, count in expected_counter.items():
        missing += max(0, count - actual_counter.get(line, 0))
    for line, count in actual_counter.items():
        extra += max(0, count - expected_counter.get(line, 0))
    return missing, extra


def _has_syntax_error(code: str) -> bool:
    try:
        ast.parse(code if code.endswith("\n") else f"{code}\n")
        return False
    except SyntaxError:
        return True


def _attempt_structure_summary(expected_lines: list[str], actual_lines: list[str]) -> dict[str, list[str]]:
    expected_set = {line.strip() for line in expected_lines if line.strip()}
    actual_set = {line.strip() for line in actual_lines if line.strip()}
    matched: list[str] = []
    missing: list[str] = []

    def push(label: str, anchor: str | None):
        if not anchor:
            return
        if anchor.strip() in actual_set:
            matched.append(label)
        else:
            missing.append(label)

    signature = next((line for line in expected_lines if line.strip().startswith("def ")), None)
    guard = next((line for line in expected_lines if line.strip().startswith("if ")), None)
    traversal = next((line for line in expected_lines if line.strip().startswith(("for ", "while "))), None)
    state_update = next(
        (
            line
            for line in expected_lines
            if any(token in line for token in ("append(", "pop(", " = ", "+=", "-="))
        ),
        None,
    )
    return_line = next((line for line in expected_lines if line.strip().startswith("return ")), None)

    push("signature", signature)
    push("guard", guard)
    push("traversal", traversal)
    push("state update", state_update)
    push("return path", return_line)

    if not matched and expected_set & actual_set:
        matched.append("partial structure")

    return {"matched": matched, "missing": missing}


def _non_empty_lines(lines: list[str]) -> list[str]:
    return [line.strip() for line in lines if line.strip()]


def _extract_branch_updates(lines: list[str]) -> list[tuple[str, list[str]]]:
    branches: list[tuple[str, list[str]]] = []
    index = 0
    while index < len(lines):
        raw = lines[index]
        stripped = raw.strip()
        if not stripped.startswith(("if ", "elif ", "else:")):
            index += 1
            continue

        indent = len(raw) - len(raw.lstrip(" "))
        updates: list[str] = []
        probe = index + 1
        while probe < len(lines):
            child = lines[probe]
            child_stripped = child.strip()
            if not child_stripped:
                probe += 1
                continue
            child_indent = len(child) - len(child.lstrip(" "))
            if child_indent <= indent:
                break
            updates.append(child_stripped)
            probe += 1

        branches.append((stripped, updates))
        index = probe

    return branches


def _pattern_principle(skill_tags: list[str]) -> str:
    ordered_rules = [
        ("two-pointers", "For the two-pointer pattern on a sorted array, move the side that can improve the comparison: left grows the value, right shrinks it."),
        ("sliding-window", "For sliding-window problems, keep the window invariant explicit: expand, shrink until valid, then score the current window."),
        ("binary-search", "For binary search, protect the interval invariant first and only move the bound that cannot still hold the answer."),
        ("dfs-bfs", "For DFS and BFS, decide when a state becomes visited before you start coding neighbors, then apply that rule consistently."),
        ("graph-traversal", "For graph traversal, define the frontier, the visited rule, and the neighbor update before you fill in edge cases."),
        ("backtracking", "For backtracking, every choice should be paired with an undo step so sibling branches start from clean state."),
        ("heap", "For heap problems, be explicit about what stays in the heap and what gets evicted when the heap exceeds its intended size."),
        ("union-find", "For union find, keep find and union responsibilities separate: find compresses paths, union connects roots."),
        ("dynamic-programming", "For dynamic programming, define what the state means before writing transitions; the update should read directly from that definition."),
        ("dp", "For dynamic programming, define what the state means before writing transitions; the update should read directly from that definition."),
        ("intervals", "For interval problems, sort once, then make every step answer a simple question: extend the current interval or start a new one."),
        ("prefix-sums", "For prefix sums, query with the old prefix state before recording the current prefix so counts stay aligned."),
        ("monotonic-stack", "For monotonic stack problems, the stack stores unresolved items until a new value breaks the invariant and resolves them."),
        ("stack", "For stack-based patterns, be explicit about what the stack represents before pushing or popping."),
    ]
    for tag, rule in ordered_rules:
        if tag in skill_tags:
            return rule
    return "In senior interviews, make the invariant explicit early so each update has a reason for being there."


def _detect_two_pointer_direction_issue(actual_lines: list[str], skill_tags: list[str]) -> str:
    if "two-pointers" not in skill_tags:
        return ""

    saw_large_branch_wrong = False
    saw_small_branch_wrong = False
    for condition, updates in _extract_branch_updates(actual_lines):
        if "target" not in condition:
            continue
        joined_updates = " ".join(updates)
        if ">" in condition and re.search(r"\bleft\s*\+=\s*1\b", joined_updates):
            saw_large_branch_wrong = True
        if "<" in condition and re.search(r"\bright\s*-=\s*1\b", joined_updates):
            saw_small_branch_wrong = True

    if saw_large_branch_wrong or saw_small_branch_wrong:
        return (
            "Your pointer movement is backwards. On a sorted two-pointer scan, move left when the value is too small and move right when it is too large."
        )
    return ""


def _detect_binary_search_bound_issue(actual_lines: list[str], skill_tags: list[str]) -> str:
    if "binary-search" not in skill_tags:
        return ""

    wrong_lower_bound = False
    wrong_upper_bound = False
    for condition, updates in _extract_branch_updates(actual_lines):
        joined_updates = " ".join(updates)
        if "< target" in condition and re.search(r"\bright\s*=\s*mid\b", joined_updates):
            wrong_lower_bound = True
        if ("else:" in condition or ">=" in condition) and re.search(r"\bleft\s*=\s*mid\s*\+?\s*1\b", joined_updates):
            wrong_upper_bound = True

    if wrong_lower_bound or wrong_upper_bound:
        return (
            "Your bound movement breaks the binary-search invariant. When the middle value is still too small, discard the left half; otherwise keep the candidate answer in the search range."
        )
    return ""


def _detect_missing_return_issue(expected_lines: list[str], actual_lines: list[str]) -> str:
    expected_returns = [line for line in _non_empty_lines(expected_lines) if line.startswith("return ")]
    actual_returns = [line for line in _non_empty_lines(actual_lines) if line.startswith("return ")]
    if not expected_returns:
        return ""
    if not actual_returns:
        return "Your attempt never reaches an explicit return path, so the function is incomplete even if the main loop is close."
    if len(actual_returns) < len(expected_returns):
        return "You are missing part of the return path. In interview code, make sure the failure/default case is explicit."
    return ""


def _detect_placeholder_issue(actual_lines: list[str]) -> str:
    if any(re.search(r"\b(pass|something|todo|tbd)\b", line.strip(), re.IGNORECASE) for line in actual_lines):
        return "Placeholders are still doing algorithmic work here. In a senior interview, even rough code should name the real state update."
    return ""


def _build_submission_issue_list(
    expected_lines: list[str],
    actual_lines: list[str],
    structure: dict[str, list[str]],
    syntax_error: bool,
    missing_count: int,
    extra_count: int,
    skill_tags: list[str],
) -> list[str]:
    issues: list[str] = []

    for issue in (
        _detect_two_pointer_direction_issue(actual_lines, skill_tags),
        _detect_binary_search_bound_issue(actual_lines, skill_tags),
        _detect_placeholder_issue(actual_lines),
        _detect_missing_return_issue(expected_lines, actual_lines),
    ):
        if issue:
            issues.append(issue)

    if syntax_error:
        issues.append("The attempt is not runnable yet because the Python syntax or block structure breaks before the full algorithm can execute.")

    if structure["missing"]:
        issues.append(
            f"You are missing one or more core structural pieces of the pattern: {', '.join(structure['missing'][:3])}."
        )
    elif missing_count > 0:
        issues.append("Some key lines are omitted, so the overall pattern is recognizable but the implementation is still incomplete.")

    if extra_count > 0:
        issues.append("A few extra lines drift away from the target implementation and make the invariant harder to trust.")

    deduped: list[str] = []
    for issue in issues:
        if issue and issue not in deduped:
            deduped.append(issue)
    return deduped


def _build_submission_feedback(
    issues: list[str], strengths: list[str], principle: str, history_summary: dict[str, Any]
) -> str:
    paragraphs: list[str] = []

    if issues:
        paragraphs.append(issues[0])
    elif strengths:
        paragraphs.append(strengths[0])
    else:
        paragraphs.append("This attempt is close to interview-ready. The main thing now is preserving the invariant all the way through the function.")

    if principle:
        paragraphs.append(principle)

    if len(issues) > 1:
        if len(issues) == 2:
            paragraphs.append(f"There is one other issue to fix: {issues[1]}")
        else:
            paragraphs.append(
                "There are a couple of other issues to clean up: "
                + " ".join(issue.rstrip(".") + "." for issue in issues[1:3])
            )

    weakest_tag = str(history_summary.get("weakestTag") or "").strip()
    if weakest_tag:
        paragraphs.append(
            f"Across recent attempts, `{weakest_tag}` is still a weak spot, so it is worth reinforcing this pattern until the invariant feels automatic."
        )

    return "\n\n".join(paragraphs)


async def _load_attempt_history(body: CoachAttemptFeedbackRequest) -> list[dict[str, Any]]:
    return await _load_practice_history(body.cardId, body.questionType, body.skillTags, limit=20)


def _parse_json_field(value: Any, fallback: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return fallback
        return parsed if isinstance(parsed, type(fallback)) else fallback
    return fallback


async def _load_practice_history(
    card_id: str, question_type: str, skill_tags: list[str], limit: int = 20
) -> list[dict[str, Any]]:
    pool = get_pool()

    async with pool.acquire() as conn:
        if skill_tags:
            rows = await conn.fetch(
                """
                SELECT
                    sa.id AS "attemptId",
                    COALESCE(sa.interaction_id, '') AS "interactionId",
                    sa.card_id AS "cardId",
                    sa.card_title AS "cardTitle",
                    sa.question,
                    sa.correct_answer AS "correctAnswer",
                    sa.user_answer AS "userAnswer",
                    sa.accuracy,
                    sa.exact,
                    sa.elapsed_ms AS "elapsedMs",
                    sa.category_tags AS "categoryTags",
                    sa.generated_card AS "generatedCard",
                    sa.coach_feedback AS "submissionFeedback",
                    sa.created_at,
                    COALESCE(live.live_feedback_count, 0) AS "liveFeedbackCount",
                    latest.feedback AS "latestLiveFeedback"
                FROM score_attempts sa
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS live_feedback_count
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                ) live ON TRUE
                LEFT JOIN LATERAL (
                    SELECT fe.feedback
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                    ORDER BY fe.created_at DESC
                    LIMIT 1
                ) latest ON TRUE
                WHERE sa.mode = 'main-recall'
                  AND (sa.card_id = $1 OR sa.generated_card_id = $1 OR sa.category_tags && $2::text[])
                ORDER BY sa.created_at DESC
                LIMIT $3
                """,
                card_id,
                skill_tags,
                limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT
                    sa.id AS "attemptId",
                    COALESCE(sa.interaction_id, '') AS "interactionId",
                    sa.card_id AS "cardId",
                    sa.card_title AS "cardTitle",
                    sa.question,
                    sa.correct_answer AS "correctAnswer",
                    sa.user_answer AS "userAnswer",
                    sa.accuracy,
                    sa.exact,
                    sa.elapsed_ms AS "elapsedMs",
                    sa.category_tags AS "categoryTags",
                    sa.generated_card AS "generatedCard",
                    sa.coach_feedback AS "submissionFeedback",
                    sa.created_at,
                    COALESCE(live.live_feedback_count, 0) AS "liveFeedbackCount",
                    latest.feedback AS "latestLiveFeedback"
                FROM score_attempts sa
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS live_feedback_count
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                ) live ON TRUE
                LEFT JOIN LATERAL (
                    SELECT fe.feedback
                    FROM coach_feedback_events fe
                    WHERE fe.feedback_stage = 'live'
                      AND (
                        (sa.interaction_id IS NOT NULL AND fe.interaction_id = sa.interaction_id)
                        OR (
                            sa.interaction_id IS NULL
                            AND fe.card_id = sa.card_id
                            AND fe.question_type = sa.question_type
                            AND fe.created_at <= sa.created_at
                        )
                      )
                    ORDER BY fe.created_at DESC
                    LIMIT 1
                ) latest ON TRUE
                WHERE sa.mode = 'main-recall'
                  AND (sa.card_id = $1 OR sa.generated_card_id = $1 OR sa.question_type = $2)
                ORDER BY sa.created_at DESC
                LIMIT $3
                """,
                card_id,
                question_type,
                limit,
            )

    history: list[dict[str, Any]] = []
    for row in rows:
        history.append({
            "attemptId": int(row["attemptId"]),
            "interactionId": str(row["interactionId"] or ""),
            "cardId": row["cardId"],
            "cardTitle": row["cardTitle"],
            "question": row["question"] or "",
            "correctAnswer": row["correctAnswer"] or "",
            "userAnswer": row["userAnswer"] or "",
            "accuracy": float(row["accuracy"] or 0),
            "exact": bool(row["exact"]),
            "elapsedMs": int(row["elapsedMs"] or 0),
            "categoryTags": list(row["categoryTags"] or []),
            "generatedCard": _parse_json_field(row["generatedCard"], {}),
            "liveFeedbackCount": int(row["liveFeedbackCount"] or 0),
            "latestLiveFeedback": _parse_json_field(row["latestLiveFeedback"], {}),
            "submissionFeedback": _parse_json_field(row["submissionFeedback"], {}),
            "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
        })
    return history


async def _load_live_feedback_history(interaction_id: str | None, limit: int = 16) -> list[dict[str, Any]]:
    if not interaction_id:
        return []

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT feedback, elapsed_ms AS "elapsedMs", created_at
            FROM coach_feedback_events
            WHERE interaction_id = $1
              AND feedback_stage = 'live'
            ORDER BY created_at ASC
            LIMIT $2
            """,
            interaction_id,
            limit,
        )

    history: list[dict[str, Any]] = []
    for row in rows:
        feedback = _parse_json_field(row["feedback"], {})
        history.append({
            "elapsedMs": int(row["elapsedMs"] or 0),
            "feedback": feedback,
            "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
        })
    return history


def _summarize_attempt_history(history: list[dict[str, Any]]) -> dict[str, Any]:
    if not history:
        return {
            "attemptCount": 0,
            "recentAvgAccuracy": 0,
            "weakestTag": "",
            "repeatedErrorTags": [],
            "recentPrimaryFocuses": [],
            "recentQuestions": [],
        }

    accuracies = [float(item.get("accuracy", 0)) for item in history]
    tag_scores: dict[str, list[float]] = {}
    error_counts: Counter[str] = Counter()
    primary_focuses: list[str] = []
    recent_questions: list[str] = []
    for item in history:
        for tag in item.get("categoryTags", []):
            tag_scores.setdefault(tag, []).append(float(item.get("accuracy", 0)))
        feedback = item.get("submissionFeedback", {})
        for tag in feedback.get("errorTags", []) if isinstance(feedback, dict) else []:
            error_counts[str(tag)] += 1
        if isinstance(feedback, dict) and feedback.get("primaryFocus"):
            primary_focuses.append(str(feedback["primaryFocus"]))
        if item.get("question"):
            recent_questions.append(str(item["question"]))

    weakest_tag = ""
    weakest_avg = 101.0
    for tag, values in tag_scores.items():
        if not values:
            continue
        avg = sum(values) / len(values)
        if avg < weakest_avg:
            weakest_avg = avg
            weakest_tag = tag

    return {
        "attemptCount": len(history),
        "recentAvgAccuracy": round(sum(accuracies) / len(accuracies), 1),
        "weakestTag": weakest_tag,
        "repeatedErrorTags": [tag for tag, count in error_counts.most_common(3) if count >= 2],
        "recentPrimaryFocuses": primary_focuses[:3],
        "recentQuestions": recent_questions[:3],
    }


def _consecutive_blocker_duration_ms(
    live_history: list[dict[str, Any]], blocker_key: str, current_elapsed_ms: int
) -> int:
    if not blocker_key or not live_history:
        return 0

    matching_elapsed_ms: list[int] = []
    for item in reversed(live_history):
        feedback = item.get("feedback", {})
        signals = feedback.get("signals", {}) if isinstance(feedback, dict) else {}
        history_key = str(signals.get("live_blocker_key", "")).strip()
        if history_key != blocker_key:
            break
        matching_elapsed_ms.append(int(item.get("elapsedMs", 0) or 0))

    if not matching_elapsed_ms:
        return 0

    oldest_elapsed_ms = min(matching_elapsed_ms)
    return max(0, current_elapsed_ms - oldest_elapsed_ms)


def _should_mention_repeated_drift(history_summary: dict[str, Any], tuning: dict[str, Any]) -> bool:
    attempt_count = int(history_summary.get("attemptCount", 0) or 0)
    weakest_tag = str(history_summary.get("weakestTag", "")).strip()
    return bool(weakest_tag) and attempt_count >= int(tuning["driftThresholdAttempts"])


def _summarize_skill_map_progress(
    skill_map: list[Any], history: list[dict[str, Any]]
) -> dict[str, Any]:
    progress_by_pattern: dict[str, dict[str, Any]] = {}

    for node in skill_map:
        slug = _pattern_slug(getattr(node, "pattern", ""))
        if not slug:
            continue
        progress_by_pattern[slug] = {
            "pattern": getattr(node, "pattern", slug),
            "attemptCount": 0,
            "avgAccuracy": 0.0,
            "exactRate": 0.0,
            "repeatedErrorTags": [],
            "latestPrimaryFocus": "",
            "latestQuestion": "",
        }

    accuracy_buckets: dict[str, list[float]] = {slug: [] for slug in progress_by_pattern}
    exact_counts: Counter[str] = Counter()
    error_counts: dict[str, Counter[str]] = {slug: Counter() for slug in progress_by_pattern}

    for item in history:
        item_tags = {str(tag) for tag in item.get("categoryTags", [])}
        feedback = item.get("submissionFeedback", {})
        for slug, summary in progress_by_pattern.items():
            if slug not in item_tags:
                continue
            summary["attemptCount"] += 1
            accuracy_buckets[slug].append(float(item.get("accuracy", 0)))
            if item.get("exact"):
                exact_counts[slug] += 1
            for tag in feedback.get("errorTags", []) if isinstance(feedback, dict) else []:
                error_counts[slug][str(tag)] += 1
            if not summary["latestPrimaryFocus"] and isinstance(feedback, dict):
                summary["latestPrimaryFocus"] = str(feedback.get("primaryFocus", "")).strip()
            if not summary["latestQuestion"]:
                summary["latestQuestion"] = str(item.get("question", "")).strip()

    weak_patterns: list[str] = []
    for slug, summary in progress_by_pattern.items():
        accuracies = accuracy_buckets[slug]
        attempts = int(summary["attemptCount"])
        if accuracies:
            summary["avgAccuracy"] = round(sum(accuracies) / len(accuracies), 1)
            summary["exactRate"] = round((exact_counts[slug] / len(accuracies)) * 100, 1)
        summary["repeatedErrorTags"] = [tag for tag, count in error_counts[slug].most_common(3) if count >= 2]
        if attempts > 0 and float(summary["avgAccuracy"]) < 90:
            weak_patterns.append(slug)

    overall_attempts = len(history)
    overall_avg_accuracy = round(
        sum(float(item.get("accuracy", 0)) for item in history) / overall_attempts, 1
    ) if overall_attempts else 0.0

    return {
        "overall": {
            "attemptCount": overall_attempts,
            "avgAccuracy": overall_avg_accuracy,
            "weakPatterns": weak_patterns[:5],
        },
        "patterns": progress_by_pattern,
    }


def _progress_focus_note(progress: dict[str, Any]) -> str:
    if not progress or int(progress.get("attemptCount", 0)) == 0:
        return ""
    repeated = [str(tag) for tag in progress.get("repeatedErrorTags", []) if str(tag).strip()]
    if repeated:
        return f"Recent weak spot: {', '.join(repeated[:2])}."
    latest_focus = str(progress.get("latestPrimaryFocus", "")).strip()
    if latest_focus:
        return latest_focus
    return ""


async def _persist_feedback_event(
    body: CoachAttemptFeedbackRequest, feedback: dict[str, Any]
) -> None:
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO coach_feedback_events
                (interaction_id, card_id, generated_card_id, question_type, feedback_stage, draft_mode,
                 prompt, expected_answer, user_answer, accuracy, exact, elapsed_ms, skill_tags,
                 previous_attempts, draft_milestones, feedback, llm_used, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
            """,
            body.interactionId,
            body.cardId,
            body.cardId,
            body.questionType,
            "live" if body.draftMode else "submission",
            body.draftMode,
            body.prompt,
            body.expectedAnswer,
            body.userAnswer,
            body.accuracy,
            body.exact,
            body.elapsedMs,
            body.skillTags,
            json.dumps(body.previousAttempts),
            json.dumps(body.draftMilestones),
            json.dumps(feedback),
            bool(feedback.get("llmUsed")),
            now,
        )


def _draft_flag(body: CoachAttemptFeedbackRequest, key: str, default: bool = False) -> bool:
    value = body.draftMilestones.get(key, default)
    return bool(value)


def _draft_value(body: CoachAttemptFeedbackRequest, key: str, default: Any = "") -> Any:
    return body.draftMilestones.get(key, default)


def _limit_words(text: str, limit: int = 30) -> str:
    words = text.strip().split()
    if len(words) <= limit:
        return " ".join(words)
    return " ".join(words[:limit]).rstrip(".,;:") + "..."


def _truncate_live_feedback_fields(feedback: dict[str, Any]) -> dict[str, Any]:
    limited = {**feedback}
    for key in (
        "diagnosis",
        "primaryFocus",
        "immediateCorrection",
        "keepInMind",
        "microDrill",
        "nextRepTarget",
        "affirmation",
        "nextMove",
        "why",
        "drillDownTitle",
        "drillDownPrompt",
    ):
        if key in limited:
            word_limit = 24 if key == "drillDownPrompt" else 20
            limited[key] = _limit_words(str(limited.get(key, "")), word_limit)
    if "strengths" in limited and isinstance(limited["strengths"], list):
        limited["strengths"] = [_limit_words(str(item), 20) for item in limited["strengths"][:3]]
    return limited


def _live_feedback_stage(elapsed_ms: int) -> str:
    if elapsed_ms >= 90_000:
        return "very-late"
    if elapsed_ms >= 60_000:
        return "late"
    if elapsed_ms >= 30_000:
        return "mid"
    return "early"


def _primary_pattern_tag(skill_tags: list[str]) -> str:
    for tag in (
        "sliding-window",
        "two-pointers",
        "binary-search",
        "dfs-bfs",
        "graph-traversal",
        "backtracking",
        "heap",
        "union-find",
        "dynamic-programming",
        "dp",
        "intervals",
        "prefix-sums",
        "monotonic-stack",
        "stack",
    ):
        if tag in skill_tags:
            return tag
    return ""


def _live_window_next_step(stage: str) -> str:
    if stage == "very-late":
        return (
            "The very next step is to add `while len(count) > k:` after you increment the incoming value, "
            "then shrink from the left by decrementing `count[nums[left]]`, deleting empty entries, and moving `left`."
        )
    if stage == "late":
        return (
            "The very next step is to add the shrink loop after you expand the window, and have that loop move `left` "
            "while updating the counts until the window is valid again."
        )
    if stage == "mid":
        return (
            "The very next step is to add the control flow that restores the window invariant whenever the window becomes invalid."
        )
    return (
        "The very next step is to decide what makes the window valid and add the logic that restores that rule after each expand step."
    )


def _live_two_pointer_next_step(stage: str) -> str:
    if stage == "very-late":
        return (
            "The very next step is to add the comparison branches that move `left` when the value is too small and `right` when it is too large."
        )
    if stage == "late":
        return (
            "The very next step is to write the branch logic that updates exactly one pointer based on whether the current comparison is too small or too large."
        )
    if stage == "mid":
        return (
            "The very next step is to state the comparison rule and connect it to one pointer movement."
        )
    return (
        "The very next step is to decide which pointer should move when the current pair does not satisfy the invariant."
    )


def _live_binary_search_next_step(stage: str) -> str:
    if stage == "very-late":
        return (
            "The very next step is to write the branch that discards one half from `mid`, updating only the bound that can no longer contain the answer."
        )
    if stage == "late":
        return (
            "The very next step is to add the bound-update branch from `mid` so the interval invariant stays true after each comparison."
        )
    if stage == "mid":
        return (
            "The very next step is to define what `left` and `right` mean, then update the bound that is definitely impossible."
        )
    return (
        "The very next step is to restate the search interval invariant before you move either bound."
    )


def _general_next_step(stage: str, has_loop: bool) -> str:
    if not has_loop:
        if stage in ("late", "very-late"):
            return "The very next step is to add the main control flow that advances the state once."
        if stage == "mid":
            return "The very next step is to write the control flow that makes the algorithm move instead of just setting up state."
        return "The very next step is to choose the control flow that repeatedly applies your invariant."
    if stage in ("late", "very-late"):
        return "The very next step is to add the single state-update line that makes the loop or recursion do real work."
    return "The very next step is to add one concrete state update, not three."


def _live_next_step_for_pattern(pattern_tag: str, stage: str, has_loop: bool) -> str:
    if pattern_tag == "sliding-window":
        return _live_window_next_step(stage)
    if pattern_tag == "two-pointers":
        return _live_two_pointer_next_step(stage)
    if pattern_tag == "binary-search":
        return _live_binary_search_next_step(stage)
    return _general_next_step(stage, has_loop)


def _has_line(lines: list[str], pattern: str) -> bool:
    return any(re.search(pattern, line) for line in lines)


def _sliding_window_progress(lines: list[str]) -> dict[str, bool]:
    return {
        "has_expand": _has_line(lines, r"\b(count|counts)\[.+\]\s*=\s*\1\.get\(.+\)\s*\+\s*1"),
        "has_shrink_loop": _has_line(lines, r"^\s*while\s+.+:"),
        "has_shrink_update": _has_line(lines, r"\b(count|counts)\[nums\[left\]\]\s*[-+*/]?="),
        "has_cleanup": _has_line(lines, r"\bdel\s+(count|counts)\[nums\[left\]\]|\b(count|counts)\.pop\("),
        "has_left_move": _has_line(lines, r"\bleft\s*\+=\s*1\b"),
        "has_score": _has_line(lines, r"\b(best|answer|result)\s*=\s*max\("),
    }


def _two_pointer_progress(lines: list[str]) -> dict[str, bool]:
    return {
        "has_pair_value": _has_line(lines, r"nums\[left\].+nums\[right\]|nums\[right\].+nums\[left\]"),
        "has_compare": _has_line(lines, r"^\s*if\s+.+target.+:|^\s*elif\s+.+target.+:"),
        "has_left_move": _has_line(lines, r"\bleft\s*\+=\s*1\b"),
        "has_right_move": _has_line(lines, r"\bright\s*-=\s*1\b"),
        "has_success_path": _has_line(lines, r"^\s*return\s+True\b|^\s*return\s+\[left,\s*right\]"),
    }


def _binary_search_progress(lines: list[str]) -> dict[str, bool]:
    return {
        "has_mid": _has_line(lines, r"\bmid\s*="),
        "has_compare": _has_line(lines, r"^\s*if\s+.+mid.+:|^\s*if\s+nums\[mid\]"),
        "has_left_update": _has_line(lines, r"\bleft\s*=\s*mid(\s*\+\s*1)?\b"),
        "has_right_update": _has_line(lines, r"\bright\s*=\s*mid\b|\bright\s*=\s*mid\s*-\s*1\b"),
        "has_return": _has_line(lines, r"^\s*return\b"),
    }


def _dp_progress(lines: list[str]) -> dict[str, bool]:
    return {
        "has_state_array": _has_line(lines, r"\bdp\s*=\s*\[") or _has_line(lines, r"\bdp\s*=\s*list\("),
        "has_base_case": _has_line(lines, r"\bdp\[[^\]]+\]\s*=") or _has_line(lines, r"^\s*if\s+not\s+"),
        "has_loop": _has_line(lines, r"^\s*(for|while)\b"),
        "has_transition": _has_line(lines, r"\bdp\[[^\]]+\]\s*=.*dp\[[^\]]+\]"),
        "has_return": _has_line(lines, r"^\s*return\b"),
    }


def _sliding_window_guidance(lines: list[str], stage: str) -> tuple[str, str, str]:
    progress = _sliding_window_progress(lines)
    keep = "Sliding window rhythm: expand, restore validity, then score."

    if not progress["has_expand"]:
        return (
            "Add the outer traversal over `right` so each step adds the incoming value to `counts`.",
            "The window doesn't expand or shrink yet; it only sets up state.",
            keep,
        )

    if not progress["has_shrink_loop"]:
        if stage == "very-late":
            next_step = (
                "Add `while len(counts) > k:` after expanding so the window shrinks back to valid."
            )
        elif stage == "late":
            next_step = (
                "Add the shrink loop after expanding so the window becomes valid again."
            )
        else:
            next_step = (
                "Add control flow that restores the window invariant after each expand."
            )
        why = (
            "The window expands, but nothing repairs it before scoring."
        )
        return next_step, why, keep

    if not progress["has_shrink_update"] or not progress["has_left_move"]:
        if stage == "very-late":
            next_step = (
                "Update counts for `nums[left]` and move `left` inside the shrink loop."
            )
        elif stage == "late":
            next_step = (
                "Make the shrink loop change the left side of the window."
            )
        else:
            next_step = (
                "Connect the shrink loop to `counts` and `left`."
            )
        why = (
            "The draft notices invalid windows, but it doesn't repair them yet."
        )
        return next_step, why, keep

    if not progress["has_cleanup"]:
        return (
            "Remove values from `counts` when their frequency reaches zero.",
            "Without cleanup, `counts` can stop matching the actual window.",
            "Counts should describe only the current window.",
        )

    if not progress["has_score"]:
        return (
            "Update `best` after the window is valid.",
            "The window now moves correctly, but nothing records an answer.",
            "Score only after restoring validity.",
        )

    return (
        "Keep each iteration ordered: expand, repair, then score.",
        "The pieces are there; preserving that order keeps the invariant true.",
        keep,
    )


def _two_pointer_guidance(lines: list[str], stage: str) -> tuple[str, str, str]:
    progress = _two_pointer_progress(lines)
    keep = "With two pointers, each comparison should justify moving exactly one side of the search."

    if not progress["has_pair_value"]:
        return (
            "The very next step is to compute or name the value formed by the current left and right pointers.",
            "Until the draft makes the current pair explicit, there is nothing concrete to compare or react to.",
            keep,
        )

    if not progress["has_compare"]:
        return (
            "The very next step is to compare the current pair against the target condition.",
            "You already know what the pointers are looking at. The missing piece is the rule that decides whether the current pair is too small, too large, or done.",
            keep,
        )

    if not progress["has_left_move"] or not progress["has_right_move"]:
        next_step = (
            "The very next step is to connect each comparison outcome to the pointer movement that improves the search."
            if stage in ("early", "mid")
            else "The very next step is to finish the comparison branches so one branch moves `left` and the other moves `right`."
        )
        why = (
            "The comparison is on the page, but the algorithm still needs the movement rule that turns that comparison into progress."
        )
        return next_step, why, keep

    if not progress["has_success_path"]:
        return (
            "The very next step is to add the success path for the case where the current pair satisfies the condition.",
            "The movement logic is there, but the draft still needs a clear exit when the answer is found.",
            keep,
        )

    return (
        "The very next step is to verify that every pointer movement preserves the meaning of the search.",
        "The structure is mostly there, so correctness now depends on whether each branch moves the side that can actually improve the comparison.",
        keep,
    )


def _binary_search_guidance(lines: list[str], stage: str) -> tuple[str, str, str]:
    progress = _binary_search_progress(lines)
    keep = "In binary search, protect the interval invariant first and let every bound update follow from that meaning."

    if not progress["has_mid"]:
        return (
            "The very next step is to compute the middle of the current search interval.",
            "The loop exists, but without a middle element the search cannot decide which half is impossible.",
            keep,
        )

    if not progress["has_compare"]:
        return (
            "The very next step is to compare the middle value to the target condition.",
            "You have the interval and the midpoint. The missing piece is the comparison that tells the search which half can be discarded.",
            keep,
        )

    if not progress["has_left_update"] or not progress["has_right_update"]:
        next_step = (
            "The very next step is to turn the comparison into a bound update that discards the impossible half."
            if stage in ("early", "mid")
            else "The very next step is to finish the comparison branches so one branch updates `left` and the other updates `right` according to the interval meaning."
        )
        why = (
            "The search can now inspect the midpoint, but it still is not shrinking the interval in a principled way."
        )
        return next_step, why, keep

    if not progress["has_return"]:
        return (
            "The very next step is to add the return that matches what the final interval means.",
            "Once the interval logic is done, the function still needs a clear way to turn that invariant into an answer.",
            keep,
        )

    return (
        "The very next step is to sanity-check that each bound update matches the interval invariant you intended.",
        "Binary search often looks complete before it is correct, so the remaining work is making sure the bound semantics and return value agree.",
        keep,
    )


def _dp_guidance(lines: list[str], stage: str) -> tuple[str, str, str]:
    progress = _dp_progress(lines)
    keep = "For DP recall, lock down the state meaning first, then let each update read from that meaning."

    if not progress["has_state_array"]:
        next_step = (
            "Define the DP state array before you write more control flow."
            if stage in ("early", "mid")
            else "Instantiate the DP state array so the rest of the draft has real state to update."
        )
        why = "The draft has structure, but the state container is not on the page yet."
        return next_step, why, keep

    if not progress["has_base_case"]:
        return (
            "Add the base case that gives the DP array its first true value.",
            "The state array exists, but nothing anchors what its entries mean yet.",
            keep,
        )

    if not progress["has_loop"]:
        return (
            "Add the traversal that fills the state from the base case outward.",
            "The state meaning is starting to settle, but the draft has no update path yet.",
            keep,
        )

    if not progress["has_transition"]:
        next_step = (
            "Write the transition that computes one DP entry from earlier state."
            if stage in ("early", "mid")
            else "Make the loop update each DP entry from the prior state it depends on."
        )
        why = "The scaffold is there, but the recurrence has not become a concrete update yet."
        return next_step, why, keep

    if not progress["has_return"]:
        return (
            "Add the return that reads the answer from the DP state you built.",
            "The recurrence is taking shape, but the function still needs to expose the final state.",
            keep,
        )

    return (
        "Keep each DP line tied to the state meaning you chose.",
        "The structure is taking shape, so the main risk now is losing the state definition as the loop grows.",
        keep,
    )


def _graph_keep_in_mind(traversal_kind: str, has_guard: bool) -> str:
    if traversal_kind == "dfs":
        return "In DFS, decide when a node becomes visited and apply that rule before exploring neighbors."
    if traversal_kind in ("bfs", "queue"):
        return "In BFS, every queued item should already be valid, and unseen neighbors should enter the frontier exactly once."
    if has_guard:
        return "For graph code, keep three things stable: representation, visited rule, and how neighbors enter the frontier."
    return "For graph code, the visited rule is what keeps the traversal from becoming ambiguous."


def _stable_live_affirmation(
    pattern_tag: str,
    is_graph_question: bool,
    has_signature: bool,
    has_bookkeeping: bool,
    has_loop: bool,
    lines: list[str],
    tuning: dict[str, Any],
) -> str:
    if tuning["affirmationMode"] == "never":
        return ""

    if is_graph_question:
        if has_bookkeeping and has_loop:
            return "Your graph state and traversal shell are a common setup."
        if has_bookkeeping:
            return "Your graph state variables are on the page and are a common approach."
        if has_signature:
            return "Your graph entry point is on the page and is ready for traversal logic."
        return ""

    if pattern_tag == "sliding-window":
        progress = _sliding_window_progress(lines)
        if progress["has_expand"] and progress["has_shrink_loop"]:
            return "Your outer traversal and repair step are a common setup."
        if progress["has_expand"]:
            return "Your outer traversal is on the page and is a common approach."
    elif pattern_tag == "two-pointers":
        progress = _two_pointer_progress(lines)
        if progress["has_pair_value"] and progress["has_compare"]:
            return "Your pointer setup and comparison rule are a common approach."
        if progress["has_pair_value"]:
            return "Your pointer setup is on the page and is a common approach."
    elif pattern_tag == "binary-search":
        progress = _binary_search_progress(lines)
        if progress["has_mid"] and progress["has_compare"]:
            return "Your interval and midpoint structure are a common approach."
    elif pattern_tag in ("dynamic-programming", "dp"):
        progress = _dp_progress(lines)
        if progress["has_state_array"] and progress["has_loop"]:
            return "Your state array and outer traversal are a common approach."
        if progress["has_state_array"]:
            return "Your state variables are on the page and are a common approach."

    if has_signature and has_loop:
        return "Your outer structure is on the page and is a workable start."
    if has_signature:
        return "Your entry point is on the page and is ready for the next move."
    return ""


def _live_drill_down_details(blocker_key: str, pattern_tag: str) -> dict[str, str]:
    mapping = {
        "dp-state-array": {
            "title": "Focus Drill: DP State Setup",
            "prompt": "Focus on defining the state array first.",
            "question": "Write a one-dimensional DP array initialization for length n.",
            "target": "dp = [0] * n",
            "hint": "Keep it to the state container only.",
        },
        "dp-base-case": {
            "title": "Focus Drill: DP Base Case",
            "prompt": "Focus on writing the first state value before you grow the table.",
            "question": "Write the base-case assignment for the first DP entry.",
            "target": "dp[0] = 1",
            "hint": "Anchor exactly one state value.",
        },
        "dp-transition": {
            "title": "Focus Drill: DP Transition",
            "prompt": "Focus on one DP update before you rebuild the whole recurrence.",
            "question": "Write one DP transition that updates the current state from earlier state.",
            "target": "dp[i] = dp[i - 1] + value",
            "hint": "Use the current slot and one earlier slot.",
        },
        "window-expand": {
            "title": "Focus Drill: Window Traversal",
            "prompt": "Focus on making the outer window traversal real before changing the inner logic.",
            "question": "Write the outer traversal for a sliding window over nums.",
            "target": "for right, value in enumerate(nums):",
            "hint": "Make the traversal name both the index and the incoming value.",
        },
        "window-shrink-loop": {
            "title": "Focus Drill: Window Repair",
            "prompt": "Focus on restoring validity after each expand step before you score the window.",
            "question": "Write the shrink-loop header that restores window validity.",
            "target": "while len(counts) > k:",
            "hint": "This drill is only the repair condition.",
        },
        "window-shrink-update": {
            "title": "Focus Drill: Left-Side Repair",
            "prompt": "Focus on making the shrink step change the left side of the window.",
            "question": "Write the left-side repair step for the shrink loop.",
            "target": "counts[nums[left]] -= 1\nif counts[nums[left]] == 0:\n    del counts[nums[left]]\nleft += 1",
            "hint": "Update the count, clean up zeroes, then move left.",
        },
        "window-score": {
            "title": "Focus Drill: Window Scoring",
            "prompt": "Focus on recording the answer only after the window is valid.",
            "question": "Write the scoring line for the valid window.",
            "target": "best = max(best, right - left + 1)",
            "hint": "Score the current valid span.",
        },
        "graph-bookkeeping": {
            "title": "Focus Drill: Graph State Setup",
            "prompt": "Focus on making the visited or frontier state explicit before adding more flow.",
            "question": "Write the basic frontier and visited setup for graph traversal from start.",
            "target": "visited = {start}\nqueue = deque([start])",
            "hint": "Name both the visited state and the initial frontier.",
        },
        "graph-traversal-choice": {
            "title": "Focus Drill: Traversal Choice",
            "prompt": "Focus on choosing the frontier structure before you code more graph detail.",
            "question": "Write the line that creates a BFS frontier from start.",
            "target": "queue = deque([start])",
            "hint": "Commit to one frontier structure.",
        },
        "graph-guard": {
            "title": "Focus Drill: Graph Guard",
            "prompt": "Focus on writing the skip rule before exploring neighbors.",
            "question": "Write the guard that skips an already seen neighbor.",
            "target": "if nei in visited:\n    continue",
            "hint": "This drill is only the skip rule.",
        },
        "signature": {
            "title": "Focus Drill: Entry Point",
            "prompt": "Focus on writing the function signature and naming the state you will track.",
            "question": "Write a simple Python function signature for the current recall snippet.",
            "target": "def solve(nums):",
            "hint": "Keep the signature minimal.",
        },
        "placeholder": {
            "title": "Focus Drill: Real State Update",
            "prompt": "Focus on replacing the placeholder with the real state update.",
            "question": "Write one concrete state update instead of a placeholder.",
            "target": "count[value] = count.get(value, 0) + 1",
            "hint": "Pick a real update that changes tracked state.",
        },
        "control-flow": {
            "title": "Focus Drill: Main Control Flow",
            "prompt": "Focus on the loop or recursion that applies the invariant once.",
            "question": "Write the main traversal loop for a sequence named nums.",
            "target": "for value in nums:",
            "hint": "Only write the outer control flow.",
        },
        "pointer-movement": {
            "title": "Focus Drill: Pointer Movement",
            "prompt": "Focus on the pointer move that improves the comparison.",
            "question": "Write the branch that moves the left pointer when the pair is too small.",
            "target": "left += 1",
            "hint": "This drill is only the improving move.",
        },
        "bound-update": {
            "title": "Focus Drill: Bound Update",
            "prompt": "Focus on shrinking the binary-search interval with one bound update.",
            "question": "Write the update that discards the left half after a too-small midpoint.",
            "target": "left = mid + 1",
            "hint": "Use one bound update only.",
        },
    }
    details = mapping.get(blocker_key, {})
    if details:
        return details
    if pattern_tag in ("dynamic-programming", "dp"):
        return {
            "title": "Focus Drill: DP State",
            "prompt": "Focus on one DP move at a time until the state meaning feels automatic.",
            "question": "Write a one-dimensional DP array initialization for length n.",
            "target": "dp = [0] * n",
            "hint": "Start by creating the state container.",
        }
    return {
        "title": "Focus Drill",
        "prompt": "Focus on one structural move before you add more lines.",
        "question": "Write one structural line that makes the draft move forward.",
        "target": "for value in nums:",
        "hint": "Keep it to one reusable line.",
    }


def _compose_live_feedback(
    blocker_key: str,
    primary_focus: str,
    next_move: str,
    why: str,
    keep_in_mind: str,
    affirmation: str,
    error_tags: list[str],
    history_summary: dict[str, Any],
    tuning: dict[str, Any],
    stalled: bool,
    pattern_tag: str,
    ignored_drill_down_key: str,
    completed_drill_down_key: str,
) -> dict[str, Any]:
    why_text = why.strip()
    if _should_mention_repeated_drift(history_summary, tuning):
        weakest_tag = str(history_summary.get("weakestTag", "")).strip()
        why_text = f"{why_text.rstrip('.')} Recent attempts have drifted on {weakest_tag} too."

    drill_down_active = bool(
        tuning["drillDownEnabled"]
        and stalled
        and blocker_key
        and blocker_key != ignored_drill_down_key
        and blocker_key != completed_drill_down_key
    )
    drill_down = _live_drill_down_details(blocker_key, pattern_tag) if drill_down_active else {"title": "", "prompt": ""}

    return _truncate_live_feedback_fields({
        "diagnosis": why_text,
        "primaryFocus": primary_focus,
        "immediateCorrection": next_move,
        "keepInMind": keep_in_mind,
        "affirmation": affirmation,
        "nextMove": next_move,
        "why": why_text,
        "microDrill": drill_down["prompt"] if drill_down_active else "Repeat just this move once before adding more.",
        "nextRepTarget": "Keep this move stable on the next rep.",
        "strengths": [affirmation] if affirmation else [],
        "errorTags": error_tags[:1] if tuning["singleIssue"] else error_tags[:6],
        "fullFeedback": "",
        "correctedVersion": "",
        "drillDownActive": drill_down_active,
        "drillDownTitle": drill_down.get("title", ""),
        "drillDownPrompt": drill_down.get("prompt", ""),
        "drillDownQuestion": drill_down.get("question", ""),
        "drillDownTarget": drill_down.get("target", ""),
        "drillDownHint": drill_down.get("hint", ""),
        "drillDownKey": blocker_key if drill_down_active else "",
        "drillDownOverrideLabel": "Ignore this drill-down" if drill_down_active else "",
        "llmUsed": False,
    })


def _live_primary_focus(pattern_tag: str, is_graph_question: bool, has_loop: bool) -> str:
    if is_graph_question:
        return "Clarify the graph traversal structure."
    if pattern_tag == "sliding-window":
        return "Advance the sliding-window invariant."
    if pattern_tag == "two-pointers":
        return "Connect the pointer logic to the comparison."
    if pattern_tag == "binary-search":
        return "Protect the search interval invariant."
    if not has_loop:
        return "Start the control flow that moves the algorithm."
    return "Advance the current structure one clear step."


def _heuristic_live_feedback(
    body: CoachAttemptFeedbackRequest,
    history_summary: dict[str, Any],
    live_history: list[dict[str, Any]],
) -> dict[str, Any]:
    actual_lines = _normalize_code(body.userAnswer)
    tuning = _merged_live_tuning(body)
    ignored_drill_down_key = _ignored_drill_down_key(body)
    completed_drill_down_key = _completed_drill_down_key(body)
    is_graph_question = any(
        tag in body.skillTags for tag in ("graph", "dfs-bfs", "graph-traversal", "union-find")
    )
    has_signature = _draft_flag(body, "hasSignature")
    has_guard = _draft_flag(body, "hasGuard")
    has_loop = _draft_flag(body, "hasLoop")
    has_placeholder = _draft_flag(body, "hasPlaceholder")
    has_bookkeeping = _draft_flag(body, "hasBookkeeping")
    traversal_kind = str(_draft_value(body, "traversalKind", "")).strip()
    base_stage = _live_feedback_stage(body.elapsedMs)
    pattern_tag = _primary_pattern_tag(body.skillTags)

    blocker_key = ""
    primary_focus = ""
    next_move = ""
    why = ""
    keep_in_mind = ""
    error_tags: list[str] = []

    if not has_signature:
        blocker_key = "signature"
        primary_focus = "Anchor the solution first."
        next_move = "Write the function signature and name the state you will track."
        why = "The draft needs an entry point before the algorithm can settle."
        keep_in_mind = "A clear entry point gives every later line a stable job."
        error_tags.append("opening-anchor")
    elif is_graph_question and not has_bookkeeping:
        blocker_key = "graph-bookkeeping"
        primary_focus = "Make the graph state explicit."
        next_move = "Put the visited or frontier state on the page before adding more graph flow."
        why = "The traversal shell is present, but it has no concrete state to update yet."
        keep_in_mind = _graph_keep_in_mind(traversal_kind, has_guard)
        error_tags.append("state-setup")
    elif is_graph_question and not traversal_kind:
        blocker_key = "graph-traversal-choice"
        primary_focus = "Choose the traversal."
        next_move = "Commit to one frontier structure before you add more graph detail."
        why = "The setup has started, but the graph still has no clear movement model."
        keep_in_mind = _graph_keep_in_mind(traversal_kind, has_guard)
        error_tags.append("traversal-choice")
    elif has_placeholder:
        blocker_key = "placeholder"
        primary_focus = "Replace the placeholder with a real update."
        next_move = "Replace the placeholder with the real state change for this step."
        why = "The draft has structure, but one placeholder is still carrying algorithmic work."
        keep_in_mind = _pattern_principle(body.skillTags)
        error_tags.append("placeholder")
    elif is_graph_question and not has_guard:
        blocker_key = "graph-guard"
        primary_focus = "Write the skip rule."
        next_move = "Add the guard that decides which states should be skipped before expanding neighbors."
        why = "The traversal shape is there, but the draft still needs the rule that keeps exploration clean."
        keep_in_mind = _graph_keep_in_mind(traversal_kind, has_guard)
        error_tags.append("guard")
    else:
        stage_rank = _live_stage_rank(base_stage)
        if tuning["specificitySource"] == "time-and-quality":
            quality_penalty = 0
            if body.accuracy < 35:
                quality_penalty += 1
            if not has_loop:
                quality_penalty += 1
            if pattern_tag in ("dynamic-programming", "dp") and not _dp_progress(actual_lines)["has_state_array"]:
                quality_penalty += 1
            if pattern_tag == "sliding-window" and not _sliding_window_progress(actual_lines)["has_shrink_loop"]:
                quality_penalty += 1
            if quality_penalty >= 2:
                stage_rank += 1
        stage = _live_stage_from_rank(stage_rank)

        if pattern_tag == "sliding-window":
            progress = _sliding_window_progress(actual_lines)
            next_move, why, keep_in_mind = _sliding_window_guidance(actual_lines, stage)
            if not progress["has_expand"]:
                blocker_key = "window-expand"
                error_tags.append("control-flow")
            elif not progress["has_shrink_loop"]:
                blocker_key = "window-shrink-loop"
                error_tags.append("invariant")
            elif not progress["has_shrink_update"] or not progress["has_left_move"]:
                blocker_key = "window-shrink-update"
                error_tags.append("state-update")
            elif not progress["has_cleanup"]:
                blocker_key = "window-cleanup"
                error_tags.append("state-update")
            elif not progress["has_score"]:
                blocker_key = "window-score"
                error_tags.append("answer-recording")
            else:
                blocker_key = "window-order"
                error_tags.append("invariant")
        elif pattern_tag == "two-pointers":
            progress = _two_pointer_progress(actual_lines)
            next_move, why, keep_in_mind = _two_pointer_guidance(actual_lines, stage)
            if not progress["has_pair_value"]:
                blocker_key = "pair-value"
                error_tags.append("comparison-setup")
            elif not progress["has_compare"]:
                blocker_key = "pair-compare"
                error_tags.append("comparison")
            elif not progress["has_left_move"] or not progress["has_right_move"]:
                blocker_key = "pointer-movement"
                error_tags.append("pointer-movement")
            elif not progress["has_success_path"]:
                blocker_key = "success-path"
                error_tags.append("return-path")
            else:
                blocker_key = "pointer-invariant"
                error_tags.append("invariant")
        elif pattern_tag == "binary-search":
            progress = _binary_search_progress(actual_lines)
            next_move, why, keep_in_mind = _binary_search_guidance(actual_lines, stage)
            if not progress["has_mid"]:
                blocker_key = "midpoint"
                error_tags.append("midpoint")
            elif not progress["has_compare"]:
                blocker_key = "mid-compare"
                error_tags.append("comparison")
            elif not progress["has_left_update"] or not progress["has_right_update"]:
                blocker_key = "bound-update"
                error_tags.append("interval-update")
            elif not progress["has_return"]:
                blocker_key = "return-path"
                error_tags.append("return-path")
            else:
                blocker_key = "interval-invariant"
                error_tags.append("invariant")
        elif pattern_tag in ("dynamic-programming", "dp"):
            progress = _dp_progress(actual_lines)
            next_move, why, keep_in_mind = _dp_guidance(actual_lines, stage)
            if not progress["has_state_array"]:
                blocker_key = "dp-state-array"
                error_tags.append("state-setup")
            elif not progress["has_base_case"]:
                blocker_key = "dp-base-case"
                error_tags.append("base-case")
            elif not progress["has_loop"]:
                blocker_key = "control-flow"
                error_tags.append("control-flow")
            elif not progress["has_transition"]:
                blocker_key = "dp-transition"
                error_tags.append("transition")
            elif not progress["has_return"]:
                blocker_key = "return-path"
                error_tags.append("return-path")
            else:
                blocker_key = "dp-state-meaning"
                error_tags.append("state-meaning")
        elif not has_loop and (traversal_kind or not is_graph_question):
            blocker_key = "control-flow"
            primary_focus = "Start the main control flow."
            next_move = _live_next_step_for_pattern(pattern_tag, stage, has_loop)
            why = "The setup is on the page, but the algorithm still needs the move that advances state."
            keep_in_mind = _pattern_principle(body.skillTags)
            error_tags.append("control-flow")
        else:
            blocker_key = "state-update"
            primary_focus = "Keep the next move structural."
            next_move = _live_next_step_for_pattern(pattern_tag, stage, has_loop)
            why = "The draft has enough structure now, so one concrete update will help more than a rewrite."
            keep_in_mind = _pattern_principle(body.skillTags)
            error_tags.append("state-update")

        if not primary_focus:
            primary_focus = _live_primary_focus(pattern_tag, is_graph_question, has_loop)

    stalled_duration_ms = _consecutive_blocker_duration_ms(live_history, blocker_key, body.elapsedMs)
    stalled = stalled_duration_ms >= int(tuning["stallThresholdSeconds"]) * 1000

    if stalled and tuning["allowExactEditsWhenStuck"]:
        why = why.rstrip(".") + "."

    affirmation = _stable_live_affirmation(
        pattern_tag,
        is_graph_question,
        has_signature,
        has_bookkeeping,
        has_loop,
        actual_lines,
        tuning,
    )

    response = _compose_live_feedback(
        blocker_key=blocker_key,
        primary_focus=primary_focus or _live_primary_focus(pattern_tag, is_graph_question, has_loop),
        next_move=next_move,
        why=why,
        keep_in_mind=keep_in_mind,
        affirmation=affirmation,
        error_tags=error_tags,
        history_summary=history_summary,
        tuning=tuning,
        stalled=stalled,
        pattern_tag=pattern_tag,
        ignored_drill_down_key=ignored_drill_down_key,
        completed_drill_down_key=completed_drill_down_key,
    )
    response["signals"] = {
        "draft_mode": True,
        "live_stage": base_stage,
        "effective_live_stage": stage if "stage" in locals() else base_stage,
        "pattern_tag": pattern_tag,
        "history_summary": history_summary,
        "draft_milestones": body.draftMilestones,
        "live_blocker_key": blocker_key,
        "stalled_duration_ms": stalled_duration_ms,
        "live_tuning": tuning,
    }
    return response


def _heuristic_attempt_feedback(
    body: CoachAttemptFeedbackRequest, history_summary: dict[str, Any], live_history: list[dict[str, Any]]
) -> dict[str, Any]:
    if body.draftMode:
        return _heuristic_live_feedback(body, history_summary, live_history)

    expected_lines = _normalize_code(body.expectedAnswer)
    actual_lines = _normalize_code(body.userAnswer)
    first_mismatch = _first_mismatch_line(expected_lines, actual_lines)
    indent_errors = _indent_errors(expected_lines, actual_lines)
    missing_count, extra_count = _missing_extra_counts(expected_lines, actual_lines)
    syntax_error = _has_syntax_error(body.userAnswer) if body.userAnswer.strip() else True
    structure = _attempt_structure_summary(expected_lines, actual_lines)
    opening_similarity = _line_similarity(
        _trim_line(expected_lines[0]) if expected_lines else "",
        _trim_line(actual_lines[0]) if actual_lines else "",
    )

    error_tags: list[str] = []
    if syntax_error:
        error_tags.append("syntax")
    if indent_errors > 0:
        error_tags.append("indentation")
    if missing_count > 0:
        error_tags.append("omission")
    if extra_count > 0:
        error_tags.append("intrusion")
    if first_mismatch is not None and first_mismatch <= 3:
        error_tags.append("opening-anchor")
    if body.elapsedMs > 90_000:
        error_tags.append("slow-recall")
    if body.exact:
        error_tags.append("sound")

    strengths: list[str] = []
    if structure["matched"]:
        strengths.append(f"You preserved key structure: {', '.join(structure['matched'][:3])}.")
    if body.accuracy >= 90:
        strengths.append("High structural similarity under recall pressure.")
    if not syntax_error and body.userAnswer.strip():
        strengths.append("Python syntax remained valid.")
    if body.elapsedMs <= 45_000 and body.userAnswer.strip():
        strengths.append("Recall speed is moving toward automaticity.")
    if not strengths:
        strengths.append("You completed a full recall attempt, which gives trainable signal.")

    principle = _pattern_principle(body.skillTags)
    submission_issues = _build_submission_issue_list(
        expected_lines,
        actual_lines,
        structure,
        syntax_error,
        missing_count,
        extra_count,
        body.skillTags,
    )
    corrected_version = body.expectedAnswer.strip() if body.userAnswer.strip() and not body.exact else ""

    if syntax_error:
        primary_focus = "Stabilize syntax before chasing speed."
        immediate = "Fix the first syntax break and retype only that block once from memory."
    elif submission_issues and "pointer movement is backwards" in submission_issues[0]:
        primary_focus = "Fix the direction of the pointer updates."
        immediate = "Re-type the comparison branches and say out loud which pointer changes the value in the needed direction."
    elif submission_issues and "binary-search invariant" in submission_issues[0]:
        primary_focus = "Restore the binary-search interval invariant."
        immediate = "Walk the left/right meaning once, then rewrite only the bound updates."
    elif structure["missing"]:
        primary_focus = f"Rebuild the missing structural pieces: {', '.join(structure['missing'][:2])}."
        immediate = "Retype once while naming the purpose of each missing line before you enter it."
    elif missing_count > 0:
        primary_focus = "Recover omitted logical steps."
        immediate = f"Rehearse the {missing_count} missing line(s) as a contiguous chunk."
    elif indent_errors > 0:
        primary_focus = "Tighten indentation precision."
        immediate = "Repeat once with strict 4-space indentation and colon-driven nesting."
    elif first_mismatch is not None and first_mismatch <= 3:
        primary_focus = "Lock in the opening anchor lines."
        immediate = "Say the first 3 lines aloud, then retype immediately."
    elif body.elapsedMs > 60_000:
        primary_focus = "Increase recall speed without accuracy loss."
        immediate = "Run one timed rep with a 20% lower time cap than this attempt."
    else:
        primary_focus = "Push from almost-right to a sound solution."
        immediate = "Re-run now and fix the logical step that is still unsound."

    diagnosis = (
        f"Accuracy {round(body.accuracy)}% in {body.elapsedMs / 1000:.1f}s; "
        f"first drift at line {first_mismatch if first_mismatch is not None else 'none'}."
    )
    if body.exact:
        diagnosis += " Sound solution achieved."
    elif submission_issues:
        diagnosis += f" Main issue: {submission_issues[0]}"
    elif indent_errors > 0:
        diagnosis += " Core logic is present but indentation drifted."
    else:
        diagnosis += " Mostly correct; errors are precision-level."

    if history_summary["attemptCount"] > 0:
        diagnosis += (
            f" Historical baseline: {history_summary['recentAvgAccuracy']}% over "
            f"{history_summary['attemptCount']} related attempt(s)."
        )
        if history_summary["weakestTag"]:
            diagnosis += f" Weakest recurring tag: {history_summary['weakestTag']}."
        if history_summary["repeatedErrorTags"]:
            diagnosis += (
                " Repeated coach flags: "
                f"{', '.join(history_summary['repeatedErrorTags'][:2])}."
            )

    micro_drill = (
        "2-minute loop: hide answer, type from memory, compare, then immediately retype only the mismatched lines."
    )
    if error_tags and "opening-anchor" in error_tags:
        micro_drill = "3 reps: type only function signature + base case, then full answer once."
    elif "indentation" in error_tags:
        micro_drill = "3 reps: copy recall with explicit indentation count (0/4/8 spaces) before each line."
    elif "syntax" in error_tags:
        micro_drill = "3 reps: type with a brief pause after each ':' and 'return' to protect structure."

    next_target = (
        f"Next rep target: >= {min(100, max(85, int(body.accuracy) + 5))}% accuracy under "
        f"{max(20, int((body.elapsedMs / 1000) * 0.8))}s."
    )
    if body.exact:
        next_target = (
            f"Next rep target: another sound solution under {max(15, int((body.elapsedMs / 1000) * 0.85))}s."
        )

    full_feedback = _build_submission_feedback(
        submission_issues,
        strengths,
        principle,
        history_summary,
    )

    return {
        "diagnosis": diagnosis,
        "primaryFocus": primary_focus,
        "immediateCorrection": immediate,
        "keepInMind": principle,
        "microDrill": micro_drill,
        "nextRepTarget": next_target,
        "strengths": strengths[:3],
        "errorTags": error_tags,
        "fullFeedback": full_feedback,
        "correctedVersion": corrected_version,
        "llmUsed": False,
        "signals": {
            "first_mismatch": first_mismatch,
            "indent_errors": indent_errors,
            "missing_count": missing_count,
            "extra_count": extra_count,
            "syntax_error": syntax_error,
            "opening_similarity": round(opening_similarity, 3),
            "structure": structure,
            "history_summary": history_summary,
            "submission_issues": submission_issues,
            "principle": principle,
        },
    }


def _heuristic_session_plan(body: CoachSessionPlanRequest) -> dict[str, Any]:
    weak_cards = sorted(body.weakestCards, key=lambda c: (c.accuracy, -c.elapsedMs))[:3]
    weak_labels = ", ".join(f"#{c.cardId} ({round(c.accuracy)}%)" for c in weak_cards) or "none"

    if body.avgAccuracy >= 95:
        focus_theme = "Speed compression while protecting soundness."
        warmup = "2 cards, one untimed sound rep each."
        main_set = "6 timed reps at 85% of today’s average time. Stop if soundness drops twice."
    elif body.avgAccuracy >= 85:
        focus_theme = "Close the last precision gaps."
        warmup = "3 opening-anchor drills (signature + base case)."
        main_set = f"8 reps: alternate weak cards ({weak_labels}) with one strong card."
    else:
        focus_theme = "Stabilize structure before speed."
        warmup = "3 slow sound reps with full compare after each attempt."
        main_set = f"10 reps focused on weak cards ({weak_labels}); untimed until >90%."

    cooldown = "1 sound rep on your easiest card to end with a clean memory trace."
    note = (
        "Keep one coaching focus per session. If accuracy falls for two consecutive reps, "
        "drop speed pressure and rebuild soundness."
    )
    headline = (
        f"{body.mode.value} session: {body.correctCount}/{body.attempts} sound, "
        f"{round(body.avgAccuracy)}% avg accuracy."
    )

    return {
        "headline": headline,
        "focusTheme": focus_theme,
        "warmup": warmup,
        "mainSet": main_set,
        "cooldown": cooldown,
        "note": note,
        "llmUsed": False,
    }


def _pattern_slug(pattern: str) -> str:
    return (
        pattern.lower()
        .replace("/", " ")
        .replace("&", " ")
        .replace("-", " ")
        .strip()
        .replace("  ", " ")
        .replace(" ", "-")
    )


def _generic_skill_drill(pattern: str, methods: list[str], index: int) -> dict[str, Any]:
    method = methods[0] if methods else "core invariant"
    slug = _pattern_slug(pattern)
    return {
        "id": f"skill-{slug}-{index + 1}",
        "title": f"Skill Map • {pattern}: {method.title()}",
        "difficulty": "Med.",
        "prompt": f"Memorize a reusable {pattern.lower()} snippet that makes the {method} explicit.",
        "solution": "def solve(items):\n    for item in items:\n        {{missing}}\n    return items",
        "missing": "pass",
        "hint": f"Keep the {method} explicit enough that you could reuse it inside a real interview problem.",
        "tags": ["skill-map", slug],
    }


def _fallback_skill_map_drills(
    body: SkillMapDrillsRequest, progress_summary: dict[str, Any] | None = None
) -> dict[str, Any]:
    templates: dict[str, dict[str, Any]] = {
        "sliding-window": {
            "title": "Skill Map • Sliding Window: Window Score Update",
            "prompt": "Memorize the reusable sliding-window template for tracking the best valid window after expand / shrink steps.",
            "solution": "def longest_at_most_k(nums, k):\n    left = 0\n    counts = {}\n    best = 0\n    for right, value in enumerate(nums):\n        counts[value] = counts.get(value, 0) + 1\n        while len(counts) > k:\n            counts[nums[left]] -= 1\n            if counts[nums[left]] == 0:\n                del counts[nums[left]]\n            left += 1\n        {{missing}}\n    return best",
            "missing": "best = max(best, right - left + 1)",
            "hint": "The pattern is expand, shrink until valid, then score the current window.",
            "tags": ["skill-map", "sliding-window"],
        },
        "two-pointers": {
            "title": "Skill Map • Two Pointers: Sorted Pair Scan",
            "prompt": "Memorize the two-pointer invariant for scanning a sorted array toward a target sum.",
            "solution": "def has_pair(nums, target):\n    left, right = 0, len(nums) - 1\n    while left < right:\n        total = nums[left] + nums[right]\n        if total == target:\n            return True\n        if total < target:\n            {{missing}}\n        else:\n            right -= 1\n    return False",
            "missing": "left += 1",
            "hint": "Only move the pointer whose direction can improve the invariant.",
            "tags": ["skill-map", "two-pointers"],
        },
        "binary-search": {
            "title": "Skill Map • Binary Search: Lower Bound",
            "prompt": "Memorize the lower-bound binary search template that finds the first index with value >= target.",
            "solution": "def lower_bound(nums, target):\n    left, right = 0, len(nums)\n    while left < right:\n        mid = left + (right - left) // 2\n        if nums[mid] < target:\n            left = mid + 1\n        else:\n            {{missing}}\n    return left",
            "missing": "right = mid",
            "hint": "Keep the answer inside the half-open interval [left, right).",
            "tags": ["skill-map", "binary-search"],
        },
        "dfs-bfs": {
            "title": "Skill Map • DFS / BFS: Visited Rule",
            "prompt": "Memorize the BFS visited-state rule that keeps graph traversal stable and reusable.",
            "solution": "from collections import deque\n\ndef bfs_order(graph, start):\n    queue = deque([start])\n    seen = {start}\n    order = []\n    while queue:\n        node = queue.popleft()\n        order.append(node)\n        for nei in graph[node]:\n            if nei in seen:\n                continue\n            {{missing}}\n            queue.append(nei)\n    return order",
            "missing": "seen.add(nei)",
            "hint": "In BFS, decide exactly when a node becomes seen and do it consistently.",
            "tags": ["skill-map", "dfs-bfs", "graph"],
        },
        "backtracking": {
            "title": "Skill Map • Backtracking: Undo Step",
            "prompt": "Memorize the choice / explore / undo rhythm that makes backtracking reusable.",
            "solution": "def subsets(nums):\n    result = []\n    path = []\n    def dfs(index):\n        result.append(path[:])\n        for i in range(index, len(nums)):\n            path.append(nums[i])\n            dfs(i + 1)\n            {{missing}}\n    dfs(0)\n    return result",
            "missing": "path.pop()",
            "hint": "The undo step is what keeps sibling branches correct.",
            "tags": ["skill-map", "backtracking"],
        },
        "heap-priority-queue": {
            "title": "Skill Map • Heap: Keep Top K",
            "prompt": "Memorize the min-heap maintenance pattern for keeping the top-k values in a stream.",
            "solution": "import heapq\n\ndef top_k(nums, k):\n    heap = []\n    for value in nums:\n        heapq.heappush(heap, value)\n        if len(heap) > k:\n            {{missing}}\n    return heap",
            "missing": "heapq.heappop(heap)",
            "hint": "A min-heap keeps only the k best items by ejecting the smallest overflow item.",
            "tags": ["skill-map", "heap"],
        },
        "union-find": {
            "title": "Skill Map • Union Find: Path Compression",
            "prompt": "Memorize the path-compression step inside find so the structure stays reusable across connectivity problems.",
            "solution": "def find(parent, x):\n    if parent[x] != x:\n        {{missing}}\n    return parent[x]",
            "missing": "parent[x] = find(parent, parent[x])",
            "hint": "Compress on the way back so later finds become almost constant time.",
            "tags": ["skill-map", "union-find", "graph"],
        },
        "dynamic-programming": {
            "title": "Skill Map • DP: Transition Update",
            "prompt": "Memorize a 1D dynamic-programming transition that makes state definition and update explicit.",
            "solution": "def min_cost(costs):\n    dp = [0] * (len(costs) + 1)\n    for i in range(2, len(costs) + 1):\n        one = dp[i - 1] + costs[i - 1]\n        two = dp[i - 2] + costs[i - 2]\n        {{missing}}\n    return dp[-1]",
            "missing": "dp[i] = min(one, two)",
            "hint": "Say the state aloud first: what does dp[i] mean before you update it?",
            "tags": ["skill-map", "dynamic-programming", "dp"],
        },
        "graph-traversal": {
            "title": "Skill Map • Graph Traversal: Zero-Indegree Frontier",
            "prompt": "Memorize the topological-sort frontier rule for nodes whose indegree just dropped to zero.",
            "solution": "from collections import deque\n\ndef topo_sort(graph, indegree):\n    queue = deque([node for node, degree in indegree.items() if degree == 0])\n    order = []\n    while queue:\n        node = queue.popleft()\n        order.append(node)\n        for nei in graph[node]:\n            indegree[nei] -= 1\n            if indegree[nei] == 0:\n                {{missing}}\n    return order",
            "missing": "queue.append(nei)",
            "hint": "Topological BFS is just frontier management over zero-indegree nodes.",
            "tags": ["skill-map", "graph-traversal", "graph"],
        },
        "intervals": {
            "title": "Skill Map • Intervals: Append New Segment",
            "prompt": "Memorize the post-sort interval merge pattern for deciding whether to extend or append.",
            "solution": "def merge_intervals(intervals):\n    intervals.sort()\n    merged = [intervals[0][:]]\n    for start, end in intervals[1:]:\n        last_end = merged[-1][1]\n        if start <= last_end:\n            merged[-1][1] = max(last_end, end)\n        else:\n            {{missing}}\n    return merged",
            "missing": "merged.append([start, end])",
            "hint": "After sorting, every interval either extends the last one or starts a new bucket.",
            "tags": ["skill-map", "intervals"],
        },
        "prefix-sums": {
            "title": "Skill Map • Prefix Sums: Running Count Map",
            "prompt": "Memorize the prefix-sum hashmap update that powers reusable subarray-counting patterns.",
            "solution": "def count_subarrays(nums, k):\n    seen = {0: 1}\n    total = 0\n    count = 0\n    for value in nums:\n        total += value\n        count += seen.get(total - k, 0)\n        {{missing}}\n    return count",
            "missing": "seen[total] = seen.get(total, 0) + 1",
            "hint": "Query with the old prefix first, then record the current one.",
            "tags": ["skill-map", "prefix-sums"],
        },
        "monotonic-stack": {
            "title": "Skill Map • Monotonic Stack: Resolve While Popping",
            "prompt": "Memorize the monotonic-stack pop rule that resolves the answer for each index as soon as the invariant breaks.",
            "solution": "def next_greater(nums):\n    stack = []\n    answer = [-1] * len(nums)\n    for i, value in enumerate(nums):\n        while stack and nums[stack[-1]] < value:\n            index = stack.pop()\n            {{missing}}\n        stack.append(i)\n    return answer",
            "missing": "answer[index] = value",
            "hint": "The stack stores unresolved indices until a breaking value arrives.",
            "tags": ["skill-map", "monotonic-stack", "stack"],
        },
    }

    drills: list[dict[str, Any]] = []
    progress_by_pattern = progress_summary.get("patterns", {}) if isinstance(progress_summary, dict) else {}
    nodes = body.skillMap[: body.count] or []
    for index, node in enumerate(nodes):
        slug = _pattern_slug(node.pattern)
        template = templates.get(slug) or _generic_skill_drill(node.pattern, node.methods, index)
        progress = progress_by_pattern.get(slug, {})
        focus_note = _progress_focus_note(progress)
        difficulty = template["difficulty"] if "difficulty" in template else "Med."
        prompt = template["prompt"]
        hint = template["hint"]

        if int(progress.get("attemptCount", 0)) > 0 and float(progress.get("avgAccuracy", 0)) < 85:
            difficulty = "Easy"
            if focus_note:
                hint = f"{hint} {focus_note}".strip()
        elif int(progress.get("attemptCount", 0)) >= 2 and float(progress.get("avgAccuracy", 0)) >= 95:
            difficulty = "Hard"
            prompt = f"{prompt} Keep this rep tight and exact with fewer mental cues."

        drills.append({
            "id": f"skill-{slug}-{index + 1}",
            "title": template["title"],
            "difficulty": difficulty,
            "prompt": prompt,
            "solution": template["solution"],
            "missing": template["missing"],
            "hint": hint,
            "tags": template["tags"],
        })

    return {"drills": drills, "llmUsed": False}


def _call_chat_completion_json(system_prompt: str, user_payload: dict[str, Any]) -> dict[str, Any] | None:
    if not settings.coach_openai_api_key:
        return None

    url = f"{settings.coach_openai_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.coach_openai_model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload)},
        ],
    }
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.coach_openai_api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            content = payload["choices"][0]["message"]["content"]
            return json.loads(content)
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError, TimeoutError):
        return None


async def _attempt_feedback_with_optional_llm(
    body: CoachAttemptFeedbackRequest,
    heuristic: dict[str, Any],
    history: list[dict[str, Any]],
    live_history: list[dict[str, Any]],
) -> dict[str, Any]:
    if not settings.coach_openai_api_key:
        return heuristic

    tuning = _merged_live_tuning(body)
    live_stage = str(heuristic.get("signals", {}).get("effective_live_stage") or _live_feedback_stage(body.elapsedMs)) if body.draftMode else ""
    live_blocker_key = str(heuristic.get("signals", {}).get("live_blocker_key", "")).strip()
    stalled_duration_ms = _consecutive_blocker_duration_ms(live_history, live_blocker_key, body.elapsedMs)
    stalled = stalled_duration_ms >= int(tuning["stallThresholdSeconds"]) * 1000
    reveal_expected_answer = (
        not body.draftMode
        or _stage_at_least(live_stage, str(tuning["canonicalAnswerStage"]))
    )
    tone_instruction = {
        "calm": "Use calm language.",
        "direct": "Use direct language.",
        "technical": "Use precise technical language.",
    }.get(str(tuning["tone"]), "Use calm language.")
    focus_instruction = (
        "Optimize for memorized reproduction rather than interview polish."
        if str(tuning["focusMode"]) == "memorization"
        else "Optimize for interview-ready structure."
    )
    pattern_name_instruction = (
        "You may name the pattern when it materially clarifies the move."
        if tuning["showPatternNames"]
        else "Do not name the pattern explicitly."
    )
    explicit_edit_instruction = (
        "If the user is clearly stalled, you may name the exact edit for one step."
        if tuning["allowExactEditsWhenStuck"]
        else "Do not give exact code edits."
    )

    system_prompt = (
        "You are a calm memorization coach watching a draft in progress. Return strict JSON with keys: "
        "affirmation, nextMove, why, diagnosis, primaryFocus, immediateCorrection, keepInMind, microDrill, nextRepTarget, strengths, errorTags. "
        "Teach the pattern through one structural blocker only. Do not mention multiple issues. "
        "Describe what is already on the page when there is something stable to reinforce; otherwise leave affirmation empty. "
        f"{tone_instruction} {focus_instruction} {pattern_name_instruction} "
        "Avoid the phrase 'still missing'. Avoid coachy filler. Avoid full solutions, code skeletons, and line-by-line rewrites. "
        f"Prefer higher-level phrasing over literal edits unless the user is clearly stalled and explicit edits are allowed. {explicit_edit_instruction} "
        "Make nextMove a single concrete structural move. Make why a single calm sentence explaining that move. "
        "Set diagnosis equal to why and immediateCorrection equal to nextMove. "
        "Every live-feedback string field must be 20 words or fewer."
        if body.draftMode
        else "I am prepping for a Senior Level Tech Interview. Give me feedback on my attempt."
    )
    response_shape = [
        "affirmation",
        "nextMove",
        "why",
        "diagnosis",
        "primaryFocus",
        "immediateCorrection",
        "microDrill",
        "nextRepTarget",
        "strengths",
        "errorTags",
    ]
    if body.draftMode:
        response_shape.append("keepInMind")
    if not body.draftMode:
        response_shape.extend(["fullFeedback", "correctedVersion"])

    llm_payload = {
        "card": {"id": body.cardId, "title": body.cardTitle, "prompt": body.prompt},
        "attempt": {
            "accuracy": body.accuracy,
            "exact": body.exact,
            "elapsedMs": body.elapsedMs,
            "expectedAnswer": (
                body.expectedAnswer[:1200]
                if reveal_expected_answer
                else ""
            ),
            "userAnswer": body.userAnswer[:1200],
        },
        "skillTags": body.skillTags,
        "historicalAttempts": [
            {
                "cardId": item.get("cardId", ""),
                "question": str(item.get("question", ""))[:280],
                "correctAnswer": str(item.get("correctAnswer", ""))[:320],
                "userAnswer": str(item.get("userAnswer", ""))[:320],
                "accuracy": item.get("accuracy", 0),
                "exact": item.get("exact", False),
                "elapsedMs": item.get("elapsedMs", 0),
                "categoryTags": item.get("categoryTags", []),
                "liveFeedbackCount": item.get("liveFeedbackCount", 0),
                "latestLiveFeedback": item.get("latestLiveFeedback", {}),
                "submissionFeedback": item.get("submissionFeedback", {}),
                "createdAt": item.get("createdAt", ""),
            }
            for item in history[:8]
        ],
        "previousAttempts": body.previousAttempts[-3:],
        "draftMode": body.draftMode,
        "liveStage": live_stage,
        "stalledOnSameBlocker": stalled,
        "stalledDurationMs": stalled_duration_ms,
        "draftMilestones": body.draftMilestones,
        "liveTuning": tuning,
        "responseShape": response_shape,
        "heuristic": {
            "affirmation": heuristic.get("affirmation", ""),
            "nextMove": heuristic.get("nextMove", heuristic["immediateCorrection"]),
            "why": heuristic.get("why", heuristic["diagnosis"]),
            "diagnosis": heuristic["diagnosis"],
            "primaryFocus": heuristic["primaryFocus"],
            "signals": heuristic["signals"],
        },
    }

    if not body.draftMode:
        llm_payload["submissionStyle"] = {
            "goal": "Compare the expected answer and the submitted answer directly, then give concise, concrete interview feedback.",
            "do": [
                "Lead with the main mistake or the most important thing the user got right.",
                "Explain the reusable pattern rule or invariant behind the mistake.",
                "Mention up to two additional issues only if they materially affect correctness or interview quality.",
                "Write fullFeedback as natural prose paragraphs, not labels or bullets.",
                "Provide correctedVersion when the attempt is not exact; use expectedAnswer as the ground truth.",
            ],
            "avoid": [
                "Do not say 'Next rep'.",
                "Do not paste a skeleton or coachy filler.",
                "Do not give vague praise without saying what was actually correct.",
                "Do not over-focus on memorization mechanics in submission mode.",
            ],
        }

    llm_response = await asyncio.to_thread(_call_chat_completion_json, system_prompt, llm_payload)
    if not llm_response:
        return heuristic

    required = ["diagnosis", "primaryFocus", "immediateCorrection", "microDrill", "nextRepTarget"]
    if body.draftMode:
        required.extend(["keepInMind", "nextMove", "why"])
    if not body.draftMode:
        required.append("fullFeedback")
    if any(key not in llm_response for key in required):
        return heuristic

    corrected_version = str(llm_response.get("correctedVersion", heuristic.get("correctedVersion", ""))).strip()
    corrected_version = corrected_version.removeprefix("```python").removeprefix("```").removesuffix("```").strip()

    response = {
        **heuristic,
        "affirmation": str(llm_response.get("affirmation", heuristic.get("affirmation", ""))),
        "nextMove": str(llm_response.get("nextMove", heuristic.get("nextMove", heuristic["immediateCorrection"]))),
        "why": str(llm_response.get("why", heuristic.get("why", heuristic["diagnosis"]))),
        "diagnosis": str(llm_response.get("diagnosis", heuristic["diagnosis"])),
        "primaryFocus": str(llm_response.get("primaryFocus", heuristic["primaryFocus"])),
        "immediateCorrection": str(llm_response.get("immediateCorrection", heuristic["immediateCorrection"])),
        "keepInMind": str(llm_response.get("keepInMind", heuristic.get("keepInMind", ""))),
        "microDrill": str(llm_response.get("microDrill", heuristic["microDrill"])),
        "nextRepTarget": str(llm_response.get("nextRepTarget", heuristic["nextRepTarget"])),
        "strengths": [str(x) for x in llm_response.get("strengths", heuristic["strengths"])][:3],
        "errorTags": [str(x) for x in llm_response.get("errorTags", heuristic["errorTags"])][:6],
        "fullFeedback": str(llm_response.get("fullFeedback", heuristic.get("fullFeedback", ""))),
        "correctedVersion": corrected_version or str(heuristic.get("correctedVersion", "")),
        "llmUsed": True,
    }
    if body.draftMode:
        if not response["affirmation"]:
            response["affirmation"] = str(response["strengths"][0]) if response["strengths"] else ""
        response["nextMove"] = response["nextMove"] or response["immediateCorrection"]
        response["why"] = response["why"] or response["diagnosis"]
        response["diagnosis"] = response["why"]
        response["immediateCorrection"] = response["nextMove"]
        return _truncate_live_feedback_fields(response)
    return response


async def _session_plan_with_optional_llm(
    body: CoachSessionPlanRequest, heuristic: dict[str, Any]
) -> dict[str, Any]:
    if not settings.coach_openai_api_key:
        return heuristic

    system_prompt = (
        "You are a training coach building practical next-session plans for recall training. "
        "Return strict JSON with keys: headline, focusTheme, warmup, mainSet, cooldown, note."
    )
    llm_payload = {
        "session": {
            "mode": body.mode.value,
            "questionType": body.questionType,
            "orderType": body.orderType,
            "attempts": body.attempts,
            "correctCount": body.correctCount,
            "avgAccuracy": body.avgAccuracy,
            "avgElapsedMs": body.avgElapsedMs,
        },
        "weakestCards": [c.model_dump() for c in body.weakestCards[:5]],
        "heuristic": heuristic,
    }

    llm_response = await asyncio.to_thread(_call_chat_completion_json, system_prompt, llm_payload)
    if not llm_response:
        return heuristic

    required = ["headline", "focusTheme", "warmup", "mainSet", "cooldown", "note"]
    if any(key not in llm_response for key in required):
        return heuristic

    return {
        "headline": str(llm_response.get("headline", heuristic["headline"])),
        "focusTheme": str(llm_response.get("focusTheme", heuristic["focusTheme"])),
        "warmup": str(llm_response.get("warmup", heuristic["warmup"])),
        "mainSet": str(llm_response.get("mainSet", heuristic["mainSet"])),
        "cooldown": str(llm_response.get("cooldown", heuristic["cooldown"])),
        "note": str(llm_response.get("note", heuristic["note"])),
        "llmUsed": True,
    }


async def _load_skill_map_generation_summary(body: SkillMapDrillsRequest) -> dict[str, Any]:
    pattern_tags = [_pattern_slug(node.pattern) for node in body.skillMap[: body.count] if _pattern_slug(node.pattern)]
    history = await _load_practice_history("", body.questionType, pattern_tags, limit=max(20, body.count * 6))
    return _summarize_skill_map_progress(body.skillMap[: body.count], history)


async def _skill_map_drills_with_optional_llm(
    body: SkillMapDrillsRequest, heuristic: dict[str, Any], progress_summary: dict[str, Any]
) -> dict[str, Any]:
    if not settings.coach_openai_api_key:
        return heuristic

    system_prompt = (
        "You generate atomic Python recall drills for coding interview preparation. "
        "Return strict JSON with key drills, where drills is an array of objects with keys "
        "id, title, difficulty, prompt, solution, missing, hint, tags. "
        "Each drill must teach one reusable LeetCode move from the provided skill map, not a story problem. "
        "Make them concise and pattern-first. Prefer one drill per pattern until you hit the requested count. "
        "The solution must include exactly one '{{missing}}' placeholder, and missing must be the exact code that replaces it. "
        "Keep snippets short enough to memorize, but realistic enough to reuse in senior-level interviews. "
        "Tags must include 'skill-map' and a slug for the pattern."
    )
    llm_payload = {
        "questionType": body.questionType,
        "count": body.count,
        "skillMap": [node.model_dump() for node in body.skillMap[: body.count]],
        "practiceHistory": progress_summary,
        "fallbackExample": heuristic["drills"][:3],
    }

    llm_response = await asyncio.to_thread(_call_chat_completion_json, system_prompt, llm_payload)
    if not llm_response or not isinstance(llm_response.get("drills"), list):
        return heuristic

    drills: list[dict[str, Any]] = []
    for index, raw in enumerate(llm_response["drills"][: body.count]):
        if not isinstance(raw, dict):
            return heuristic
        solution = str(raw.get("solution", "")).strip()
        missing = str(raw.get("missing", "")).strip()
        if "{{missing}}" not in solution or not missing:
            return heuristic
        tags_raw = raw.get("tags", [])
        tags = [str(tag).strip() for tag in tags_raw if str(tag).strip()] if isinstance(tags_raw, list) else []
        if "skill-map" not in tags:
            tags = ["skill-map", *tags]
        drills.append({
            "id": str(raw.get("id", f"skill-map-{index + 1}")),
            "title": str(raw.get("title", f"Skill Map Drill {index + 1}")),
            "difficulty": str(raw.get("difficulty", "Med.")),
            "prompt": str(raw.get("prompt", "")).strip(),
            "solution": solution,
            "missing": missing,
            "hint": str(raw.get("hint", "")).strip(),
            "tags": tags,
        })

    if len(drills) != min(body.count, len(body.skillMap)):
        return heuristic

    return {"drills": drills, "llmUsed": True}


def _stamp_skill_map_drills(drills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    stamped: list[dict[str, Any]] = []
    for index, drill in enumerate(drills):
        tags = [str(tag) for tag in drill.get("tags", [])]
        if "skill-map" not in tags:
            tags = ["skill-map", *tags]
        stamped.append({
            **drill,
            "id": f"skill-map-{stamp}-{index + 1}",
            "tags": tags,
        })
    return stamped


async def _persist_skill_map_drills(
    drills: list[dict[str, Any]], llm_used: bool, progress_summary: dict[str, Any]
) -> None:
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        for drill in drills:
            tags = [str(tag) for tag in drill.get("tags", []) if str(tag).strip()]
            pattern_slug = next((tag for tag in tags if tag != "skill-map"), "")
            generation_context = {
                "llmUsed": llm_used,
                "historySummary": progress_summary.get("overall", {}),
                "patternProgress": progress_summary.get("patterns", {}).get(pattern_slug, {}),
            }
            await conn.execute(
                """
                INSERT INTO generated_skill_map_cards
                    (id, question_type, title, difficulty, prompt, solution, missing, hint, tags,
                     llm_used, generation_context, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT (id) DO NOTHING
                """,
                drill["id"],
                "skill-map",
                drill["title"],
                drill["difficulty"],
                drill["prompt"],
                drill["solution"],
                drill["missing"],
                drill["hint"],
                drill["tags"],
                llm_used,
                json.dumps(generation_context),
                now,
            )


@router.post("/evaluate-attempt", response_model=CoachAttemptEvaluationResponse)
async def coach_attempt_evaluation(body: CoachAttemptEvaluationRequest):
    return _evaluate_attempt_soundness(body.expectedAnswer, body.userAnswer)


@router.post("/attempt-feedback", response_model=CoachAttemptFeedbackResponse)
async def coach_attempt_feedback(body: CoachAttemptFeedbackRequest):
    history = await _load_attempt_history(body)
    live_history = await _load_live_feedback_history(body.interactionId)
    history_summary = _summarize_attempt_history(history)
    heuristic = _heuristic_attempt_feedback(body, history_summary, live_history)
    feedback = await _attempt_feedback_with_optional_llm(body, heuristic, history, live_history)
    await _persist_feedback_event(body, feedback)
    feedback.pop("signals", None)
    return feedback


@router.post("/session-plan", response_model=CoachSessionPlanResponse)
async def coach_session_plan(body: CoachSessionPlanRequest):
    heuristic = _heuristic_session_plan(body)
    plan = await _session_plan_with_optional_llm(body, heuristic)
    return plan


@router.post("/history", response_model=CoachPracticeHistoryResponse)
async def coach_practice_history(body: CoachPracticeHistoryRequest):
    history = await _load_practice_history(body.cardId, body.questionType, body.skillTags, limit=body.limit)
    return {
        "summary": _summarize_attempt_history(history),
        "entries": history,
    }


@router.post("/skill-map-drills", response_model=SkillMapDrillsResponse)
async def coach_skill_map_drills(body: SkillMapDrillsRequest):
    progress_summary = await _load_skill_map_generation_summary(body)
    heuristic = _fallback_skill_map_drills(body, progress_summary)
    drills = await _skill_map_drills_with_optional_llm(body, heuristic, progress_summary)
    stamped = _stamp_skill_map_drills(drills["drills"])
    await _persist_skill_map_drills(stamped, bool(drills.get("llmUsed")), progress_summary)
    return {"drills": stamped, "llmUsed": bool(drills.get("llmUsed"))}
