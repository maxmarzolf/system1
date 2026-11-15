"""Static checks on submitted Python. Nothing here runs the code.

Used by the deterministic signals and by the hard overrides that mark a code answer incorrect
whatever Jev says (see ``docs/grading.md``):

- :func:`parses`: the answer is valid Python.
- :func:`returns_value`: some function returns a value (``return <expr>``), or a lambda does.
- :func:`missing_return`: the reference returns a value but the answer never does, the one
  mistake calibration showed Jev can miss.
- :func:`structural_match` and :func:`structural_similarity`: the same program up to identifier
  names, and how close it is otherwise.
- :func:`filled_blanks`: the values typed into a fill-in-the-blank template.
"""

from __future__ import annotations

import ast
import builtins
import difflib
import keyword
import re

PYTHON_BUILTIN_NAMES = frozenset(dir(builtins))
PYTHON_KEYWORDS = frozenset(keyword.kwlist)
BLANK = re.compile(r"_{3,}")


def _parse(code: str) -> ast.Module | None:
    try:
        return ast.parse(code if code.endswith("\n") else f"{code}\n")
    except (SyntaxError, ValueError):
        return None


def is_blank(code: str | None) -> bool:
    """Empty, whitespace, or only comments and ``pass``."""
    if not code or not code.strip():
        return True
    tree = _parse(code)
    if tree is None:
        return False
    meaningful = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.stmt) and not isinstance(node, (ast.Pass, ast.FunctionDef, ast.AsyncFunctionDef))
        and not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant))
    ]
    return not meaningful


def parses(code: str | None) -> bool:
    return bool(code and code.strip()) and _parse(code) is not None


def returns_value(code: str | None) -> bool:
    """Does any function return something (``return <expr>`` other than ``return None``)?"""
    tree = _parse(code or "")
    if tree is None:
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.Return) and node.value is not None:
            if not (isinstance(node.value, ast.Constant) and node.value.value is None):
                return True
        if isinstance(node, ast.Lambda):
            return True
    return False


def missing_return(reference: str | None, submitted: str | None) -> bool:
    """The reference returns a value but the (parseable) submission never does."""
    return returns_value(reference) and parses(submitted) and not returns_value(submitted)


class _IdentifierCanonicalizer(ast.NodeTransformer):
    """Renames functions, parameters and local variables to positional placeholders."""

    def __init__(self):
        self._scopes: list[dict[str, str]] = [{}]
        self._counters = {"func": 0, "var": 0}

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

    def _function(self, node: ast.FunctionDef | ast.AsyncFunctionDef):
        node.name = self._bind(node.name, "func")
        node.decorator_list = [self.visit(item) for item in node.decorator_list]
        if node.returns:
            node.returns = self.visit(node.returns)
        self._scopes.append({})
        node.args = self.visit(node.args)
        node.body = [self.visit(statement) for statement in node.body]
        self._scopes.pop()
        return node

    visit_FunctionDef = _function
    visit_AsyncFunctionDef = _function

    def visit_Lambda(self, node: ast.Lambda):
        self._scopes.append({})
        node.args = self.visit(node.args)
        node.body = self.visit(node.body)
        self._scopes.pop()
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


def canonical_form(code: str | None) -> str | None:
    """The AST with identifiers renamed by position, or ``None`` when the code doesn't parse."""
    tree = _parse((code or "").strip())
    if tree is None:
        return None
    canonical = _IdentifierCanonicalizer().visit(tree)
    ast.fix_missing_locations(canonical)
    return ast.dump(canonical, annotate_fields=True, include_attributes=False)


def structural_match(reference: str | None, submitted: str | None) -> bool:
    """The same program up to identifier names, formatting and comments."""
    expected = canonical_form(reference)
    return expected is not None and expected == canonical_form(submitted)


def structural_similarity(reference: str | None, submitted: str | None) -> float:
    """0–1: how close the canonical forms are (raw text when either doesn't parse)."""
    if not (submitted or "").strip():
        return 0.0
    expected = canonical_form(reference) or (reference or "").strip()
    actual = canonical_form(submitted) or (submitted or "").strip()
    return difflib.SequenceMatcher(a=expected, b=actual).ratio()


def filled_blanks(template: str, submitted: str) -> list[str] | None:
    """The values typed into each ``___`` blank of ``template``, or ``None`` when the
    submission no longer matches the template around the blanks."""
    parts = BLANK.split(template)
    if len(parts) < 2:
        return []
    parts[0], parts[-1] = parts[0].lstrip(), parts[-1].rstrip()
    # Each answer is one line (the generator enforces it), so a blank never spans a newline.
    pattern = "([^\\n]*?)".join(re.escape(part) for part in parts)
    match = re.fullmatch(r"\s*" + pattern + r"\s*", submitted, flags=re.DOTALL)
    return [value.strip() for value in match.groups()] if match else None
