"""Inline decision notes and core-shape/inline template targets."""

from __future__ import annotations

import re
from typing import Any

from app.core.generator.types import INLINE_NOTE_COLUMN
from app.core.generator.code_style import (
    apply_variable_name_style,
    normalize_specimen_tuning,
    strip_python_type_hints,
)


def entry_point_from_template_target(template_mode: str, target: str) -> str:
    lines = str(target or "").replace("\r\n", "\n").split("\n")
    first_line = next((line.strip() for line in lines if line.strip()), "")
    match = re.match(r"def\s+([A-Za-z_]\w*)\s*\(([^)]*)\):", first_line)
    return f"{match.group(1)}({match.group(2)})" if match else ""


def _shorten_annotation_note(value: str, max_words: int = 16) -> str:
    cleaned = re.sub(r"#\s*", "", str(value or ""))
    cleaned = re.sub(r"\bINVARIANT\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[.]+$", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return " ".join(cleaned.split()[:max_words]) if cleaned else ""


def _inline_decision_note_for_pattern(pattern_slug: str) -> str:
    return {
        "sliding-window": "window valid before scoring",
        "two-pointers": "answer stays inside pointers",
        "binary-search": "answer stays inside bounds",
        "dynamic-programming": "take skip summarize processed prefix",
        "dp": "take skip summarize processed prefix",
        "graph-traversal": "frontier holds unvisited work",
        "dfs-bfs": "frontier holds unvisited work",
        "backtracking": "path matches current branch",
        "heap": "heap holds current top-k",
        "union-find": "roots name connected groups",
        "intervals": "merged tail alone can overlap",
        "prefix-sums": "seen holds previous prefixes",
        "monotonic-stack": "stack keeps unresolved decreasing values",
        "stack": "stack keeps unresolved decreasing values",
    }.get(pattern_slug, "state preserves valid updates")


def _inline_note_for_line(trimmed_line: str, pattern_slug: str) -> str:
    if re.match(r"^return\b", trimmed_line):
        if re.search(r"max\(take,\s*skip\)", trimmed_line):
            return "best of final choices"
        if re.search(r"return\s+0\b", trimmed_line):
            return "nothing to choose"
        if re.search(r"return\s+out\b|return\s+res\b|return\s+result\b", trimmed_line):
            return "return collected result"
        return ""
    if re.match(r"^while\b", trimmed_line):
        if pattern_slug == "sliding-window":
            return "shrink until window is valid"
        if pattern_slug == "binary-search":
            return "keep narrowing the search"
        if pattern_slug in {"dfs-bfs", "graph-traversal"}:
            return "process frontier until empty"
        return ""
    if re.match(r"^(def|for|if|elif|else)\b", trimmed_line):
        return ""
    if pattern_slug == "sliding-window":
        if re.search(r"\b(best|ans)\s*=\s*max\(", trimmed_line):
            return "keep best valid window"
        if re.search(r"\b(left|l)\s*\+=", trimmed_line):
            return "shrink from the left"
        if re.search(r"\b\w+\[[^\]]+\]\s*=\s*\w+\.get\([^)]*\)\s*\+\s*1", trimmed_line) or re.search(r"\b\w+\[[^\]]+\]\s*\+=", trimmed_line):
            return "include entering value"
        if re.search(r"\b\w+\[[^\]]+\]\s*-=", trimmed_line):
            return "remove leaving value"
        if re.match(r"^del\b", trimmed_line):
            return "drop zero count"
        if re.search(r"\.(append|add)\(", trimmed_line) or re.match(r"^(out|res|result)\s*=\s*\[", trimmed_line):
            return "record current window"
        return ""
    if pattern_slug in {"dfs-bfs", "graph-traversal"}:
        if re.search(r"\bvisited\.add\(", trimmed_line) or re.search(r"\bseen\.add\(", trimmed_line):
            return "mark before enqueueing"
        if re.search(r"\b(popleft|pop)\(", trimmed_line):
            return "take next frontier node"
        if re.search(r"\b(q|queue|frontier)\.(append|add|push)\(", trimmed_line):
            return "enqueue unseen neighbor"
        if re.search(r"\.(append|add)\(", trimmed_line):
            return "record reached node"
        return ""
    if pattern_slug == "two-pointers":
        if re.search(r"\bleft\s*\+=", trimmed_line) or re.search(r"\bl\s*\+=", trimmed_line):
            return "move left pointer inward"
        if re.search(r"\bright\s*-=", trimmed_line) or re.search(r"\br\s*-=", trimmed_line):
            return "move right pointer inward"
        if re.search(r"\b(total|cur|area)\s*=", trimmed_line):
            return "measure current pair"
        return ""
    if pattern_slug in {"dynamic-programming", "dp"}:
        if re.match(r"^take\s*=\s*0\b", trimmed_line):
            return "best if previous was taken"
        if re.match(r"^skip\s*=\s*0\b", trimmed_line):
            return "best if previous was skipped"
        if re.search(r"take\s*,\s*skip\s*=", trimmed_line):
            return "take x or skip x"
        if re.search(r"dp\[|transition", trimmed_line):
            return "build from solved states"
    if pattern_slug == "backtracking":
        if re.search(r"\b(record|res|result|out)\.(append|add)\(", trimmed_line):
            return "record completed path"
        if re.search(r"\bpath\.(append|add)\(", trimmed_line):
            return "choose current item"
        if re.search(r"\bpath\.pop\(", trimmed_line):
            return "undo current choice"
        if re.search(r"\b(dfs|backtrack|search)\(", trimmed_line):
            return "explore this branch"
        return ""
    if pattern_slug == "heap" and re.search(r"heappush", trimmed_line):
        return "include new candidate"
    if pattern_slug == "heap" and re.search(r"heappop", trimmed_line):
        return "drop smallest kept item"
    if pattern_slug == "binary-search" and re.search(r"mid\s*=", trimmed_line):
        return "probe middle boundary"
    if pattern_slug == "binary-search" and re.search(r"left\s*=\s*mid", trimmed_line):
        return "discard lower half"
    if pattern_slug == "binary-search" and re.search(r"right\s*=\s*mid", trimmed_line):
        return "keep possible boundary"
    if pattern_slug in {"intervals", "prefix-sums", "monotonic-stack", "stack"}:
        if re.search(r"\.(append|add|push)\(", trimmed_line):
            return "record resolved state"
        if re.search(r"\.(pop|remove)\(", trimmed_line):
            return "discard stale candidate"
        return ""
    if re.search(r"\b(union|find)\b", trimmed_line):
        return "merge or locate root"
    if pattern_slug == "union-find" and re.match(r"^(parent|rank)\b", trimmed_line):
        return "self-label before merging"
    return ""


def _append_aligned_note(line: str, note: str) -> str:
    compact_note = _shorten_annotation_note(note)
    if not compact_note:
        return line
    trimmed_right = line.rstrip()
    if not trimmed_right:
        return f"{' ' * INLINE_NOTE_COLUMN}{compact_note}"
    padding = " " * max(2, INLINE_NOTE_COLUMN - len(trimmed_right))
    return f"{trimmed_right}{padding}{compact_note}"


INLINE_GENERIC_NOTES = (
    "update state for next decision",
    "return final answer",
    "restore rule before continuing",
    "move through core step",
    "choose rule-preserving branch",
    "repeat until state settles",
    "state depends on solved states",
)


def _remove_duplicate_inline_notes(note: str) -> str:
    cleaned = str(note or "").strip()
    for generic_note in INLINE_GENERIC_NOTES:
        escaped = re.escape(generic_note)
        cleaned = re.sub(rf"\b{escaped}\s+{escaped}\b", generic_note, cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _strip_known_inline_note(line: str) -> str:
    lower = line.lower()
    indexes = [lower.find(note.lower()) for note in INLINE_GENERIC_NOTES if lower.find(note.lower()) >= 0]
    return line[: min(indexes)].rstrip() if indexes else line


def _has_aligned_inline_note(line: str) -> bool:
    return bool(re.search(r".*\S\s{6,}\S", line) or re.match(rf"^\s{{{INLINE_NOTE_COLUMN},}}\S", line))


def _append_inline_note(line: str, pattern_slug: str) -> str:
    if _has_aligned_inline_note(line):
        note_only = re.match(rf"^(\s{{{INLINE_NOTE_COLUMN},}})(\S.*)$", line)
        if note_only:
            cleaned_note = _remove_duplicate_inline_notes(note_only.group(2))
            if any(note.lower() == cleaned_note.lower() for note in INLINE_GENERIC_NOTES):
                return _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug))
            return _append_aligned_note("", cleaned_note)
        match = re.match(r"^(.*?\S)(\s{6,})(\S.*)$", line)
        if not match:
            return line.rstrip()
        code = match.group(1)
        cleaned_note = _remove_duplicate_inline_notes(match.group(3))
        if any(note.lower() == cleaned_note.lower() for note in INLINE_GENERIC_NOTES):
            comment = _inline_note_for_line(code.strip(), pattern_slug)
            return _append_aligned_note(code, comment)
        return _append_aligned_note(code, cleaned_note)
    if "#" in line:
        before_comment, existing_note = line.split("#", 1)
        return _append_aligned_note(before_comment, existing_note)
    cleaned_line = _strip_known_inline_note(line)
    trimmed_line = cleaned_line.strip()
    if not trimmed_line:
        return line
    comment = _inline_note_for_line(trimmed_line, pattern_slug)
    return _append_aligned_note(cleaned_line, comment)


