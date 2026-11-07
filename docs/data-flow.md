# Data flow

How data moves through System 1: from the practice screen, through the evaluators, into Postgres, and back out to the Dashboard, Journey, Tune and Admin pages. For the tables themselves, see [database-schema.md](database-schema.md). For the backend's layering rules, see [backend-architecture.md](backend-architecture.md).

## The whole system

```mermaid
flowchart LR
  subgraph Browser["Browser (React + Vite)"]
    Practice["Practice / (App.tsx)"]
    Dashboard["/dashboard"]
    Journey["/practice-history (Journey)"]
    Tune["/tune"]
    Admin["/admin"]
  end

  subgraph API["FastAPI (backend/app)"]
    Coach["/api/coach/*<br/>drill generation, session plan"]
    Attempts["POST /api/attempts"]
    Reads["GET /api/skill-map-overview<br/>/api/history/day · /api/history/signals"]
    Catalog["/api/catalog/*"]
    AdminAPI["/api/admin/signals*"]
    Evaluators{{"Evaluator registry<br/>by modality"}}
  end

  subgraph External["External services"]
    LLM["LLM providers<br/>(OpenAI / Anthropic / Gemma)"]
    Jev["Jev · TypeSafe System One<br/>POST /v1/systemone"]
  end

  DB[("Postgres")]

  Practice -->|"fetch drills"| Coach
  Coach -->|"generate cards and MCQs"| LLM
  Coach <-->|"catalog, stored MCQs"| DB
  Practice -->|"submit answer"| Attempts
  Attempts --> Evaluators
  Evaluators -->|"mcq"| Jev
  Evaluators -->|"recall modalities"| LLM
  Evaluators -->|"submission + evaluation"| DB

  Dashboard --> Reads
  Journey --> Reads
  Reads --> DB
  Tune --> Catalog
  Admin --> Catalog
  Catalog --> DB
  Admin --> AdminAPI
  AdminAPI <-->|"signal definitions, revisions"| DB
  AdminAPI -->|"Try it (nothing saved)"| Jev
```

There are three loops:

1. **Practice:** fetch a drill, answer it, get graded, and store the result.
2. **Review:** the Dashboard and Journey read stored submissions back as readiness, activity and signal history.
3. **Configure:** `/admin` edits the MCQ signals that Jev uses; `/tune` adjusts local practice preferences and shows the recall signal specs.

## 1. Practice: submitting an answer

Every answer goes to `POST /api/attempts`. `submission_service.create_submission` picks an evaluator by the submission's `modality`, then stores whatever the evaluator returns.

```mermaid
sequenceDiagram
  autonumber
  participant UI as Practice UI
  participant API as POST /api/attempts
  participant Reg as Evaluator registry
  participant Ev as Evaluator
  participant Ext as Jev or LLM
  participant DB as Postgres

  UI->>API: answer, modality, tags, elapsedMs, problem / MCQ ids
  API->>Reg: get_evaluator(modality)
  Reg-->>API: JevMcqEvaluator / AssessorEvaluator / GhostRepEvaluator
  API->>Ev: evaluate(body)
  Ev->>DB: load context (MCQ, answer key, signal spec)
  Ev->>Ext: grade
  Ext-->>Ev: answers / assessment
  Ev-->>API: EvaluationOutcome(successful, evaluation)
  API->>DB: INSERT submission (signals.evaluation)
  API-->>UI: saved row + successful + evaluation
```

| Modality | Evaluator | Grades with |
|---|---|---|
| `mcq` | `JevMcqEvaluator` (`services/evaluators/jev_mcq.py`) | Jev, using the DB-backed signal registry |
| `total-recall`, `microdrill` | `AssessorEvaluator` (`services/evaluators/legacy_recall.py`) | LLM assessor and narrator, falling back to the semantic check |
| `ghost-rep` | `GhostRepEvaluator` (same file) | Semantic recall check against the algorithm's signal spec |

Adding a modality means writing a class with an `evaluate(body)` method and calling `register_evaluator` for it. Nothing else changes.

## 2. MCQ grading with Jev

This is the path that is now fully data-driven. All signal definitions live in the database and are read on every submission.

