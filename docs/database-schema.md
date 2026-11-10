# Database schema

Postgres. The schema is built by [Alembic](https://alembic.sqlalchemy.org/) migrations written as raw SQL in [`backend/app/migrations/versions/`](../backend/app/migrations/versions/); there are no ORM models. Revision `0001` is the baseline ([`0001_baseline.sql`](../backend/app/migrations/versions/0001_baseline.sql), frozen), and each later revision is one change on top of it. Startup (`connect()` in `backend/app/database.py`) takes a Postgres advisory lock, runs `alembic upgrade head`, seeds the catalog if it changed, and seeds any missing default MCQ signals. See [Migrations](#migrations) below.

The tables fall into three groups:

- **Content catalog:** what you practice. Seeded from code at boot whenever the code catalogs change.
- **Practice records:** what you did. Written by `POST /api/attempts`.
- **Signal registry:** how MCQ answers are graded by Jev. Seeded once (insert-if-missing), then owned by `/admin`.

## Entity relationships

Solid lines are foreign keys. Dotted lines are references by value that the database does not enforce.

```mermaid
erDiagram
    algorithm ||--o{ problem : "algorithm_slug"
    problem ||--o{ problem_skill : ""
    skill ||--o{ problem_skill : ""
    problem ||--o{ problem_technique : ""
    technique ||--o{ problem_technique : ""
    playlist ||--o{ playlist_problem_order : ""
    problem ||--o{ playlist_problem_order : ""

    problem |o--o{ submission : "problem_slug"
    multiple_choice_problem |o--o{ submission : "multiple_choice_problem_id"

    algorithm |o--o{ multiple_choice_problem : "algorithm_slug"
    algorithm |o..o{ signal_definition : "scope (or 'general')"
    signal_definition ||..o{ signal_definition_revision : "subject = key"
    signal_evaluation_directive ||..o{ signal_definition_revision : "subject = directive:mcq"

    algorithm {
        varchar slug PK
        varchar name
        int display_order
        jsonb signal_spec "recall signal spec (seeded)"
    }
    technique {
        varchar slug PK
        varchar name
        int display_order
    }
    skill {
        varchar slug PK
        varchar name
        int display_order
    }
    problem {
        varchar slug PK
        varchar algorithm_slug FK
        varchar title
        varchar difficulty "Easy | Med. | Hard"
        text description "shown as the card prompt"
        text code
        varchar source_type "core-catalog | core-meta | static-playlist | generated-llm"
        text_arr tags
        jsonb leetcode_examples
        int display_order
    }
    problem_skill {
        varchar problem_slug PK,FK
        varchar skill_slug PK,FK
        int display_order
    }
    problem_technique {
        varchar problem_slug PK,FK
        varchar technique_slug PK,FK
        int display_order
    }
    playlist {
        varchar slug PK
        varchar title
        bool show_on_skill_map
        bool static_deck
    }
    playlist_problem_order {
        varchar playlist_slug PK,FK
        varchar order_slug PK
        varchar problem_slug PK,FK
        int position "unique per playlist + order"
        jsonb metadata "tier, family, ..."
    }
    multiple_choice_problem {
        varchar id PK
        text question_text
        text explanation
        jsonb choices "[{id, text}], in served order"
        varchar correct_choice_id
        varchar algorithm_slug FK "nullable"
        varchar fingerprint UK
        timestamptz created_at
    }
    submission {
        bigserial id PK
        varchar session_id
        varchar problem_slug FK
        varchar multiple_choice_problem_id FK
        varchar modality "total-recall | ghost-rep | mcq | microdrill"
        text answer
        text correct_answer
        bool successful
        jsonb signals "elapsed_ms, evaluation, flow, modality"
        text_arr category_tags
        varchar template_mode
        varchar support_layer
        timestamptz created_at
    }
    signal_definition {
        varchar key PK
        varchar modality "mcq"
        varchar scope "general or algorithm slug"
        text label
        text description "admin only, never sent to Jev"
        varchar source "jev | deterministic"
        varchar primitive "choice | score | noul"
        varchar implementation "deterministic only"
        text instructions
        json criteria "JSON, not JSONB: keeps label order"
        jsonb score_map
        varchar role "dimension | modifier | diagnostic"
        varchar axis
        varchar applies_when "always | correct | incorrect"
        bool needs_correctness
        float weight
        varchar status "active | archived"
        int version "optimistic lock"
    }
    signal_evaluation_directive {
        varchar modality PK
        text instructions
        jsonb criteria "labels fixed to 1 / 0"
        float correctness_weight
        int version
    }
    signal_definition_revision {
        bigserial id PK
        varchar subject
        varchar action "seed | create | update | archive | restore"
        jsonb before
        jsonb after
        timestamptz created_at
    }
```

## Content catalog

| Table | Holds | Written by |
|---|---|---|
| `algorithm` | One row per algorithm family (sliding window, heap, …). `signal_spec` is the recall signal spec used by the legacy LLM evaluators. | Seed (overwrites) |
| `problem` | A practice card: its code, description (served as the prompt), hint and tags. Every problem belongs to one algorithm. | Seed |
| `skill`, `technique` | Finer-grained labels. | Seed |
| `problem_skill`, `problem_technique` | Many-to-many links from problems to skills and techniques. | Seed |
| `playlist`, `playlist_problem_order` | Ordered decks of problems. A playlist can have several named orders (`order_slug`). | Seed |
| `multiple_choice_problem` | A generated MCQ: its `choices` array (four `{id, text}` objects, in served order), the answer key (`correct_choice_id`), and the algorithm it was generated for (`algorithm_slug`, when known). `fingerprint` deduplicates identical questions. MCQ grading scopes signals by `algorithm_slug`, falling back to the submission's tags. | Generated during practice |

### Content rules

- **`problem` is the single home for practice content:** core algorithms, meta questions, static playlist cards and generated cards. Do not add another table that stores titles, prompts, code, difficulty or tags; the architecture tests guard this.
- **`source_type` records where a row came from:** `core-catalog`, `core-meta`, `static-playlist` or `generated-llm`. Generated cards are written straight to `problem`, with `generation_context` (which also records `llmUsed`).
- **Playlists only organize:** `playlist` and `playlist_problem_order` reference problems by slug and never copy their content.
- **Submissions keep a snapshot:** `submission.generated_card` stores the card exactly as shown, so history renders correctly even if the problem later changes.
- **Resetting practice history** deletes `generated-llm` problems but never core or playlist rows.
- **MCQs are separate on purpose:** they live in `multiple_choice_problem`. A stored question is never edited, so every MCQ answer can be checked against what was shown.
- The Python and TypeScript catalogs in code (`backend/app/core/*catalog*.py`, `src/data/`) are seed inputs and offline fallbacks; reads at runtime go through the repositories.
- **Seeding is skipped when nothing changed:** the seed hashes the code catalogs plus the seeding code and stores the hash in `seed_state` (key `catalog`). A boot with a matching hash writes nothing. To force a reseed, `DELETE FROM seed_state WHERE key = 'catalog'` and restart.
- **Retired core problems that have submissions are kept:** `submission.problem_slug` is `ON DELETE RESTRICT`, so the seed skips deleting them and logs a warning instead of failing the boot.

## Practice records

`submission` is the only table practice writes to. One row per answer, across every modality.

- `modality` picks the evaluator (see [data-flow.md](data-flow.md)).
- `problem_slug` links recall-style answers to a catalog problem. `multiple_choice_problem_id` links MCQ answers to their question.
- `signals` is a JSONB object, and a CHECK constraint allows only these keys:
  - `elapsed_ms` (required, a number)
  - `evaluation`: the canonical evaluation. For MCQ this includes `signalResults`, `correctness`, `provenance`, `jevTrace` and a `signalSpecSnapshot`, so a stored grade can always be explained even after the signals change.
  - `flow`: flow-mode bookkeeping (`anchorCardId`, …)
  - `modality`: modality-specific extras
- The Dashboard and Journey pages read from this table. The Journey day view groups rows by date in the viewer's time zone.

## Signal registry

These three tables make MCQ grading data-driven. See [backend-architecture.md](backend-architecture.md) for the code side.

- **`signal_definition`:** one row per signal. A signal is either a Jev question (`source = 'jev'`, with a `primitive`) or a deterministic implementation registered in code (`source = 'deterministic'`, with an `implementation` such as `completionTime`). The `signal_definition_source_fields_check` constraint enforces that split.
  - `scope` is `general` (applies to every MCQ) or an algorithm slug (applies only to that algorithm's MCQs). It is checked in code, not by a foreign key.
  - Signals are archived, never deleted: past evaluations refer to their keys.
  - Every write must send the current `version`. A stale version is a 409.
- **`signal_evaluation_directive`:** the correctness question for a modality. Its wording and weight are editable; its labels are always `"1"` and `"0"`.
- **`signal_definition_revision`:** an append-only log of every seed, create, update, archive and restore, with before and after snapshots. `subject` is a signal key, or `directive:<modality>` for the correctness question.

The evaluator reads the active definitions on every MCQ submission, so an edit in `/admin` applies to the next answer without a restart.

## Migrations

Alembic, raw SQL, on the app's asyncpg driver (`postgresql+asyncpg`). Files:

- `backend/alembic.ini`: CLI config. The URL comes from `DATABASE_URL` (`app.config.settings`).
- `backend/app/migrations/env.py`: async environment; holds a transaction-level advisory lock while upgrading, and runs every pending revision in one transaction.
- `backend/app/migrations/versions/`: one file per revision. `execute_script()` (from `app/migrations/runner.py`) runs a multi-statement SQL string, `DO $$` blocks included.
- `alembic_version`: the applied revision, managed by Alembic.

The app upgrades to head on every start, so in normal use you never run Alembic by hand. To change the schema:

```bash
cd backend
alembic revision -m "add foo to bar" --rev-id 0008   # next number in sequence
# write the SQL in upgrade() (and downgrade() if it is reversible)
alembic upgrade head                                 # or just restart the backend
alembic current                                      # which revision a database is on
```

Rules:

- **Never edit an applied revision** (the baseline included). Add a new one.
- **Write revisions to be safe if their change already exists** (`IF NOT EXISTS`, `IF EXISTS`, guarded `UPDATE`s), so databases that predate a change, or were patched by hand, upgrade cleanly.
- **Keep data fixes in revisions, not in startup code:** a revision runs once per database; startup code runs on every boot.
- Revision numbers are zero-padded and sequential (`--rev-id`), so `versions/` reads in order.

Databases created before Alembic need nothing special: the baseline is all `IF NOT EXISTS`, and revisions `0002`–`0006` replay the old in-place upgrades (add `algorithm.signal_spec`, drop `submission.migration_key`, stamp evaluations missing `signalSpec`, add `signal_definition.description`, backfill `submission.problem_slug`). `0007` adds `seed_state`.

Cleanup revisions:

- **`0008`** drops columns nothing read: `submission.user_id`, `target_source`, `target_control`, `format_control` and `updated_at`; `problem.prompt` and `llm_used`; `playlist_problem_order.tier` and `family`. It also drops unused submission indexes, and adds an expression index for the card-id lookup.
- **`0009`** normalizes `multiple_choice_problem`:
  - the choices become one `choices` array, and the answer key is stored once;
  - `question_help_text` is renamed `explanation`;
  - timestamps become `TIMESTAMPTZ`;
  - a nullable `algorithm_slug` links each MCQ to its algorithm.
