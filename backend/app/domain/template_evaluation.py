from __future__ import annotations

import ast
import builtins
import difflib
import keyword
import re
from typing import Any

from app.domain.coach_context import primary_pattern_tag as _primary_pattern_tag
from app.models import TemplateMode

PYTHON_BUILTIN_NAMES = set(dir(builtins))
PYTHON_KEYWORDS = set(keyword.kwlist)
SUBMISSION_TUNING_DEFAULTS: dict[str, Any] = {
    "gradingMode": "core-logic",
    "contractStrictness": "light",
    "rewardEquivalentPhrasing": True,
    "requireAnswerStep": True,
    "allowExtraParameters": True,
}


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
        return {"score": 0.0, "sound": False, "syntaxValid": False}

    if expected_ast and user_ast and expected_ast == user_ast:
        return {"score": 100.0, "sound": True, "syntaxValid": True}

    similarity = difflib.SequenceMatcher(a=expected_ast or normalized_expected, b=user_ast or normalized_user).ratio()
    return {
        "score": round(similarity * 100, 1),
        "sound": False,
        "syntaxValid": syntax_valid,
    }


def evaluate_attempt_by_template_mode(
    expected_answer: str,
    user_answer: str,
    skill_tags: list[str],
    template_mode: str,
    submission_tuning: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if template_mode == TemplateMode.algorithm.value:
        return _evaluate_attempt_soundness(expected_answer, user_answer)
    return _analyze_template_attempt(user_answer, skill_tags, template_mode, submission_tuning, expected_answer)


def merged_submission_tuning(raw_tuning: dict[str, Any] | None) -> dict[str, Any]:
    raw = raw_tuning if isinstance(raw_tuning, dict) else {}
    tuning = {**SUBMISSION_TUNING_DEFAULTS}

    grading_mode = str(raw.get("gradingMode", tuning["gradingMode"])).strip().lower()
    if grading_mode in {"core-logic", "balanced", "strict"}:
        tuning["gradingMode"] = grading_mode

    contract_strictness = str(raw.get("contractStrictness", tuning["contractStrictness"])).strip().lower()
    if contract_strictness in {"light", "balanced", "strict"}:
        tuning["contractStrictness"] = contract_strictness

    tuning["rewardEquivalentPhrasing"] = bool(raw.get("rewardEquivalentPhrasing", tuning["rewardEquivalentPhrasing"]))
    tuning["requireAnswerStep"] = bool(raw.get("requireAnswerStep", tuning["requireAnswerStep"]))
    tuning["allowExtraParameters"] = bool(raw.get("allowExtraParameters", tuning["allowExtraParameters"]))
    return tuning


def _has_syntax_error(code: str) -> bool:
    try:
        ast.parse(code if code.endswith("\n") else f"{code}\n")
        return False
    except SyntaxError:
        return True


def _normalized_template_text(text: str) -> str:
    lowered = text.replace("\r\n", "\n").lower()
    lowered = re.sub(r"[^a-z0-9_+\-=\n\s]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _has_any_pattern(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def _template_progress_profile(skill_tags: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    pattern_tag = _primary_pattern_tag(skill_tags)

    generic_steps = [
        {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b", r"\bsolve\b"]},
        {"key": "state", "label": "state setup", "patterns": [r"\binit", r"\bstate\b", r"\bsetup\b", r"\btrack\b"]},
        {"key": "flow", "label": "main control flow", "patterns": [r"\bfor each\b", r"\biterate\b", r"\brepeat\b", r"\bfor\b", r"\bwhile\b"]},
        {"key": "update", "label": "state update", "patterns": [r"\bupdate\b", r"\badvance\b", r"\bmove\b", r"\bappend\b", r"\bpop\b", r"\b=\b"]},
        {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
    ]
    generic_critical = ["state", "flow", "update", "return"]

    profiles: dict[str, tuple[list[dict[str, Any]], list[str]]] = {
        "sliding-window": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b", r"\bsliding[_ ]window\b"]},
                {"key": "state", "label": "window state", "patterns": [r"\bleft\b", r"\bstate\b", r"\bcount\b", r"\bcounts\b", r"\bbest\b"]},
                {"key": "expand", "label": "expand step", "patterns": [r"\bfor right\b", r"\benumerate\b", r"\bincoming\b", r"\bexpand\b", r"\badd\b.+\bwindow\b"]},
                {"key": "repair", "label": "window repair", "patterns": [r"\bwhile\b.+\binvalid\b", r"\bwindow is invalid\b", r"\brestore validity\b", r"\bwhile len\b"]},
                {"key": "shrink", "label": "left-side shrink", "patterns": [r"\bremove\b.+\bleft\b", r"\bmove left\b", r"\bleft\s*\+=\s*1\b", r"\bshrink\b"]},
                {"key": "score", "label": "valid-window scoring", "patterns": [r"\bbest\s*=\s*max\(", r"\bupdate\b.+\bbest\b", r"\bre-?calculate\b.+\bbest\b", r"\brecord\b.+\banswer\b", r"\bscore\b", r"\bright - left \+ 1\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b.+\bbest\b", r"\breturn\b.+\bresult\b", r"\breturn\b"]},
            ],
            ["state", "expand", "repair", "shrink", "score", "return"],
        ),
        "two-pointers": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "pointers", "label": "pointer setup", "patterns": [r"\bleft\b", r"\bright\b", r"\btwo pointers\b"]},
                {"key": "loop", "label": "pointer scan loop", "patterns": [r"\bwhile left < right\b", r"\bfor each pair\b", r"\bscan from both ends\b"]},
                {"key": "compare", "label": "comparison rule", "patterns": [r"\bcompare\b", r"\btarget\b", r"\btoo small\b", r"\btoo large\b", r"\bif\b.+\btarget\b"]},
                {"key": "move", "label": "pointer movement", "patterns": [r"\bleft\s*\+=\s*1\b", r"\bright\s*-=\s*1\b", r"\bmove left\b", r"\bmove right\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bfound\b", r"\banswer\b"]},
            ],
            ["pointers", "loop", "compare", "move", "return"],
        ),
        "binary-search": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "bounds", "label": "interval setup", "patterns": [r"\bleft\b", r"\bright\b", r"\bsearch interval\b", r"\blow\b", r"\bhigh\b"]},
                {"key": "loop", "label": "search loop", "patterns": [r"\bwhile left <= right\b", r"\bwhile low <= high\b", r"\bwhile\b.+\binterval\b"]},
                {"key": "mid", "label": "midpoint step", "patterns": [r"\bmid\b", r"\bmiddle\b"]},
                {"key": "compare", "label": "midpoint comparison", "patterns": [r"\btarget\b", r"\bcompare\b", r"\btoo small\b", r"\btoo large\b", r"\bnums\[mid\]"]},
                {"key": "update", "label": "bound update", "patterns": [r"\bleft\s*=\s*mid", r"\bright\s*=\s*mid", r"\bdiscard\b.+\bhalf\b", r"\bmove left bound\b", r"\bmove right bound\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bnot found\b"]},
            ],
            ["bounds", "loop", "mid", "compare", "update", "return"],
        ),
        "dynamic-programming": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "state", "label": "state definition", "patterns": [r"\bdp\b", r"\bstate array\b", r"\bstate means\b", r"\bsubproblem\b"]},
                {"key": "base", "label": "base case", "patterns": [r"\bbase case\b", r"\bdp\[0\]", r"\banchor\b", r"\binitialize first\b"]},
                {"key": "loop", "label": "fill order", "patterns": [r"\bfor\b", r"\biterate\b", r"\bfill the table\b", r"\bmove through the states\b"]},
                {"key": "transition", "label": "transition update", "patterns": [r"\btransition\b", r"\bdp\[", r"\bfrom earlier state\b", r"\brecurrence\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bfinal state\b", r"\blast dp\b", r"\banswer\b"]},
            ],
            ["state", "base", "loop", "transition", "return"],
        ),
        "dp": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "state", "label": "state definition", "patterns": [r"\bdp\b", r"\bstate array\b", r"\bstate means\b", r"\bsubproblem\b"]},
                {"key": "base", "label": "base case", "patterns": [r"\bbase case\b", r"\bdp\[0\]", r"\banchor\b", r"\binitialize first\b"]},
                {"key": "loop", "label": "fill order", "patterns": [r"\bfor\b", r"\biterate\b", r"\bfill the table\b", r"\bmove through the states\b"]},
                {"key": "transition", "label": "transition update", "patterns": [r"\btransition\b", r"\bdp\[", r"\bfrom earlier state\b", r"\brecurrence\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bfinal state\b", r"\blast dp\b", r"\banswer\b"]},
            ],
            ["state", "base", "loop", "transition", "return"],
        ),
        "graph-traversal": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "frontier", "label": "frontier or visited setup", "patterns": [r"\bvisited\b", r"\bqueue\b", r"\bstack\b", r"\bfrontier\b"]},
                {"key": "loop", "label": "traversal loop", "patterns": [r"\bwhile queue\b", r"\bwhile stack\b", r"\bdfs\b", r"\bbfs\b", r"\bpop\b", r"\bpopleft\b"]},
                {"key": "guard", "label": "skip or visited rule", "patterns": [r"\bif\b.+\bvisited\b", r"\bskip\b", r"\balready seen\b"]},
                {"key": "neighbors", "label": "neighbor update", "patterns": [r"\bneighbor\b", r"\bnei\b", r"\benqueue\b", r"\bappend\b", r"\bexplore\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
            ],
            ["frontier", "loop", "guard", "neighbors", "return"],
        ),
        "dfs-bfs": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "frontier", "label": "frontier or visited setup", "patterns": [r"\bvisited\b", r"\bqueue\b", r"\bstack\b", r"\bfrontier\b"]},
                {"key": "loop", "label": "traversal loop", "patterns": [r"\bwhile queue\b", r"\bwhile stack\b", r"\bdfs\b", r"\bbfs\b", r"\bpop\b", r"\bpopleft\b"]},
                {"key": "guard", "label": "skip or visited rule", "patterns": [r"\bif\b.+\bvisited\b", r"\bskip\b", r"\balready seen\b"]},
                {"key": "neighbors", "label": "neighbor update", "patterns": [r"\bneighbor\b", r"\bnei\b", r"\benqueue\b", r"\bappend\b", r"\bexplore\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
            ],
            ["frontier", "loop", "guard", "neighbors", "return"],
        ),
        "backtracking": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "choice", "label": "choice iteration", "patterns": [r"\bfor choice\b", r"\bfor each choice\b", r"\biterate choices\b"]},
                {"key": "choose", "label": "choose step", "patterns": [r"\bappend\b", r"\badd choice\b", r"\bmake the choice\b"]},
                {"key": "recurse", "label": "recursive exploration", "patterns": [r"\bbacktrack\b", r"\bdfs\b", r"\brecurse\b"]},
                {"key": "undo", "label": "undo step", "patterns": [r"\bpop\b", r"\bremove last\b", r"\bundo\b"]},
                {"key": "return", "label": "base case or return path", "patterns": [r"\breturn\b", r"\bbase case\b", r"\banswer\b"]},
            ],
            ["choice", "choose", "recurse", "undo"],
        ),
        "heap": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "heap", "label": "heap setup", "patterns": [r"\bheap\b", r"\bheappush\b", r"\bpriority queue\b"]},
                {"key": "loop", "label": "item traversal", "patterns": [r"\bfor\b", r"\biterate\b", r"\bprocess each\b"]},
                {"key": "push", "label": "push step", "patterns": [r"\bheappush\b", r"\bpush\b.+\bheap\b", r"\badd to the heap\b"]},
                {"key": "prune", "label": "heap prune or pop", "patterns": [r"\bheappop\b", r"\bpop\b.+\bheap\b", r"\bif len\(heap\)\b", r"\bevict\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\btop of heap\b", r"\banswer\b"]},
            ],
            ["heap", "loop", "push", "prune", "return"],
        ),
        "union-find": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "parent", "label": "parent setup", "patterns": [r"\bparent\b", r"\brank\b", r"\bsize\b", r"\broot\b"]},
                {"key": "find", "label": "find step", "patterns": [r"\bfind\b", r"\bpath compression\b"]},
                {"key": "union", "label": "union step", "patterns": [r"\bunion\b", r"\bconnect roots\b", r"\bmerge sets\b"]},
                {"key": "loop", "label": "edge or item traversal", "patterns": [r"\bfor edge\b", r"\bfor each edge\b", r"\biterate edges\b", r"\bfor\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bcomponent\b"]},
            ],
            ["parent", "find", "union", "loop", "return"],
        ),
        "intervals": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "sort", "label": "sorted interval order", "patterns": [r"\bsort\b", r"\bsorted\b", r"\border by start\b"]},
                {"key": "current", "label": "current interval state", "patterns": [r"\bcurrent\b", r"\bstart\b", r"\bend\b"]},
                {"key": "compare", "label": "overlap test", "patterns": [r"\boverlap\b", r"\bintersect\b", r"\bif\b.+\bstart\b"]},
                {"key": "merge", "label": "merge or append step", "patterns": [r"\bmerge\b", r"\bappend\b", r"\bstart a new interval\b", r"\bextend\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bresult\b", r"\bmerged\b"]},
            ],
            ["sort", "current", "compare", "merge", "return"],
        ),
        "prefix-sums": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "prefix", "label": "prefix state setup", "patterns": [r"\bprefix\b", r"\brunning sum\b", r"\bcount map\b", r"\bhash map\b"]},
                {"key": "loop", "label": "item traversal", "patterns": [r"\bfor\b", r"\biterate\b", r"\bprocess each\b"]},
                {"key": "query", "label": "query before update", "patterns": [r"\bcheck\b.+\bprefix\b", r"\bquery\b", r"\bprefix - target\b", r"\bbefore updating\b"]},
                {"key": "update", "label": "prefix update", "patterns": [r"\bprefix\s*\+?=", r"\bupdate map\b", r"\brecord current prefix\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
            ],
            ["prefix", "loop", "query", "update", "return"],
        ),
        "monotonic-stack": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "stack", "label": "stack setup", "patterns": [r"\bstack\b", r"\bmonotonic\b"]},
                {"key": "loop", "label": "item traversal", "patterns": [r"\bfor\b", r"\biterate\b", r"\bscan\b"]},
                {"key": "resolve", "label": "resolve while decision rule breaks", "patterns": [r"\bwhile\b.+\bstack\b", r"\bpop\b", r"\bdecision rule breaks\b"]},
                {"key": "push", "label": "push current item", "patterns": [r"\bappend\b", r"\bpush\b", r"\bstack\.append\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\banswer\b", r"\bresult\b"]},
            ],
            ["stack", "loop", "resolve", "push", "return"],
        ),
        "stack": (
            [
                {"key": "entry", "label": "entry point", "patterns": [r"\bdef\b", r"\bfunction\b", r"\bdefine\b"]},
                {"key": "stack", "label": "stack setup", "patterns": [r"\bstack\b"]},
                {"key": "loop", "label": "item traversal", "patterns": [r"\bfor\b", r"\bwhile\b", r"\bprocess\b"]},
                {"key": "update", "label": "push or pop step", "patterns": [r"\bappend\b", r"\bpush\b", r"\bpop\b"]},
                {"key": "return", "label": "return path", "patterns": [r"\breturn\b", r"\bresult\b", r"\banswer\b"]},
            ],
            ["stack", "loop", "update", "return"],
        ),
    }
    return profiles.get(pattern_tag, (generic_steps, generic_critical))


