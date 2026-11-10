"""Rewriting generated Python to match specimen tuning (type hints, comments, names)."""

from __future__ import annotations

import ast
import io
import re
import tokenize
from typing import Any



SPECIMEN_TUNING_DEFAULTS: dict[str, str] = {
    "typeHints": "omit",
    "comments": "omit",
    "variableNames": "readable",
}


def normalize_specimen_tuning(raw: Any) -> dict[str, str]:
    tuning = raw if isinstance(raw, dict) else {}
    type_hints = str(tuning.get("typeHints", SPECIMEN_TUNING_DEFAULTS["typeHints"])).strip()
    comments = str(tuning.get("comments", SPECIMEN_TUNING_DEFAULTS["comments"])).strip()
    variable_names = str(tuning.get("variableNames", SPECIMEN_TUNING_DEFAULTS["variableNames"])).strip()
    return {
        "typeHints": type_hints if type_hints in {"omit", "include"} else SPECIMEN_TUNING_DEFAULTS["typeHints"],
        "comments": comments if comments in {"omit", "brief"} else SPECIMEN_TUNING_DEFAULTS["comments"],
        "variableNames": variable_names
        if variable_names in {"readable", "concise", "descriptive"}
        else SPECIMEN_TUNING_DEFAULTS["variableNames"],
    }


def _split_top_level_commas(value: str) -> list[str]:
    parts: list[str] = []
    start = 0
    depth = 0
    quote = ""
    escape = False
    for index, char in enumerate(value):
        if escape:
            escape = False
            continue
        if quote:
            if char == "\\":
                escape = True
            elif char == quote:
                quote = ""
            continue
        if char in {"'", '"'}:
            quote = char
            continue
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth = max(0, depth - 1)
        elif char == "," and depth == 0:
            parts.append(value[start:index])
            start = index + 1
    parts.append(value[start:])
    return parts


def _split_top_level_once(value: str, delimiter: str) -> tuple[str, str]:
    depth = 0
    quote = ""
    escape = False
    for index, char in enumerate(value):
        if escape:
            escape = False
            continue
        if quote:
            if char == "\\":
                escape = True
            elif char == quote:
                quote = ""
            continue
        if char in {"'", '"'}:
            quote = char
            continue
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth = max(0, depth - 1)
        elif char == delimiter and depth == 0:
            return value[:index], value[index + 1 :]
    return value, ""


def _strip_param_annotation(param: str) -> str:
    leading = param[: len(param) - len(param.lstrip())]
    trailing = param[len(param.rstrip()) :]
    core = param.strip()
    if not core or core in {"/", "*"}:
        return param
    before_default, default = _split_top_level_once(core, "=")
    before_annotation, _annotation = _split_top_level_once(before_default, ":")
    stripped = before_annotation.strip()
    if default:
        stripped = f"{stripped}={default.strip()}"
    return f"{leading}{stripped}{trailing}"


def _strip_function_signature_hints(line: str) -> str:
    match = re.match(r"^(\s*def\s+\w+\s*\()(.+)(\)\s*)(?:->\s*[^:]+)?(:\s*)$", line)
    if not match:
        return line
    params = ",".join(_strip_param_annotation(part) for part in _split_top_level_commas(match.group(2)))
    return f"{match.group(1)}{params}{match.group(3).strip()}{match.group(4)}"


def _strip_variable_annotation(line: str) -> str:
    indent_match = re.match(r"^(\s*)([A-Za-z_]\w*)\s*:", line)
    if not indent_match:
        return line
    before_default, default = _split_top_level_once(line[indent_match.end() :], "=")
    if not default or not before_default.strip():
        return line
    return f"{indent_match.group(1)}{indent_match.group(2)} = {default.strip()}"


def strip_python_type_hints(code: str) -> str:
    lines = str(code or "").replace("\r\n", "\n").split("\n")
    output = []
    for line in lines:
        without_signature_hints = _strip_function_signature_hints(line)
        output.append(_strip_variable_annotation(without_signature_hints))
    return "\n".join(output).strip()


def _strip_python_comments(code: str) -> str:
    lines = str(code or "").replace("\r\n", "\n").split("\n")
    try:
        comments = [
            token.start
            for token in tokenize.generate_tokens(io.StringIO("\n".join(lines)).readline)
            if token.type == tokenize.COMMENT
        ]
    except (IndentationError, tokenize.TokenError):
        comments = []
    for row, col in sorted(comments, reverse=True):
        index = row - 1
        if 0 <= index < len(lines):
            lines[index] = lines[index][:col].rstrip()
    return "\n".join(line for line in lines if line.strip()).strip()


def _rename_block_identifier(lines: list[str], start_index: int, old_name: str, new_name: str) -> None:
    if old_name == new_name:
        return
    block_indent = len(lines[start_index]) - len(lines[start_index].lstrip())
    pattern = re.compile(rf"\b{re.escape(old_name)}\b")
    for index in range(start_index, len(lines)):
        if index > start_index:
            stripped = lines[index].strip()
            indent = len(lines[index]) - len(lines[index].lstrip())
            if stripped and indent <= block_indent:
                break
        lines[index] = pattern.sub(new_name, lines[index])


def _rename_identifier_until_dedent(lines: list[str], start_index: int, old_name: str, new_name: str) -> None:
    if old_name == new_name:
        return
    block_indent = len(lines[start_index]) - len(lines[start_index].lstrip())
    pattern = re.compile(rf"\b{re.escape(old_name)}\b")
    for index in range(start_index, len(lines)):
        stripped = lines[index].strip()
        indent = len(lines[index]) - len(lines[index].lstrip())
        if index > start_index and stripped and indent < block_indent:
            break
        lines[index] = pattern.sub(new_name, lines[index])


