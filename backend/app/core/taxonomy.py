"""One vocabulary for algorithm and pattern slugs.

Cards and submissions carry free-form tags (``"heap-priority-queue"``, ``"dp"``);
the catalog's ``algorithm`` table uses canonical slugs (``"heap"``,
``"dynamic-programming"``). Everything that turns a tag or name into a slug, or
matches tags to algorithms, goes through here.
"""

from __future__ import annotations

import re

# Tag slugs that name an algorithm under a different slug.
ALGORITHM_TAG_ALIASES: dict[str, str] = {
    "heap-priority-queue": "heap",
    "dfs-bfs": "graphs",
    "graph-traversal": "graphs",
    "dp": "dynamic-programming",
    "greedy-sorting": "sorting",
    "stack": "stacks-queues",
    "google-skeletons": "skeletons",
}

# The catalog keeps ``dfs-bfs`` as a technique slug, so catalog slugs alias only the heap name.
CATALOG_SLUG_ALIASES: dict[str, str] = {"heap-priority-queue": "heap"}

# Pattern tags in priority order: a card's primary pattern is the first one it carries.
PATTERN_TAG_PRIORITY: tuple[str, ...] = (
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
)


def slugify(value: str) -> str:
    """``"Heap / Priority Queue"`` → ``"heap-priority-queue"``."""
    words = re.sub(
        r"[^a-z0-9\s-]", " ", str(value or "").lower().replace("/", " ").replace("&", " ").replace("-", " ")
    ).strip()
    return re.sub(r"\s+", "-", words)


def catalog_slug(value: str) -> str:
    """Slug for catalog algorithms and techniques."""
    slug = slugify(value)
    return CATALOG_SLUG_ALIASES.get(slug, slug)


def algorithm_slug(tag: str) -> str:
    """The algorithm slug a tag refers to (the tag's own slug when it has no alias)."""
    slug = slugify(tag)
    return ALGORITHM_TAG_ALIASES.get(slug, slug)


def matched_algorithm_slugs(tags: list[str], known_slugs: set[str]) -> list[str]:
    """Known algorithm slugs referenced by ``tags``, first occurrence first."""
    return list(dict.fromkeys(slug for tag in tags if (slug := algorithm_slug(tag)) in known_slugs))


def primary_pattern_tag(tags: list[str]) -> str:
    """The highest-priority pattern tag present, or ``""``."""
    return next((tag for tag in PATTERN_TAG_PRIORITY if tag in tags), "")


def algorithm_slug_for_tags(tags: list[str]) -> str:
    """The algorithm slug for a card's primary pattern tag, or ``""``."""
    tag = primary_pattern_tag(tags)
    return ALGORITHM_TAG_ALIASES.get(tag, tag)