def _is_inline_decision_line(line: str) -> bool:
    match = re.match(rf"^\s{{{INLINE_NOTE_COLUMN},}}(\S.*)$", line)
    if not match:
        return False
    return bool(re.search(r"\b(window|answer|state|frontier|path|heap|roots|merged|seen|stack|take|skip)\b", match.group(1), re.IGNORECASE))


def _is_note_only_inline_decision_line(line: str) -> bool:
    match = re.match(rf"^\s{{{INLINE_NOTE_COLUMN},}}(\S.*)$", line)
    if not match:
        return False
    return _is_inline_decision_line(_append_aligned_note("", match.group(1)))


def _should_place_inline_decision_note_after(line: str, inside_loop: bool, pattern_slug: str) -> bool:
    if not inside_loop:
        return False
    code_part = line.split("#", 1)[0].strip()
    if not code_part:
        return False
    if re.match(r"^(def|for|while|if|elif|else|return)\b", code_part):
        return False
    return bool(_inline_note_for_line(code_part, pattern_slug))


def inline_template_target(pattern_slug: str, algorithm_target: str) -> str:
    lines = str(algorithm_target or "").replace("\r\n", "\n").strip().split("\n")
    output: list[str] = []
    inline_decision_inserted = False
    inside_loop = False
    for line in lines:
        if re.match(r"^\s*(for|while)\b", line):
            inside_loop = True
        next_line = _append_inline_note(line, pattern_slug)
        output.append(next_line)
        if _is_inline_decision_line(next_line):
            inline_decision_inserted = True
        if not inline_decision_inserted and _should_place_inline_decision_note_after(line, inside_loop, pattern_slug):
            output.append(_append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
            inline_decision_inserted = True
    if not inline_decision_inserted:
        def_index = next((index for index, line in enumerate(lines) if re.match(r"^\s*def\s+", line)), -1)
        if def_index >= 0:
            output.insert(def_index + 1, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
        else:
            output.insert(0, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
    return "\n".join(output).strip()


def normalize_inline_template_target(pattern_slug: str, raw_target: str) -> str:
    lines = [
        line
        for line in str(raw_target or "").replace("\r\n", "\n").strip().split("\n")
        if not _is_note_only_inline_decision_line(line)
    ]
    output = [_append_inline_note(line, pattern_slug) for line in lines]
    if any(_is_inline_decision_line(line) for line in output):
        return "\n".join(output).strip()

    inside_loop = False
    inline_decision_index = -1
    for index, line in enumerate(lines):
        if re.match(r"^\s*(for|while)\b", line):
            inside_loop = True
            continue
        if _should_place_inline_decision_note_after(line, inside_loop, pattern_slug):
            inline_decision_index = index
            break

    if inline_decision_index >= 0:
        output.insert(inline_decision_index + 1, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
    else:
        def_index = next((index for index, line in enumerate(lines) if re.match(r"^\s*def\s+", line)), -1)
        if def_index >= 0:
            output.insert(def_index + 1, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
        else:
            output.insert(0, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
    return "\n".join(output).strip()


def _strip_inline_annotation_notes(code: str) -> str:
    lines = []
    for line in str(code or "").replace("\r\n", "\n").split("\n"):
        if re.match(rf"^\s{{{INLINE_NOTE_COLUMN},}}\S", line):
            continue
        match = re.match(r"^(.*?\S)(\s{6,})(\S.*)$", line)
        if match:
            lines.append(match.group(1).rstrip())
        else:
            lines.append(line.rstrip())
    return "\n".join(lines).strip()


def apply_core_shape_tuning_to_target(target: str, raw_tuning: Any) -> str:
    tuning = normalize_specimen_tuning(raw_tuning)
    styled = str(target or "").replace("\r\n", "\n").strip()
    if tuning["typeHints"] == "omit":
        styled = strip_python_type_hints(styled)
    styled = apply_variable_name_style(styled, tuning["variableNames"])
    return styled.strip()


def _extract_nested_helper_target(algorithm_target: str) -> str:
    lines = str(algorithm_target or "").replace("\r\n", "\n").strip().split("\n")
    for start, line in enumerate(lines):
        match = re.match(r"^(\s*)def\s+(dfs|backtrack|search|helper)\s*\(", line)
        if not match or not match.group(1):
            continue
        base_indent = len(match.group(1))
        block = [line]
        for next_line in lines[start + 1 :]:
            stripped = next_line.strip()
            indent = len(next_line) - len(next_line.lstrip())
            if stripped and indent <= base_indent:
                break
            block.append(next_line)
        dedented = [
            block_line[base_indent:] if len(block_line) >= base_indent else block_line.lstrip()
            for block_line in block
        ]
        helper = "\n".join(dedented).strip()
        helper = re.sub(r"\blen\((items|nums|arr|values|candidates|choices|s)\)", "n", helper)
        return helper
    return ""


def core_shape_template_target(pattern_slug: str, algorithm_target: str) -> str:
    if pattern_slug == "backtracking":
        nested_helper = _extract_nested_helper_target(algorithm_target)
        if nested_helper:
            return _strip_inline_annotation_notes(nested_helper)
    return _strip_inline_annotation_notes(algorithm_target)
