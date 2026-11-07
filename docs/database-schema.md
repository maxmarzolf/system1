# Database schema

Postgres, defined in [`backend/app/schema.sql`](../backend/app/schema.sql). The backend applies that file at every startup (every statement is `IF NOT EXISTS`), then runs the small, idempotent upgrades in `_apply_schema_upgrades` (`backend/app/database.py`) and seeds the catalog and the default MCQ signals. There is no separate migration tool.

The tables fall into three groups:

- **Content catalog:** what you practice. Seeded from code on every boot.
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
        text code
        text prompt
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
        varchar tier
        varchar family
        jsonb metadata
    }
    multiple_choice_problem {
        varchar id PK
        text question_text
        varchar choice_labels_1_to_4
        text choice_texts_1_to_4
        varchar correct_answer_label
        varchar fingerprint UK
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
| `algorithm` | One row per algorithm family (sliding window, heap, …). `signal_spec` is the recall signal spec used by the legacy LLM evaluators. | Seed on every boot (overwrites) |
| `problem` | A practice card: its code, prompt, hint and tags. Every problem belongs to one algorithm. | Seed |
| `skill`, `technique` | Finer-grained labels. | Seed |
| `problem_skill`, `problem_technique` | Many-to-many links from problems to skills and techniques. | Seed |
| `playlist`, `playlist_problem_order` | Ordered decks of problems. A playlist can have several named orders (`order_slug`). | Seed |
| `multiple_choice_problem` | A generated MCQ with up to four choices and the answer key. `fingerprint` deduplicates identical questions. | Generated during practice |

### Content rules

- **`problem` is the single home for practice content:** core algorithms, meta questions, static playlist cards and generated cards. Do not add another table that stores titles, prompts, code, difficulty or tags; the architecture tests guard this.
- **`source_type` records where a row came from:** `core-catalog`, `core-meta`, `static-playlist` or `generated-llm`. Generated cards are written straight to `problem`, with `generation_context` and `llm_used`.
- **Playlists only organize:** `playlist` and `playlist_problem_order` reference problems by slug and never copy their content.
- **Submissions keep a snapshot:** `submission.generated_card` stores the card exactly as shown, so history renders correctly even if the problem later changes.
- **Resetting practice history** deletes `generated-llm` problems but never core or playlist rows.
- **MCQs are separate on purpose:** they live in `multiple_choice_problem`. A stored question is never edited, so every MCQ answer can be checked against what was shown.
- The Python and TypeScript catalogs in code (`backend/app/core/*catalog*.py`, `src/data/`) are seed inputs and offline fallbacks; reads at runtime go through the repositories.

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