```mermaid
flowchart TD
  A["MCQ answer<br/>problemId + choiceId + elapsedMs"] --> B["build_mcq_context<br/>question, choices, answer key, chosen answer"]
  A --> C["mcq_algorithm_for_tags<br/>tags → algorithm slug<br/>(heap-priority-queue → heap, …)"]
  C --> D["load_mcq_spec(slug)"]
  D --> D1[("signal_evaluation_directive<br/>correctness question")]
  D --> D2[("signal_definition<br/>active · general + this algorithm")]
  D1 --> E["ModalitySignalSpec<br/>plugins + weights, hashed snapshot"]
  D2 --> E

  B --> F["Jev state<br/>question, choices, correct answer, submitted answer"]
  E --> G["Pass 1: one batched call<br/>correctness + signals that don't need it"]
  F --> G
  G -->|"Jev unavailable"| X["Answer-key fallback<br/>Jev signals marked unavailable"]
  G --> H{"correctness = '1'?"}
  H --> I["Pass 2 (only if needed)<br/>signals with needs_correctness,<br/>state + answeredCorrectly"]
  H --> J
  I --> J["Interpret each answer<br/>skip if applies_when doesn't match"]
  J --> K["Rubric: dimensions, modifiers,<br/>weighted score, primary failure"]
  K --> L["evaluation<br/>signalResults · correctness · provenance<br/>jevTrace · signalSpecSnapshot"]
  X --> K
  L --> M[("submission.signals.evaluation")]
```

Key points:

- **One question per signal.** Each Jev signal becomes one Choice, Score or Noul question. All of them go out in a single `POST /v1/systemone` call.
- **Correctness is a Jev question too.** It is a Choice with the labels `"1"` and `"0"`. The answer key is still checked: if Jev disagrees with it, the evaluation is flagged `answer_key_disagreement`. Low confidence is flagged `low_correctness_confidence`.
- **A second call happens only when needed.** Signals marked `needs_correctness` are asked after correctness is known, with `answeredCorrectly` added to the state.
- **Deterministic signals** (for example `completionTime`) are computed locally and never sent to Jev.
- **Failures degrade, they don't block.** If Jev is down, the answer key decides correctness and the Jev-backed signals are recorded as `unavailable`.
- **Every evaluation is explainable later.** It stores the exact spec snapshot and hash, Jev's request ids, the model and the raw answers.

## 3. Review: Dashboard and Journey

```mermaid
flowchart LR
  DB[("submission")] --> O["attempts_service<br/>build_skill_map_overview"]
  DB --> HD["get_history_day(date, tz)"]
  DB --> SH["get_signal_history(tz)"]
  O -->|"/api/skill-map-overview?historyDays&tz"| Dash["Dashboard<br/>readiness per algorithm"]
  O -->|"historyDays = all"| Grid["Journey: daily work grid"]
  SH -->|"/api/history/signals?tz"| Terrain["Journey: Signal Score Terrain (three.js)"]
  HD -->|"/api/history/day?date&tz"| Day["Journey: day detail<br/>each submission's full evaluation"]
```

- The browser sends its IANA time zone (`tz`), so "today" and day boundaries match what you see.
- The terrain plots signals (x) over time (y), with height showing how far each signal fell short. It is built from the stored rubric dimensions and modifiers, not by asking Jev again.
- The day detail renders the stored evaluation as is (`SubmissionSignalDetails.tsx`), including the Jev trace.

## 4. Configure: editing signals in /admin

```mermaid
sequenceDiagram
  autonumber
  participant Admin as /admin
  participant API as /api/admin/signals
  participant Rules as signal_definition_rules
  participant DB as Postgres
  participant Jev

  Admin->>API: GET (catalog: directive, signals, algorithms, implementations)
  API->>DB: read definitions + directive
  API-->>Admin: signals with Jev question preview and weight share

  Admin->>API: POST "try" (draft, problemId, choiceId)
  API->>Rules: validate draft
  API->>Jev: one question, real stored MCQ
  Jev-->>Admin: raw answer + interpreted score (nothing saved)

  Admin->>API: PUT /signals/{key} (draft, version)
  API->>Rules: validate (422 with field errors)
  API->>DB: UPDATE … WHERE version = $v (409 if stale)
  API->>DB: INSERT signal_definition_revision
  API-->>Admin: saved signal
  Note over DB: The next MCQ submission reads the new definition.
```

## Drill generation (for completeness)

Practice cards come from `/api/coach/*`:

- Catalog drills (`problem-drills`, `playlist-drills`) are read straight from the seeded catalog.
- Generated drills (`skill-map-drills`, `skill-map-drills-stream`, `micro-drill`, `multiple-choice-drills`) call the configured LLM provider. Generated MCQs are stored in `multiple_choice_problem`, deduplicated by fingerprint, so an MCQ answer always has a stored answer key to check against.