def _template_dimension_groups(skill_tags: list[str]) -> list[dict[str, Any]]:
    pattern_tag = _primary_pattern_tag(skill_tags)
    groups: dict[str, list[dict[str, Any]]] = {
        "sliding-window": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["state"], "weight": 0.18},
            {"key": "control_flow", "label": "Control flow", "steps": ["expand", "repair", "shrink"], "weight": 0.30},
            {"key": "invariant_logic", "label": "Decision logic", "steps": ["repair", "shrink"], "weight": 0.24},
            {"key": "answer_update", "label": "Answer update", "steps": ["score"], "weight": 0.16},
        ],
        "two-pointers": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["pointers"], "weight": 0.2},
            {"key": "control_flow", "label": "Control flow", "steps": ["loop", "move"], "weight": 0.26},
            {"key": "invariant_logic", "label": "Decision logic", "steps": ["compare", "move"], "weight": 0.26},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
        "binary-search": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["bounds", "mid"], "weight": 0.2},
            {"key": "control_flow", "label": "Control flow", "steps": ["loop", "update"], "weight": 0.24},
            {"key": "invariant_logic", "label": "Decision logic", "steps": ["compare", "update"], "weight": 0.28},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
        "dynamic-programming": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["state", "base"], "weight": 0.26},
            {"key": "control_flow", "label": "Control flow", "steps": ["loop"], "weight": 0.18},
            {"key": "invariant_logic", "label": "Decision logic", "steps": ["transition"], "weight": 0.28},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
        "dp": [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.12},
            {"key": "state_management", "label": "State management", "steps": ["state", "base"], "weight": 0.26},
            {"key": "control_flow", "label": "Control flow", "steps": ["loop"], "weight": 0.18},
            {"key": "invariant_logic", "label": "Decision logic", "steps": ["transition"], "weight": 0.28},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
    }
    return groups.get(
        pattern_tag,
        [
            {"key": "input_output", "label": "Inputs and outputs", "steps": ["entry", "return"], "weight": 0.16},
            {"key": "state_management", "label": "State management", "steps": ["state"], "weight": 0.22},
            {"key": "control_flow", "label": "Control flow", "steps": ["flow"], "weight": 0.24},
            {"key": "invariant_logic", "label": "Decision logic", "steps": ["update"], "weight": 0.22},
            {"key": "answer_update", "label": "Answer update", "steps": ["return"], "weight": 0.16},
        ],
    )


