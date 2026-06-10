from __future__ import annotations

import re
from collections import Counter
from typing import Any, TypedDict

from app.models import SkillMapNode, TemplateMode
from app.readiness import READINESS_MODE_ORDER, summarize_readiness
from app.submission_rubric import summarize_submission_rubrics


class AttemptHistoryEntry(TypedDict, total=False):
    templateMode: str
    categoryTags: list[str]
    submissionFeedback: dict[str, Any]
    question: str
    accuracy: float
    exact: bool


class AttemptHistorySummary(TypedDict, total=False):
    attemptCount: int
    recentAvgAccuracy: float
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
    avgAccuracy: float
    readiness: float
    exactRate: float
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
            "recentAvgAccuracy": 0,
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
        slug = _pattern_slug(getattr(node, "pattern", ""))
        if not slug:
            continue
        progress_by_pattern[slug] = {
            "pattern": getattr(node, "pattern", slug),
            "attemptCount": 0,
            "avgAccuracy": 0.0,
            "readiness": 0.0,
            "exactRate": 0.0,
            "repeatedErrorTags": [],
            "latestPrimaryFocus": "",
            "latestQuestion": "",
            "stale": False,
            "dimensionSummary": {},
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
        pattern_history = [item for item in history if slug in {str(tag) for tag in item.get("categoryTags", [])}]
        readiness_summary = summarize_readiness(pattern_history)
        if accuracies:
            summary["avgAccuracy"] = round(sum(accuracies) / len(accuracies), 1)
            summary["exactRate"] = round((exact_counts[slug] / len(accuracies)) * 100, 1)
        summary["repeatedErrorTags"] = [tag for tag, count in error_counts[slug].most_common(3) if count >= 2]
        summary["readiness"] = readiness_summary["readiness"]
        summary["stale"] = readiness_summary["stale"]
        summary["dimensionSummary"] = summarize_submission_rubrics(pattern_history)
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
        "dfs-bfs": "DFS/BFS",
        "graph-traversal": "graph traversal",
        "backtracking": "backtracking",
        "heap-priority-queue": "heap",
        "heap": "heap",
        "union-find": "union find",
        "dynamic-programming": "dynamic programming",
        "dp": "dynamic programming",
        "intervals": "intervals",
        "prefix-sums": "prefix sums",
        "monotonic-stack": "monotonic stack",
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
