from __future__ import annotations

import ast
import asyncio
import json
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
    CoachAttemptFeedbackRequest,
    CoachAttemptFeedbackResponse,
    CoachSessionPlanRequest,
    CoachSessionPlanResponse,
    SkillMapDrillsRequest,
    SkillMapDrillsResponse,
)

router = APIRouter(prefix="/api/coach", tags=["coach"])


def _normalize_code(code: str) -> str:
    return (
        code.replace("\r\n", "\n")
        .split("\n")
    )


def _trim_line(line: str) -> str:
    return line.rstrip()


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
    pool = get_pool()

    async with pool.acquire() as conn:
        if body.skillTags:
            rows = await conn.fetch(
                """
                SELECT
                    card_id AS "cardId",
                    card_title AS "cardTitle",
                    accuracy,
                    exact,
                    elapsed_ms AS "elapsedMs",
                    category_tags AS "categoryTags",
                    coach_feedback AS "coachFeedback",
                    created_at
                FROM score_attempts
                WHERE mode = 'main-recall'
                  AND (card_id = $1 OR category_tags && $2::text[])
                ORDER BY created_at DESC
                LIMIT 20
                """,
                body.cardId,
                body.skillTags,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT
                    card_id AS "cardId",
                    card_title AS "cardTitle",
                    accuracy,
                    exact,
                    elapsed_ms AS "elapsedMs",
                    category_tags AS "categoryTags",
                    coach_feedback AS "coachFeedback",
                    created_at
                FROM score_attempts
                WHERE mode = 'main-recall'
                  AND (card_id = $1 OR question_type = $2)
                ORDER BY created_at DESC
                LIMIT 20
                """,
                body.cardId,
                body.questionType,
            )

    history: list[dict[str, Any]] = []
    for row in rows:
        feedback = row["coachFeedback"]
        if isinstance(feedback, str):
            try:
                feedback = json.loads(feedback)
            except ValueError:
                feedback = {}
        history.append({
            "cardId": row["cardId"],
            "cardTitle": row["cardTitle"],
            "accuracy": float(row["accuracy"] or 0),
            "exact": bool(row["exact"]),
            "elapsedMs": int(row["elapsedMs"] or 0),
            "categoryTags": list(row["categoryTags"] or []),
            "coachFeedback": feedback if isinstance(feedback, dict) else {},
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
        }

    accuracies = [float(item.get("accuracy", 0)) for item in history]
    tag_scores: dict[str, list[float]] = {}
    error_counts: Counter[str] = Counter()
    for item in history:
        for tag in item.get("categoryTags", []):
            tag_scores.setdefault(tag, []).append(float(item.get("accuracy", 0)))
        feedback = item.get("coachFeedback", {})
        for tag in feedback.get("errorTags", []) if isinstance(feedback, dict) else []:
            error_counts[str(tag)] += 1

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
    }


def _heuristic_attempt_feedback(
    body: CoachAttemptFeedbackRequest, history_summary: dict[str, Any]
) -> dict[str, Any]:
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
        error_tags.append("exact")

    strengths: list[str] = []
    if structure["matched"]:
        strengths.append(f"You preserved key structure: {', '.join(structure['matched'][:3])}.")
    if body.accuracy >= 90:
        strengths.append("High token-level accuracy under recall pressure.")
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
        primary_focus = "Push from near-exact to exact recall."
        immediate = "Re-run now and target zero character drift."

    diagnosis = (
        f"Accuracy {round(body.accuracy)}% in {body.elapsedMs / 1000:.1f}s; "
        f"first drift at line {first_mismatch if first_mismatch is not None else 'none'}."
    )
    if body.exact:
        diagnosis += " Exact recall achieved."
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
            f"Next rep target: exact recall again under {max(15, int((body.elapsedMs / 1000) * 0.85))}s."
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
        focus_theme = "Speed compression while protecting exactness."
        warmup = "2 cards, one untimed exact rep each."
        main_set = "6 timed reps at 85% of today’s average time. Stop if exactness drops twice."
    elif body.avgAccuracy >= 85:
        focus_theme = "Close the last precision gaps."
        warmup = "3 opening-anchor drills (signature + base case)."
        main_set = f"8 reps: alternate weak cards ({weak_labels}) with one strong card."
    else:
        focus_theme = "Stabilize structure before speed."
        warmup = "3 slow exact reps with full compare after each attempt."
        main_set = f"10 reps focused on weak cards ({weak_labels}); untimed until >90%."

    cooldown = "1 exact rep on your easiest card to end with a clean memory trace."
    note = (
        "Keep one coaching focus per session. If accuracy falls for two consecutive reps, "
        "drop speed pressure and rebuild exactness."
    )
    headline = (
        f"{body.mode.value} session: {body.correctCount}/{body.attempts} exact, "
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


def _fallback_skill_map_drills(body: SkillMapDrillsRequest) -> dict[str, Any]:
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
    nodes = body.skillMap[: body.count] or []
    for index, node in enumerate(nodes):
        slug = _pattern_slug(node.pattern)
        template = templates.get(slug) or _generic_skill_drill(node.pattern, node.methods, index)
        drills.append({
            "id": f"skill-{slug}-{index + 1}",
            "title": template["title"],
            "difficulty": template["difficulty"] if "difficulty" in template else "Med.",
            "prompt": template["prompt"],
            "solution": template["solution"],
            "missing": template["missing"],
            "hint": template["hint"],
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
    body: CoachAttemptFeedbackRequest, heuristic: dict[str, Any], history: list[dict[str, Any]]
) -> dict[str, Any]:
    if not settings.coach_openai_api_key:
        return heuristic

    system_prompt = (
        "You are a live coding coach watching a draft in progress. Return strict JSON with keys: "
        "diagnosis, primaryFocus, immediateCorrection, microDrill, nextRepTarget, strengths, errorTags. "
        "Be concise, structural, and general. Do not give full solutions, code skeletons, or line-by-line rewrites. "
        "Prefer advice that generalizes to this approach and would still be useful on similar interview problems. "
        "Give one high-value next structural move."
        if body.draftMode
        else "I am prepping for a Senior Level Tech Interview. Give me feedback on my attempt."
    )
    response_shape = [
        "diagnosis",
        "primaryFocus",
        "immediateCorrection",
        "microDrill",
        "nextRepTarget",
        "strengths",
        "errorTags",
    ]
    if not body.draftMode:
        response_shape.extend(["fullFeedback", "correctedVersion"])

    llm_payload = {
        "card": {"id": body.cardId, "title": body.cardTitle, "prompt": body.prompt},
        "attempt": {
            "accuracy": body.accuracy,
            "exact": body.exact,
            "elapsedMs": body.elapsedMs,
            "expectedAnswer": body.expectedAnswer[:1200],
            "userAnswer": body.userAnswer[:1200],
        },
        "skillTags": body.skillTags,
        "historicalAttempts": history[:8],
        "previousAttempts": body.previousAttempts[-3:],
        "draftMode": body.draftMode,
        "draftMilestones": body.draftMilestones,
        "responseShape": response_shape,
        "heuristic": {
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
    if not body.draftMode:
        required.append("fullFeedback")
    if any(key not in llm_response for key in required):
        return heuristic

    corrected_version = str(llm_response.get("correctedVersion", heuristic.get("correctedVersion", ""))).strip()
    corrected_version = corrected_version.removeprefix("```python").removeprefix("```").removesuffix("```").strip()

    return {
        **heuristic,
        "diagnosis": str(llm_response.get("diagnosis", heuristic["diagnosis"])),
        "primaryFocus": str(llm_response.get("primaryFocus", heuristic["primaryFocus"])),
        "immediateCorrection": str(llm_response.get("immediateCorrection", heuristic["immediateCorrection"])),
        "microDrill": str(llm_response.get("microDrill", heuristic["microDrill"])),
        "nextRepTarget": str(llm_response.get("nextRepTarget", heuristic["nextRepTarget"])),
        "strengths": [str(x) for x in llm_response.get("strengths", heuristic["strengths"])][:3],
        "errorTags": [str(x) for x in llm_response.get("errorTags", heuristic["errorTags"])][:6],
        "fullFeedback": str(llm_response.get("fullFeedback", heuristic.get("fullFeedback", ""))),
        "correctedVersion": corrected_version or str(heuristic.get("correctedVersion", "")),
        "llmUsed": True,
    }


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


async def _skill_map_drills_with_optional_llm(
    body: SkillMapDrillsRequest, heuristic: dict[str, Any]
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


async def _persist_skill_map_drills(drills: list[dict[str, Any]], llm_used: bool) -> None:
    pool = get_pool()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    async with pool.acquire() as conn:
        for drill in drills:
            await conn.execute(
                """
                INSERT INTO generated_skill_map_cards
                    (id, question_type, title, difficulty, prompt, solution, missing, hint, tags, llm_used, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
                now,
            )


@router.post("/attempt-feedback", response_model=CoachAttemptFeedbackResponse)
async def coach_attempt_feedback(body: CoachAttemptFeedbackRequest):
    history = await _load_attempt_history(body)
    history_summary = _summarize_attempt_history(history)
    heuristic = _heuristic_attempt_feedback(body, history_summary)
    feedback = await _attempt_feedback_with_optional_llm(body, heuristic, history)
    feedback.pop("signals", None)
    return feedback


@router.post("/session-plan", response_model=CoachSessionPlanResponse)
async def coach_session_plan(body: CoachSessionPlanRequest):
    heuristic = _heuristic_session_plan(body)
    plan = await _session_plan_with_optional_llm(body, heuristic)
    return plan


@router.post("/skill-map-drills", response_model=SkillMapDrillsResponse)
async def coach_skill_map_drills(body: SkillMapDrillsRequest):
    heuristic = _fallback_skill_map_drills(body)
    drills = await _skill_map_drills_with_optional_llm(body, heuristic)
    stamped = _stamp_skill_map_drills(drills["drills"])
    await _persist_skill_map_drills(stamped, bool(drills.get("llmUsed")))
    return {"drills": stamped, "llmUsed": bool(drills.get("llmUsed"))}