def _extract_template_signature_params(text: str) -> list[str]:
    match = re.search(r"\b(?:def|define|function)\s+[a-z_][a-z0-9_]*\s*\(([^)]*)\)", text, re.IGNORECASE)
    if not match:
        return []
    raw_params = match.group(1).strip()
    if not raw_params:
        return []
    params: list[str] = []
    for chunk in raw_params.split(","):
        normalized = re.sub(r"[^a-z0-9_]", "", chunk.lower())
        if normalized:
            params.append(normalized)
    return params


def _template_contract_drift(expected_answer: str, user_answer: str, tuning: dict[str, Any]) -> dict[str, Any]:
    expected_params = _extract_template_signature_params(expected_answer)
    actual_params = _extract_template_signature_params(user_answer)
    if not expected_params or not actual_params:
        return {
            "expectedParams": expected_params,
            "actualParams": actual_params,
            "missingParams": [],
            "extraParams": [],
            "penalty": 0.0,
        }

    missing_params = [param for param in expected_params if param not in actual_params]
    extra_params = [param for param in actual_params if param not in expected_params]
    penalty = 0.0
    strictness = str(tuning.get("contractStrictness", "light"))

    if missing_params:
        penalty += {"light": 6.0, "balanced": 10.0, "strict": 15.0}.get(strictness, 6.0)
    if extra_params and not tuning.get("allowExtraParameters", True):
        penalty += {"light": 4.0, "balanced": 8.0, "strict": 12.0}.get(strictness, 4.0)
    elif extra_params:
        penalty += {"light": 1.5, "balanced": 4.0, "strict": 7.0}.get(strictness, 1.5)

    return {
        "expectedParams": expected_params,
        "actualParams": actual_params,
        "missingParams": missing_params,
        "extraParams": extra_params,
        "penalty": penalty,
    }


