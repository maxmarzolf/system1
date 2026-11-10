"""One slug vocabulary for tags, algorithm names and catalog entries."""

from __future__ import annotations

from app.core import taxonomy


def test_slugify_normalizes_names_and_is_stable() -> None:
    assert taxonomy.slugify("Sliding Window") == "sliding-window"
    assert taxonomy.slugify("Binary/Search") == "binary-search"
    assert taxonomy.slugify("A & B") == "a-b"
    assert taxonomy.slugify("Heap / Priority Queue") == "heap-priority-queue"
    assert taxonomy.slugify(None) == ""  # type: ignore[arg-type]
    slug = taxonomy.slugify("Graph Traversal")
    assert taxonomy.slugify(slug) == slug


def test_algorithm_slug_resolves_aliases() -> None:
    assert taxonomy.algorithm_slug("heap-priority-queue") == "heap"
    assert taxonomy.algorithm_slug("Heap / Priority Queue") == "heap"
    assert taxonomy.algorithm_slug("dp") == "dynamic-programming"
    assert taxonomy.algorithm_slug("google-skeletons") == "skeletons"
    assert taxonomy.algorithm_slug("sliding-window") == "sliding-window"


def test_catalog_slugs_keep_dfs_bfs_as_its_own_technique() -> None:
    assert taxonomy.catalog_slug("DFS / BFS") == "dfs-bfs"
    assert taxonomy.catalog_slug("Heap / Priority Queue") == "heap"


def test_matching_tags_to_known_algorithms_keeps_first_occurrence_order() -> None:
    known = {"heap", "graphs", "sliding-window"}
    tags = ["skill-map", "dfs-bfs", "heap-priority-queue", "heap", "unknown"]
    assert taxonomy.matched_algorithm_slugs(tags, known) == ["graphs", "heap"]


def test_primary_pattern_follows_priority() -> None:
    assert taxonomy.primary_pattern_tag(["heap", "sliding-window"]) == "sliding-window"
    assert taxonomy.primary_pattern_tag(["skill-map"]) == ""
    assert taxonomy.algorithm_slug_for_tags(["dp"]) == "dynamic-programming"
    assert taxonomy.algorithm_slug_for_tags([]) == ""
