"""Validation for signal definitions and correctness directives edited on /admin.

Rules mirror what Jev accepts (Choice: 1-255 labels; Score: an ordered list
of at least two levels; Noul: instructions or a described outcome) plus this
app's own constraints. Errors are keyed by field so the UI can show them inline.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from app.core.signals import CORRECTNESS_LABELS, CORRECTNESS_QUESTION_ID

KEY_PATTERN = re.compile(r"^[a-z][a-zA-Z0-9]{1,63}$")
GENERAL_SCOPE = "general"
SOURCES = ("jev", "deterministic")
PRIMITIVES = ("choice", "score", "noul")
ROLES = ("dimension", "modifier", "diagnostic")
AXES = ("fidelity", "executable", "fluency")
APPLIES_WHEN = ("always", "correct", "incorrect")
MAX_CHOICE_LABELS = 255
MAX_LABEL_LENGTH = 120
MAX_INSTRUCTIONS_LENGTH = 4000
MAX_DESCRIPTION_LENGTH = 2000

SignalErrors = dict[str, str]


def _text(value: Any) -> str:
    return str(value or "").strip()


def _optional_text(value: Any) -> str | None:
    text = _text(value)
    return text or None


def normalize_definition(draft: Mapping[str, Any]) -> dict[str, Any]:
    """Trim text and coerce empty values; the result is what gets validated and stored."""
    source = _text(draft.get("source")) or "jev"
    primitive = _optional_text(draft.get("primitive")) if source == "jev" else None
    raw_criteria = draft.get("criteria")
    criteria: Any = None
    if primitive == "choice" and isinstance(raw_criteria, Mapping):
        criteria = {_text(label): _optional_text(text) for label, text in raw_criteria.items()}
    elif primitive == "score" and isinstance(raw_criteria, list):
        criteria = [_text(level) for level in raw_criteria]
    elif primitive == "noul" and isinstance(raw_criteria, Mapping):
        criteria = {key: _optional_text(raw_criteria.get(key)) for key in ("true", "false")}
        criteria = criteria if any(criteria.values()) else None
    elif raw_criteria is not None and primitive is not None:
        criteria = raw_criteria  # Wrong shape for the primitive; validation reports it.
    role = _text(draft.get("role")) or "dimension"
    raw_score_map = draft.get("score_map") or {}
    try:
        weight = float(draft.get("weight") or 0.0)
    except (TypeError, ValueError):
        weight = -1.0
    return {
        "key": _text(draft.get("key")),
        "label": _text(draft.get("label")),
        "description": _text(draft.get("description")),
        "scope": _text(draft.get("scope")) or GENERAL_SCOPE,
        "source": source,
        "primitive": primitive,
        "implementation": _optional_text(draft.get("implementation")) if source == "deterministic" else None,
        "instructions": _text(draft.get("instructions")) if source == "jev" else "",
        "criteria": criteria,
        "score_map": dict(raw_score_map) if isinstance(raw_score_map, Mapping) and primitive == "choice" else raw_score_map,
        "role": role,
        "axis": _optional_text(draft.get("axis")),
        "applies_when": _text(draft.get("applies_when")) or "always",
        "needs_correctness": bool(draft.get("needs_correctness")) and source == "jev",
        "weight": 0.0 if role == "diagnostic" else weight,
        "display_order": int(draft.get("display_order") or 0),
    }


def _validate_criteria(definition: Mapping[str, Any], errors: SignalErrors) -> None:
    primitive = definition["primitive"]
    criteria = definition["criteria"]
    score_map = definition["score_map"]
    if primitive == "choice":
        if not isinstance(criteria, Mapping) or not criteria:
            errors["criteria"] = "A Choice needs at least one label."
            return
        if len(criteria) > MAX_CHOICE_LABELS:
            errors["criteria"] = f"A Choice allows at most {MAX_CHOICE_LABELS} labels."
        if any(not label or len(label) > 64 for label in criteria):
            errors["criteria"] = "Choice labels must be 1-64 characters."
        if not isinstance(score_map, Mapping):
            errors["score_map"] = "Score map must map labels to scores."
            return
        unknown = sorted(set(score_map) - set(criteria))
        if unknown:
            errors["score_map"] = f"Score map has labels that are not choices: {', '.join(unknown)}."
        for value in score_map.values():
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 100:
                errors["score_map"] = "Scores must be numbers from 0 to 100."
                break
    elif primitive == "score":
        if not isinstance(criteria, list) or len(criteria) < 2:
            errors["criteria"] = "A Score needs at least two ordered levels."
        elif any(not level for level in criteria):
            errors["criteria"] = "Score levels cannot be empty."
        if score_map:
            errors["score_map"] = "Only Choice signals use a score map."
    elif primitive == "noul":
        if criteria is not None and (not isinstance(criteria, Mapping) or set(criteria) - {"true", "false"}):
            errors["criteria"] = "Noul criteria may only describe the true and false outcomes."
        if not definition["instructions"] and not criteria:
            errors["instructions"] = "A Noul needs instructions or a description of an outcome."
        if score_map:
            errors["score_map"] = "Only Choice signals use a score map."


def validate_definition(
    definition: Mapping[str, Any],
    *,
    algorithm_slugs: set[str],
    implementations: set[str],
) -> SignalErrors:
    """Validate a normalized definition."""
    errors: SignalErrors = {}
    key = definition["key"]
    if not KEY_PATTERN.match(key):
        errors["key"] = "Keys are camelCase: a lowercase letter, then letters or digits (2-64 characters)."
    elif key == CORRECTNESS_QUESTION_ID:
        errors["key"] = f"{CORRECTNESS_QUESTION_ID!r} is reserved for the correctness question."
    if not definition["label"] or len(definition["label"]) > MAX_LABEL_LENGTH:
        errors["label"] = f"Label must be 1-{MAX_LABEL_LENGTH} characters."
    if len(definition["description"]) > MAX_DESCRIPTION_LENGTH:
        errors["description"] = f"Description is limited to {MAX_DESCRIPTION_LENGTH} characters."
    if definition["scope"] != GENERAL_SCOPE and definition["scope"] not in algorithm_slugs:
        errors["scope"] = "Scope must be general or an existing algorithm."
    if definition["source"] not in SOURCES:
        errors["source"] = "Source must be jev or deterministic."
    if definition["role"] not in ROLES:
        errors["role"] = "Role must be dimension, modifier or diagnostic."
    if definition["axis"] is not None and definition["axis"] not in AXES:
        errors["axis"] = "Axis must be fidelity, executable or fluency."
    if definition["applies_when"] not in APPLIES_WHEN:
        errors["applies_when"] = "Applies when must be always, correct or incorrect."
    if not 0.0 <= definition["weight"] <= 1.0:
        errors["weight"] = "Weight must be between 0 and 1."

    if definition["source"] == "deterministic":
        if definition["implementation"] not in implementations:
            errors["implementation"] = "Choose a deterministic implementation registered in code."
    elif definition["source"] == "jev":
        if definition["primitive"] not in PRIMITIVES:
            errors["primitive"] = "Primitive must be choice, score or noul."
        elif definition["primitive"] in ("choice", "score") and not definition["instructions"]:
            errors["instructions"] = "Instructions are required."
        if len(definition["instructions"]) > MAX_INSTRUCTIONS_LENGTH:
            errors["instructions"] = f"Instructions are limited to {MAX_INSTRUCTIONS_LENGTH} characters."
        if definition["primitive"] in PRIMITIVES:
            _validate_criteria(definition, errors)
    return errors


def normalize_directive(draft: Mapping[str, Any]) -> dict[str, Any]:
    raw_criteria = draft.get("criteria") if isinstance(draft.get("criteria"), Mapping) else {}
    try:
        weight = float(draft.get("correctness_weight"))
    except (TypeError, ValueError):
        weight = -1.0
    return {
        "instructions": _text(draft.get("instructions")),
        "criteria": {label: _text(raw_criteria.get(label)) for label in CORRECTNESS_LABELS},
        "correctness_weight": weight,
        "extra_labels": sorted(set(raw_criteria) - set(CORRECTNESS_LABELS)),
    }


def validate_directive(directive: Mapping[str, Any]) -> SignalErrors:
    errors: SignalErrors = {}
    if not directive["instructions"]:
        errors["instructions"] = "Instructions are required."
    elif len(directive["instructions"]) > MAX_INSTRUCTIONS_LENGTH:
        errors["instructions"] = f"Instructions are limited to {MAX_INSTRUCTIONS_LENGTH} characters."
    if directive["extra_labels"]:
        errors["criteria"] = 'The correctness labels are fixed to "1" and "0".'
    elif not all(directive["criteria"].values()):
        errors["criteria"] = 'Describe both "1" (answered correctly) and "0".'
    if not 0.0 <= directive["correctness_weight"] <= 1.0:
        errors["correctness_weight"] = "Weight must be between 0 and 1."
    return errors
