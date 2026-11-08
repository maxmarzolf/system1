"""How practice-card ids map to catalog problem slugs."""

from __future__ import annotations

# Practice cards for core/meta catalog problems use this id prefix before the problem slug.
CORE_ALGORITHM_CARD_ID_PREFIX = "core-algorithm-"


def problem_slug_candidates(card_ids: list[str | None]) -> list[str]:
    """Card ids as problem slugs, in priority order; core catalog cards carry a prefix before the slug."""
    candidates: list[str] = []
    for card_id in card_ids:
        if not card_id:
            continue
        for candidate in (str(card_id), str(card_id).removeprefix(CORE_ALGORITHM_CARD_ID_PREFIX)):
            if candidate and candidate not in candidates:
                candidates.append(candidate)
    return candidates