def _template_step_order_score(steps: list[dict[str, Any]], matched_positions: dict[str, int]) -> float:
    ordered_keys = [str(step["key"]) for step in steps if str(step["key"]) in matched_positions]
    if len(ordered_keys) <= 1:
        return 100.0 if ordered_keys else 0.0
    in_order_pairs = 0
    total_pairs = 0
    for left_index, left_key in enumerate(ordered_keys):
        for right_key in ordered_keys[left_index + 1 :]:
            total_pairs += 1
            if matched_positions[left_key] < matched_positions[right_key]:
                in_order_pairs += 1
    if total_pairs == 0:
        return 100.0
    return round((in_order_pairs / total_pairs) * 100, 1)


def _template_grading_threshold(tuning: dict[str, Any], template_mode: str) -> float:
    grading_mode = str(tuning.get("gradingMode", "core-logic"))
    return {"core-logic": 68.0, "balanced": 76.0, "strict": 86.0}.get(grading_mode, 68.0)


def _analyze_template_attempt(
    user_answer: str,
    skill_tags: list[str],
    template_mode: str,
    submission_tuning: dict[str, Any] | None = None,
    expected_answer: str = "",
) -> dict[str, Any]:
    normalized_text = _normalized_template_text(user_answer)
    steps, critical_keys = _template_progress_profile(skill_tags)
    tuning = merged_submission_tuning(submission_tuning)

    matched_labels: list[str] = []
    missing_labels: list[str] = []
    missing_keys: list[str] = []
    matched_keys: list[str] = []
    matched_positions: dict[str, int] = {}
    for step in steps:
        key = str(step["key"])
        label = str(step["label"])
        patterns = [str(pattern) for pattern in step["patterns"]]
        if _has_any_pattern(normalized_text, patterns):
            matched_keys.append(key)
            matched_labels.append(label)
            positions = [match.start() for pattern in patterns for match in re.finditer(pattern, normalized_text, re.IGNORECASE)]
            if positions:
                matched_positions[key] = min(positions)
        else:
            missing_keys.append(key)
            missing_labels.append(label)

    total_steps = max(len(steps), 1)
    step_coverage = round((len(matched_keys) / total_steps) * 100, 1)
    critical_coverage = round(
        (sum(1 for key in critical_keys if key in matched_keys) / max(len(critical_keys), 1)) * 100,
        1,
    )
    order_score = _template_step_order_score(steps, matched_positions)

    dimension_scores: list[dict[str, Any]] = []
    weighted_dimension_total = 0.0
    weighted_dimension_count = 0.0
    for group in _template_dimension_groups(skill_tags):
        group_steps = [step for step in group["steps"] if isinstance(step, str)]
        if not group_steps:
            continue
        matched_count = sum(1 for step in group_steps if step in matched_keys)
        score = round((matched_count / len(group_steps)) * 100, 1)
        weight = float(group.get("weight", 0))
        dimension_scores.append({
            "key": str(group["key"]),
            "label": str(group["label"]),
            "score": score,
            "matched": matched_count,
            "total": len(group_steps),
        })
        weighted_dimension_total += score * weight
        weighted_dimension_count += weight

    dimension_average = round(
        weighted_dimension_total / weighted_dimension_count if weighted_dimension_count else step_coverage,
        1,
    )
    contract = _template_contract_drift(expected_answer, user_answer, tuning)
    if tuning.get("rewardEquivalentPhrasing", True):
        raw_score = (dimension_average * 0.8) + (order_score * 0.1) + (step_coverage * 0.1)
    else:
        raw_score = (step_coverage * 0.65) + (critical_coverage * 0.25) + (order_score * 0.1)
    overall_score = max(0.0, round(raw_score - contract["penalty"], 1))

    dimension_by_key = {item["key"]: float(item["score"]) for item in dimension_scores}
    core_logic_score = round(
        (
            (dimension_by_key.get("state_management", step_coverage) * 0.25)
            + (dimension_by_key.get("control_flow", step_coverage) * 0.35)
            + (dimension_by_key.get("invariant_logic", step_coverage) * 0.25)
            + (dimension_by_key.get("answer_update", step_coverage) * 0.15)
        ),
        1,
    )

    answer_step_met = dimension_by_key.get("answer_update", 100.0) >= 50.0
    critical_met = critical_coverage >= 75.0
    threshold = _template_grading_threshold(tuning, template_mode)
    if not tuning.get("rewardEquivalentPhrasing", True):
        threshold += 4.0
    sound = bool(normalized_text) and critical_met and core_logic_score >= threshold
    if tuning.get("requireAnswerStep", True):
        sound = sound and answer_step_met
    syntax_valid = bool(user_answer.strip())
    if re.search(r"^\s*def\b", user_answer, re.MULTILINE):
        syntax_valid = not _has_syntax_error(user_answer)

    return {
        "score": overall_score,
        "sound": sound,
        "syntaxValid": syntax_valid,
        "matchedLabels": matched_labels,
        "missingLabels": missing_labels,
        "matchedKeys": matched_keys,
        "missingKeys": missing_keys,
        "stepCoverage": step_coverage,
        "criticalCoverage": critical_coverage,
        "coreLogicScore": core_logic_score,
        "orderScore": order_score,
        "dimensions": dimension_scores,
        "contract": contract,
        "tuning": tuning,
    }
