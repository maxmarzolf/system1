from __future__ import annotations

import re
from collections import Counter
from typing import Any, TypedDict

from app.models import SkillMapNode, TemplateMode
from app.readiness import READINESS_MODE_ORDER, summarize_readiness
from app.submission_rubric import summarize_submission_rubrics
from app.domain.submission_evaluation import evaluation_feedback


class AttemptHistoryEntry(TypedDict, total=False):
    templateMode: str
    categoryTags: list[str]
    signals: dict[str, Any]
    question: str
    successful: bool


class AttemptHistorySummary(TypedDict, total=False):
    attemptCount: int
    successRate: float
    weakestTag: str
    repeatedErrorTags: list[str]
    recentPrimaryFocuses: list[str]
    recentQuestions: list[str]
    readiness: float
    daysSinceLastSubmit: int | None
    stale: bool
    dimensionSummary: dict[str, Any]
    templateModes: dict[str, dict[str, Any]]


class PatternProgressSummary(TypedDict, total=False):
    pattern: str
    attemptCount: int
    successRate: float
    readiness: float
    repeatedErrorTags: list[str]
    latestPrimaryFocus: str
    latestQuestion: str
    stale: bool
    dimensionSummary: dict[str, Any]


class SkillMapProgressSummary(TypedDict):
    overall: dict[str, Any]
    patterns: dict[str, PatternProgressSummary]


def _pattern_slug(text: str) -> str:
    return re.sub(
        r"\s+",
        "-",
        re.sub(r"[^a-z0-9\s-]", " ", text.lower().replace("/", " ").replace("&", " ").replace("-", " ")).strip(),
    )


def summarize_attempt_history(history: list[AttemptHistoryEntry]) -> AttemptHistorySummary:
    template_mode_summaries = {
        mode: {
            **summarize_readiness([item for item in history if str(item.get("templateMode", "")) == mode]),
            "dimensionSummary": summarize_submission_rubrics([
                item for item in history if str(item.get("templateMode", "")) == mode
            ]),
        }
        for mode in READINESS_MODE_ORDER
    }
    readiness_summary = summarize_readiness(history)
    dimension_summary = summarize_submission_rubrics(history)
    if not history:
        return {
            "attemptCount": 0,
            "successRate": 0,
            "weakestTag": "",
            "repeatedErrorTags": [],
            "recentPrimaryFocuses": [],
            "recentQuestions": [],
            "readiness": readiness_summary["readiness"],
            "daysSinceLastSubmit": readiness_summary["daysSinceLastSubmit"],
            "stale": readiness_summary["stale"],
            "dimensionSummary": dimension_summary,
            "templateModes": template_mode_summaries,
        }

    successes = [bool(item.get("successful")) for item in history]
    tag_outcomes: dict[str, list[bool]] = {}
    error_counts: Counter[str] = Counter()
    primary_focuses: list[str] = []
    recent_questions: list[str] = []
    for item in history:
        for tag in item.get("categoryTags", []):
            tag_outcomes.setdefault(tag, []).append(bool(item.get("successful")))
        signals = item.get("signals", {})
        feedback = evaluation_feedback(signals.get("evaluation")) if isinstance(signals, dict) else {}
        for tag in feedback.get("errorTags", []) if isinstance(feedback, dict) else []:
            error_counts[str(tag)] += 1
        if isinstance(feedback, dict) and feedback.get("primaryFocus"):
            primary_focuses.append(str(feedback["primaryFocus"]))
        if item.get("question"):
            recent_questions.append(str(item["question"]))

    weakest_tag = ""
    weakest_rate = 101.0
    for tag, values in tag_outcomes.items():
        if not values:
            continue
        rate = (sum(values) / len(values)) * 100
        if rate < weakest_rate:
            weakest_rate = rate
            weakest_tag = tag

    return {
        "attemptCount": len(history),
        "successRate": round((sum(successes) / len(successes)) * 100, 1),
        "weakestTag": weakest_tag,
        "repeatedErrorTags": [tag for tag, count in error_counts.most_common(3) if count >= 2],
        "recentPrimaryFocuses": primary_focuses[:3],
        "recentQuestions": recent_questions[:3],
        "readiness": readiness_summary["readiness"],
        "daysSinceLastSubmit": readiness_summary["daysSinceLastSubmit"],
        "stale": readiness_summary["stale"],
        "dimensionSummary": dimension_summary,
        "templateModes": template_mode_summaries,
    }