def apply_variable_name_style(code: str, variable_names: str) -> str:
    if variable_names == "concise":
        return str(code or "").strip()

    lines = str(code or "").replace("\r\n", "\n").split("\n")
    element_name = "value" if variable_names == "descriptive" else "val"
    numeric_name = "num" if variable_names == "descriptive" else "val"
    for index, line in enumerate(lines):
        if re.search(r"\bval\b|\bvalue\b", line):
            continue
        enumerate_match = re.match(r"^(\s*for\s+[A-Za-z_]\w*\s*,\s*)x(\s+in\s+enumerate\(.+\):\s*)$", line)
        if enumerate_match:
            lines[index] = f"{enumerate_match.group(1)}{element_name}{enumerate_match.group(2)}"
            _rename_block_identifier(lines, index, "x", element_name)
            continue
        loop_match = re.match(r"^(\s*for\s+)x(\s+in\s+.+:\s*)$", line)
        if loop_match:
            lines[index] = f"{loop_match.group(1)}{element_name}{loop_match.group(2)}"
            _rename_block_identifier(lines, index, "x", element_name)
            continue
        numeric_loop_match = re.match(r"^(\s*for\s+)n(\s+in\s+nums\s*:\s*)$", line)
        if numeric_loop_match:
            lines[index] = f"{numeric_loop_match.group(1)}{numeric_name}{numeric_loop_match.group(2)}"
            _rename_block_identifier(lines, index, "n", numeric_name)
            continue
        queue_match = re.match(r"^(\s*)q(\s*=\s*deque\(.+\)\s*)$", line)
        if queue_match:
            lines[index] = f"{queue_match.group(1)}queue{queue_match.group(2)}"
            _rename_identifier_until_dedent(lines, index, "q", "queue")
            continue
        output_match = re.match(r"^(\s*)out(\s*=\s*\[\]\s*)$", line)
        if output_match:
            lines[index] = f"{output_match.group(1)}output{output_match.group(2)}"
            _rename_identifier_until_dedent(lines, index, "out", "output")
            continue
        neighbor_loop_match = re.match(r"^(\s*for\s+)ngbr(\s+in\s+.+:\s*)$", line)
        if neighbor_loop_match:
            lines[index] = f"{neighbor_loop_match.group(1)}neighbor{neighbor_loop_match.group(2)}"
            _rename_block_identifier(lines, index, "ngbr", "neighbor")
    return "\n".join(lines).strip()


def _strip_unparsed_tuple_assignment_parens(line: str) -> str:
    if " = (" not in line or not line.endswith(")"):
        return line
    prefix, rhs = line.split(" = ", 1)
    if not re.fullmatch(r"\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+", prefix):
        return line

    inner = rhs[1:-1]
    depth = 0
    has_top_level_comma = False
    for char in inner:
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth -= 1
        elif char == "," and depth == 0:
            has_top_level_comma = True
            break
    if not has_top_level_comma:
        return line
    return f"{prefix} = {inner}"


def _normalize_python_snippet_display(code: str) -> str:
    normalized = "\n".join(line.replace("\t", "    ").rstrip() for line in code.strip().splitlines()).strip()
    if not normalized:
        return ""
    try:
        formatted = ast.unparse(ast.parse(normalized))
    except SyntaxError:
        return normalized
    return "\n".join(_strip_unparsed_tuple_assignment_parens(line) for line in formatted.splitlines()).strip()


def normalize_python_markdown_display(text: str) -> str:
    def replace_fence(match: re.Match[str]) -> str:
        language = str(match.group(1) or "python").strip() or "python"
        raw_code = str(match.group(2) or "")
        normalized_language = language.lower()
        code = (
            _normalize_python_snippet_display(raw_code)
            if normalized_language in {"python", "py"}
            else raw_code.strip()
        )
        return f"```{language}\n{code}\n```"

    return re.sub(r"```([A-Za-z0-9_-]+)?\s*\n?([\s\S]*?)```", replace_fence, text.strip())


def apply_specimen_tuning_to_target(target: str, raw_tuning: Any) -> str:
    tuning = normalize_specimen_tuning(raw_tuning)
    styled = str(target or "").replace("\r\n", "\n").strip()
    if tuning["typeHints"] == "omit":
        styled = strip_python_type_hints(styled)
    if tuning["comments"] == "omit":
        styled = _strip_python_comments(styled)
    styled = apply_variable_name_style(styled, tuning["variableNames"])
    if tuning["comments"] == "omit":
        styled = _normalize_python_snippet_display(styled)
    return styled.strip()


def specimen_style_prompt(raw_tuning: Any) -> str:
    tuning = normalize_specimen_tuning(raw_tuning)
    type_hint_rule = (
        "Use simple Python type hints on function parameters and returns."
        if tuning["typeHints"] == "include"
        else "Do not include Python type hints or return annotations."
    )
    comment_rule = (
        "Use at most two short '#' comments only when they clarify an invariant."
        if tuning["comments"] == "brief"
        else "Do not include '#' comments inside the specimen code."
    )
    variable_rule = {
        "concise": "Use concise conventional pattern names such as l, r, cnt, and best when they aid recall.",
        "descriptive": "Use explicit names such as left, right, value, counts, and best_length; avoid one-letter data variables.",
        "readable": "Use readable interview names: prefer val over x for element values, keep left/right or l/r when conventional, and avoid unclear one-letter data variables.",
    }[tuning["variableNames"]]
    return f"Specimen code style: {type_hint_rule} {comment_rule} {variable_rule}"
