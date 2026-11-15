"""Contexts for code answers: total recall, ghost reps, microdrills, ladder rungs.

- **Total recall**: the reference is rebuilt from the stored problem the card was served from
  (``problem`` row via the card id). The browser's copy is used only when no stored problem
  exists, and the evaluation is flagged ``reference_from_client``.
- **Ghost reps**: graded against the target the learner was shown (``correctAnswer``). A ghost
  target is visible on screen and, in a flow, is a subset of lines, so a server copy adds no
  trust; the stored problem is still recorded when there is one.
- **Microdrills, ladder rungs**: the stored ``generated_exercise`` (``exerciseId``) is the source
  of truth, falling back to the browser's copy (flagged) for items generated before items were
  stored.

Every code context checks the hard overrides (empty, not valid Python, no return when the
reference returns) and offers a deterministic verdict: exact structural match (ghost: typed
exactly; microdrill: every blank right).
"""

from __future__ import annotations

from typing import Any

from app.contracts.submission import SubmissionRecord
from app.core import code_checks
from app.models import AttemptCreate
from app.repositories import exercise_repository, unified_catalog_repository
from app.services import signal_registry_service
from app.services.evaluation.context import SubmissionContext, SubmissionContextError

MISSING_PLACEHOLDER = "{{missing}}"
REFERENCE_FROM_CLIENT = "reference_from_client"


def recall_reference(problem: dict[str, Any]) -> str:
    """The solution a recall card asks for, as the server stores it: the generated algorithm
    target when there is one, otherwise the code with its ``{{missing}}`` step filled in."""
    context = problem.get("generation_context") or {}
    targets = context.get("templateTargets") if isinstance(context, dict) else None
    missing = str(problem.get("missing") or "")
    algorithm = str((targets or {}).get("algorithm") or "").strip() if isinstance(targets, dict) else ""
    code = algorithm or str(problem.get("code") or "")
    return code.replace(MISSING_PLACEHOLDER, missing).strip()


def _algorithm(stored: str | None, body: AttemptCreate) -> str:
    return stored or signal_registry_service.algorithm_for_tags(body.categoryTags)


class TotalRecallContextBuilder:
    modality = "total-recall"

    async def build(self, body: AttemptCreate) -> SubmissionContext:
        submitted = body.userAnswer or ""
        problem = await unified_catalog_repository.fetch_problem_for_cards([body.generatedCardId, body.cardId])
        reference = recall_reference(problem) if problem else ""
        flags: tuple[str, ...] = ()
        if not reference:
            reference, flags = (body.correctAnswer or "").strip(), (REFERENCE_FROM_CLIENT,)
        if not reference:
            raise SubmissionContextError("recall_no_reference", "No stored problem or reference answer for this card.")
        overrides = code_checks.hard_failures(reference, submitted)
        return SubmissionContext(
            modality=self.modality,
            algorithm_slug=_algorithm(problem.get("algorithm_slug") if problem else None, body),
            state={
                "prompt": body.question or (problem or {}).get("description") or "",
                "referenceSolution": reference,
                "submittedAnswer": submitted,
            },
            elapsed_ms=body.elapsedMs,
            record=SubmissionRecord(
                user_answer=submitted, correct_answer=reference, problem_slug=problem["slug"] if problem else None,
            ),
            deterministic_correct=not overrides and code_checks.structural_match(reference, submitted),
            overrides=overrides,
            flags=flags,
        )


class GhostRepContextBuilder:
    modality = "ghost-rep"

    async def build(self, body: AttemptCreate) -> SubmissionContext:
        submitted = body.userAnswer or ""
        # Not stripped: a targeted rep is an indented line subset, and indentation is part of it.
        target = (body.correctAnswer or "").rstrip()
        if not target.strip():
            raise SubmissionContextError("ghost_no_target", "A ghost rep needs the target it was typed against.")
        problem = await unified_catalog_repository.fetch_problem_for_cards([body.generatedCardId, body.cardId])
        return SubmissionContext(
            modality=self.modality,
            algorithm_slug=_algorithm(problem.get("algorithm_slug") if problem else None, body),
            state={"prompt": body.question or "", "referenceSolution": target, "submittedAnswer": submitted},
            elapsed_ms=body.elapsedMs,
            record=SubmissionRecord(
                user_answer=submitted, correct_answer=target, problem_slug=problem["slug"] if problem else None,
            ),
            deterministic_correct=code_checks.typed_exactly(target, submitted),
        )


async def _exercise(body: AttemptCreate, modality: str) -> exercise_repository.StoredExercise | None:
    item_id = (body.exerciseId or "").strip()
    if not item_id:
        return None
    item = await exercise_repository.fetch_exercise(item_id)
    if item is None or item["modality"] != modality:
        raise SubmissionContextError(f"{modality}_unknown_item", f"Unknown {modality} item {item_id!r}.")
    return item


class MicrodrillContextBuilder:
    modality = "microdrill"

    async def build(self, body: AttemptCreate) -> SubmissionContext:
        submitted = body.userAnswer or ""
        item = await _exercise(body, self.modality)
        metadata = item["metadata"] if item else {}
        reference = item["reference"] if item else (body.correctAnswer or "").strip()
        if not reference:
            raise SubmissionContextError("microdrill_no_reference", "Microdrill submissions need exerciseId.")
        template = str(metadata.get("template") or "")
        expected = [str(answer) for answer in metadata.get("answers") or []]
        filled = code_checks.filled_blanks(template, submitted) if template else None
        blanks_right = bool(expected) and filled is not None and [value.strip() for value in filled] == [a.strip() for a in expected]
        overrides = code_checks.hard_failures(reference, submitted)
        return SubmissionContext(
            modality=self.modality,
            algorithm_slug=_algorithm(item["algorithmSlug"] if item else None, body),
            state={
                "prompt": item["prompt"] if item else (body.question or ""),
                "template": template,
                "expectedBlanks": expected,
                "referenceSolution": reference,
                "submittedAnswer": submitted,
            },
            elapsed_ms=body.elapsedMs,
            record=SubmissionRecord(user_answer=submitted, correct_answer=reference, exercise_id=item["id"] if item else None),
            deterministic_correct=not overrides and (blanks_right or code_checks.structural_match(reference, submitted)),
            overrides=overrides,
            flags=() if item else (REFERENCE_FROM_CLIENT,),
        )


class LadderContextBuilder:
    modality = "ladder"

    async def build(self, body: AttemptCreate) -> SubmissionContext:
        submitted = body.userAnswer or ""
        item = await _exercise(body, self.modality)
        reference = item["reference"] if item else (body.correctAnswer or "").strip()
        if not reference:
            raise SubmissionContextError("ladder_no_reference", "Ladder submissions need exerciseId.")
        overrides = code_checks.hard_failures(reference, submitted)
        return SubmissionContext(
            modality=self.modality,
            algorithm_slug=_algorithm(item["algorithmSlug"] if item else "sliding-window", body),
            state={
                "prompt": item["prompt"] if item else (body.question or ""),
                "starterCode": str((item or {}).get("metadata", {}).get("starterCode") or ""),
                "referenceSolution": reference,
                "submittedAnswer": submitted,
            },
            elapsed_ms=body.elapsedMs,
            record=SubmissionRecord(user_answer=submitted, correct_answer=reference, exercise_id=item["id"] if item else None),
            deterministic_correct=not overrides and code_checks.structural_match(reference, submitted),
            overrides=overrides,
            flags=() if item else (REFERENCE_FROM_CLIENT,),
        )
