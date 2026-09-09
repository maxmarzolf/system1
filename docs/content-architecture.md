# Practice Content Architecture

## Canonical Content

`problem` is the canonical table for every practice item, including core algorithms, meta questions, static playlists, focused fallback cards, and generated LLM cards.

Do not create another table that stores duplicate practice titles, prompts, solutions, difficulty, tags, or generated cards.

Canonical content fields live on `problem`:

- `slug`: stable content identity.
- `source_type`: provenance such as `core-catalog`, `core-meta`, `static-playlist`, or `generated-llm`.
- `prompt`, `code`, `missing`, `hint`, `tags`: the practice payload.
- `generation_context`, `llm_used`: generation metadata when applicable.

## Relationships

`submission` is the immutable attempt ledger. Multiple submissions may reference one problem through `submission.problem_slug`. `generated_card` remains a JSON snapshot so historical attempts render exactly what the user saw, even if the canonical problem later changes.

`playlist` and `playlist_problem_order` organize canonical problems without copying their content. Ordering is represented by `order_slug` and `position`.

MCQ content remains on the existing `multiple_choice_problem` path for now. It is intentionally outside this migration.

## Runtime Rules

- Runtime reads use repositories backed by `problem` and its relationship tables.
- Static Python/TypeScript catalogs are seed and fallback inputs only during migration.
- Generated cards write directly to `problem`.
- Routine practice-history reset may delete generated `problem` rows, but must not delete core or static catalog rows.
- Any future schema or repository change that introduces a duplicate practice-content table must update this document and the architecture tests before merging.
