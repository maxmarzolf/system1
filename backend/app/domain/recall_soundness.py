"""Deterministic recall soundness used when the semantic LLM evaluator is unavailable."""

from __future__ import annotations

import ast
import builtins
import difflib
import keyword
from typing import Any

PYTHON_BUILTIN_NAMES = set(dir(builtins))
PYTHON_KEYWORDS = set(keyword.kwlist)
SUBMISSION_TUNING_DEFAULTS: dict[str, Any] = {
    "gradingMode": "core-logic",
    "contractStrictness": "light",
    "rewardEquivalentPhrasing": True,
    "requireAnswerStep": True,
    "allowExtraParameters": True,
    "microDrillEnabled": False,
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


def evaluate_recall_soundness(expected_answer: str, user_answer: str) -> dict[str, Any]:
    """Deterministic check: identifier-canonicalized AST equality, else text similarity."""
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
    tuning["microDrillEnabled"] = bool(raw.get("microDrillEnabled", tuning["microDrillEnabled"]))
    return tuning


def _has_syntax_error(code: str) -> bool:
    try:
        ast.parse(code if code.endswith("\n") else f"{code}\n")
        return False
    except SyntaxError:
        return True