def summarize_skill_map_progress(
    skill_map: list[SkillMapNode], history: list[AttemptHistoryEntry]
) -> SkillMapProgressSummary:
    progress_by_pattern: dict[str, PatternProgressSummary] = {}

    for node in skill_map:
        slug = _pattern_slug(getattr(node, "algorithm", ""))
        if not slug:
            continue
        progress_by_pattern[slug] = {
            "pattern": getattr(node, "algorithm", slug),
            "attemptCount": 0,
            "successRate": 0.0,
            "readiness": 0.0,
            "repeatedErrorTags": [],
            "latestPrimaryFocus": "",
            "latestQuestion": "",
            "stale": False,
            "dimensionSummary": {},
        }

    outcome_buckets: dict[str, list[bool]] = {slug: [] for slug in progress_by_pattern}
    error_counts: dict[str, Counter[str]] = {slug: Counter() for slug in progress_by_pattern}

    for item in history:
        item_tags = {str(tag) for tag in item.get("categoryTags", [])}
        signals = item.get("signals", {})
        feedback = evaluation_feedback(signals.get("evaluation")) if isinstance(signals, dict) else {}
        for slug, summary in progress_by_pattern.items():
            if slug not in item_tags:
                continue
            summary["attemptCount"] += 1
            outcome_buckets[slug].append(bool(item.get("successful")))
            for tag in feedback.get("errorTags", []) if isinstance(feedback, dict) else []:
                error_counts[slug][str(tag)] += 1
            if not summary["latestPrimaryFocus"] and isinstance(feedback, dict):
                summary["latestPrimaryFocus"] = str(feedback.get("primaryFocus", "")).strip()
            if not summary["latestQuestion"]:
                summary["latestQuestion"] = str(item.get("question", "")).strip()

    weak_patterns: list[str] = []
    for slug, summary in progress_by_pattern.items():
        outcomes = outcome_buckets[slug]
        attempts = int(summary["attemptCount"])
        pattern_history = [item for item in history if slug in {str(tag) for tag in item.get("categoryTags", [])}]
        readiness_summary = summarize_readiness(pattern_history)
        if outcomes:
            summary["successRate"] = round((sum(outcomes) / len(outcomes)) * 100, 1)
        summary["repeatedErrorTags"] = [tag for tag, count in error_counts[slug].most_common(3) if count >= 2]
        summary["readiness"] = readiness_summary["readiness"]
        summary["stale"] = readiness_summary["stale"]
        summary["dimensionSummary"] = summarize_submission_rubrics(pattern_history)
        if attempts > 0 and float(summary["successRate"]) < 100:
            weak_patterns.append(slug)

    overall_attempts = len(history)
    overall_success_rate = round(
        (sum(bool(item.get("successful")) for item in history) / overall_attempts) * 100, 1
    ) if overall_attempts else 0.0

    return {
        "overall": {
            "attemptCount": overall_attempts,
            "successRate": overall_success_rate,
            "weakPatterns": weak_patterns[:5],
            "readiness": summarize_readiness(history)["readiness"],
            "dimensionSummary": summarize_submission_rubrics(history),
        },
        "patterns": progress_by_pattern,
    }


def progress_focus_note(progress: PatternProgressSummary | dict[str, Any]) -> str:
    if not progress or int(progress.get("attemptCount", 0)) == 0:
        return ""
    repeated = [str(tag) for tag in progress.get("repeatedErrorTags", []) if str(tag).strip()]
    if repeated:
        return f"Recent weak spot: {', '.join(repeated[:2])}."
    latest_focus = str(progress.get("latestPrimaryFocus", "")).strip()
    if latest_focus:
        return latest_focus
    return ""


def primary_pattern_tag(skill_tags: list[str]) -> str:
    for tag in (
        "sliding-window",
        "two-pointers",
        "binary-search",
        "trees",
        "graphs",
        "dfs-bfs",
        "graph-traversal",
        "backtracking",
        "heap-priority-queue",
        "heap",
        "union-find",
        "dynamic-programming",
        "dp",
        "intervals",
        "prefix-sums",
        "monotonic-stack",
        "stacks-queues",
        "linked-lists",
        "matrix-grid",
        "trie",
        "sorting",
        "greedy-sorting",
        "stack",
    ):
        if tag in skill_tags:
            return tag
    return ""


def pattern_display_name(skill_tags: list[str]) -> str:
    pattern_tag = primary_pattern_tag(skill_tags)
    return {
        "sliding-window": "sliding window",
        "two-pointers": "two pointers",
        "binary-search": "binary search",
        "trees": "trees",
        "graphs": "graphs",
        "dfs-bfs": "graphs",
        "graph-traversal": "graphs",
        "backtracking": "backtracking",
        "heap-priority-queue": "heap",
        "heap": "heap",
        "union-find": "union find",
        "dynamic-programming": "dynamic programming",
        "dp": "dynamic programming",
        "intervals": "intervals",
        "prefix-sums": "prefix sums",
        "monotonic-stack": "monotonic stack",
        "stacks-queues": "stacks and queues",
        "linked-lists": "linked lists",
        "matrix-grid": "matrix grid",
        "trie": "trie",
        "sorting": "sorting",
        "greedy-sorting": "sorting",
        "stack": "stack",
    }.get(pattern_tag, "algorithm")


def algorithmic_template_label(skill_tags: list[str], template_mode: str) -> str:
    pattern_name = pattern_display_name(skill_tags)
    if pattern_name == "algorithm":
        return {
            TemplateMode.algorithm.value: "algorithm template",
        }.get(template_mode, "algorithm template")
    return {
        TemplateMode.algorithm.value: f"{pattern_name} template",
    }.get(template_mode, f"{pattern_name} template")
