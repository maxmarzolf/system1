# How answers are graded

Every practice answer, whatever the modality, goes through the same steps:

```
question generated and stored → learner answers → POST /api/attempts → one pipeline grades it → one result view
```

This page explains the pipeline without needing to read the code. The code lives in
`backend/app/services/evaluation/`. Each step is its own module, and its docstring repeats the
relevant part of this page.

## Modalities

| Modality | id | What the learner does | Stored item it is graded against |
|---|---|---|---|
| MCQ | `mcq` | Picks one of four choices | `multiple_choice_problem` row (holds the answer key) |
| Total Recall | `total-recall` | Types the algorithm from memory | `problem` row for the card (its reference solution) |
| Ghost | `ghost-rep` | Types over a faint target | The target text sent with the rep (the rep *is* typing that text) |
| Microdrill | `microdrill` | Fills the blanks in a template | `generated_exercise` row written when the drill was generated |
| Ladder | `ladder` | Writes one rung of a graded problem ladder | `generated_exercise` row written when the rung was generated |

The ids are shared by the backend (`signal_definition.modality`, `submission.modality`) and the
frontend (`src/shared/modality.ts`).

If the stored item can't be found (an old card, or an exercise generated before items were
stored), code modalities fall back to the reference the browser sent. The evaluation is then
flagged `reference_from_client`.

## The pipeline

`services/evaluation/pipeline.py: evaluate()` runs these steps in order:

1. **Context** (`context.py`, `contexts/`): one *context builder* per modality loads the stored
   item and returns a `SubmissionContext`. It contains:
   - `state`: what Jev is asked about, e.g. `prompt`, `referenceSolution`, `submittedAnswer`;
     for MCQ, the question, choices and selected choice;
   - `record`: what gets saved with the submission;
   - `deterministic_correct`: the modality's own exact check. For MCQ this is the answer key;
     for Ghost, an exact typed match; for code modalities, a structural (AST) match with the
     reference;
   - `overrides`: hard failures (see [Overrides](#hard-overrides));
   - `flags`.
2. **Spec** (`signal_registry_service.load_spec`): loads the modality's correctness directive and
   its active signals. These are the *general* signals plus those scoped to the item's algorithm.
   See [Signals](#signals).
3. **Jev pass 1** (`jev.py`): one call asking the correctness question, plus every Jev signal
   that doesn't need to know whether the answer was correct.
4. **Decide** (`verdict.py: decide`): decides correctness. See [Who decides](#who-decides-correctness).
5. **Jev pass 2**: asks the signals marked `needs_correctness`, with `answeredCorrectly` added to
   the state. Skipped when there are none.
6. **Interpret**: each signal turns its Jev answer (or, for deterministic signals, the context)
   into a 0–100 score. Its result is `scored`, `not_applicable` (it only applies to correct or
   to incorrect answers) or `unavailable` (Jev didn't answer).
7. **Band** (`verdict.py: band`): sets the verdict. See [Verdicts](#verdicts).
8. **Rubric** (`domain/feedback_builder.py: rubric_from_signal_results`): computes the overall
   score as the weighted mean of correctness (100 or 0, weighted by the directive's
   `correctness_weight`) and every scored signal. Diagnostic signals don't count.
9. **Feedback** (optional, `feedback.py`): an LLM writes coaching text *from Jev's results*.
   See [Written feedback](#written-feedback).
10. **Outcome**: builds the stored `Evaluation`: verdict, scores, `correctness`, `signalResults`,
    a spec snapshot, `provenance` (engine, model, flags, request ids, usage), `jevTrace` and
    feedback.

A pass with no questions makes no call. Ghost's correctness is deterministic and it has no Jev
signals, so a ghost rep never calls Jev.

## Who decides correctness

`decide()` applies these rules in order. The first match wins, and its name is stored in
`evaluation.correctness.source`:

| Order | Source | When | Notes |
|---|---|---|---|
| 1 | `deterministic-override` | A hard override applies | Incorrect, whatever Jev said. Flag `deterministic_override`. |
| 2 | `deterministic` | The directive's correctness source is `deterministic` | The modality's own check decides (Ghost). |
| 3 | `jev` | Jev answered the correctness question | Jev's `"1"` = correct, `"0"` = incorrect. |
| 4 | `deterministic-fallback` | Jev was unavailable | The exact check decides. Flag `jev_unavailable`. |

Extra flags when Jev decides:
- `answer_key_disagreement`: MCQ only, Jev disagreed with the stored answer key. Jev's answer
  still stands.
- `low_correctness_confidence`: Jev's confidence was below the *low-confidence* setting.

### Hard overrides

Code is **never executed**. For code modalities (Total Recall, Microdrill, Ladder),
`core/code_checks.py: hard_failures` marks the answer incorrect without asking Jev's opinion
when any of these apply:

| Key | Meaning |
|---|---|
| `empty` | Nothing was typed (or only the template). |
| `syntax` | The answer is not valid Python. |
| `no_return` | The reference returns a value and the answer never does. |

Jev is still asked its signal questions, so the result still shows *how* close the answer was.
These overrides exist because calibration found Jev marking an answer with no `return` as
correct (see [Calibration](#calibration)).

### When Jev is unavailable

Every modality degrades the same way:
- correctness comes from the deterministic check (`deterministic-fallback`);
- Jev signals are `unavailable`;
- deterministic signals still score;
- the evaluation is flagged `jev_unavailable`;
- the response carries `feedbackUnavailable`, and the practice screen says so.

The structural check is strict: only an answer that matches the reference's structure passes.
Setting `JEV_ENABLED=false` forces this path.

## Verdicts

| Verdict | Rule |
|---|---|
| `sound` | Correct. |
| `close` | Incorrect, and the `nearMiss` signal scored at or above the *near-miss threshold*. |
| `needs-work` | Incorrect otherwise (including when `nearMiss` didn't score). |

`nearMiss` is a Jev choice signal: Far = 0, Plausible = 50, Near = 100. With the default
threshold of 75, only "Near" counts as close. Because the verdict comes from a score and a
threshold, more bands can be added later without changing Jev's question.

## Signals

A *signal* is one thing measured about an answer. Each signal is a `signal_definition` row,
keyed by `(modality, key)`:

- **Source**: `jev` (a choice, score or yes/no question that Jev answers) or `deterministic`
  (computed locally by a registered implementation in `core/signals/deterministic.py`).
- **Role**:
  - `dimension`: counts toward the score;
  - `modifier`: a small adjustment, e.g. speed;
  - `diagnostic`: names something, e.g. the main mistake; shown, but never scored.
- **Scope**: `general` (every item in the modality) or an algorithm slug (only items of that
  algorithm).
- **Weight**, **applies to** (correct, incorrect or both), and **needs correctness** (asked in
  pass 2).

Each modality also has one **directive** (a `signal_evaluation_directive` row): the correctness
question, its criteria, its weight, and its source (`jev` or `deterministic`).

Shared keys mean the same thing in every modality:
- `nearMiss`: how close a wrong answer was;
- `completionTime` / `codeCompletionTime`: speed, deterministic;
- `syntaxValid`: parses as Python;
- `structuralMatch`: AST match with the reference;
- `blankAccuracy`: share of microdrill blanks filled correctly.

Default signals are seeded from `core/signals/{mcq,total_recall,ghost_rep,microdrill,ladder}.py`
via `core/signals/defaults.py`:

| Modality | Correctness (weight) | General signals | Algorithm-scoped |
|---|---|---|---|
| MCQ | Jev (0.6) | conceptRecognition, nearMiss, distractorMisconception (diagnostic), completionTime | — |
| Total Recall | Jev (0.4) | structure, completeness, patternFidelity, nearMiss, errorPattern (diagnostic), syntaxValid, completionTime | 4 each for sliding-window, two-pointers, binary-search, dynamic-programming |
| Ghost | Deterministic (0.6) | structuralMatch, completionTime | — |
| Microdrill | Jev (0.5) | blankAccuracy, nearMiss, errorPattern (diagnostic), syntaxValid, completionTime | — |
| Ladder | Jev (0.6) | completeness, nearMiss, errorPattern (diagnostic), syntaxValid, completionTime | — |

Edits made on the Admin page are stored rows, and the next grading uses them. Each change is
recorded as a revision. The spec reference stored with every evaluation (algorithm, modality,
version, hash), together with the full snapshot, records exactly what an answer was graded with.

## Written feedback

Jev only answers choice, score and yes/no questions; it never writes text. For the modalities
named in the *written feedback* setting (default: Total Recall, Microdrill, Ladder), one more
LLM call (`core/feedback_writer.py`) turns the verdict, the scored signals and any overrides into
coaching text:
- `fullFeedback`
- `primaryFocus`
- `nextMove`
- `affirmation`
- `strengths`
- …

That call **never changes the grade**. If it fails, the evaluation stands without the text and
is flagged `feedback_unavailable`.

## What the learner sees

The response is the same shape for every modality. `src/shared/evaluation/EvaluationResult.tsx`
shows:
- the verdict, overall score and who decided;
- flags and override reasons;
- the written feedback;
- each scored signal as a meter, plus the diagnoses.

MCQ and Ghost show the compact form (no meters). Journey's submission detail shows the same view
above the full stored evaluation and the raw model calls.

## Traces

Every Jev request and response is stored in `evaluation.jevTrace` (with request ids, model and
usage), and every LLM exchange (generation, feedback) in the submission's LLM trace. Journey →
day → submission → *Model calls* shows all of them.

## Configuration (Admin page)

`/admin` holds every grading and generation setting. Tune keeps only personal editor and hotkey
preferences.

- **Modality rail** (MCQ, Total Recall, Ghost, Microdrill, Ladder): for each modality you can:
  - edit the correctness question (including its source);
  - create, edit and archive signals by scope;
  - see the exact Jev question the server will send;
  - view each change's history;
  - **try** an unsaved draft against a stored item (one Jev call, nothing stored).
- **Settings** (`app_setting` table, versioned, so a stale save is rejected rather than
  overwriting):
  - **Grading**: which modalities get written feedback, the near-miss threshold (default 75), the
    low-confidence threshold (default 0.6), and how fast Journey's competency fades on days without
    practice (default 0.02, i.e. 2% a day), and after how many days of decay an algorithm is flagged
    as in free fall (default 10).
  - **Generation**: the code style for generated recall cards (type hints, comments, variable
    names) and the MCQ model per provider. The MCQ model defaults to the `COACH_MCQ_*`
    environment variables, and this setting overrides them.
  - **Practice**: MCQ set size and order, and the Google playlist order.

## Calibration

`backend/scripts/jev_recall_calibration.py` (opt-in, calls the real Jev API, never run in CI)
measures how well Jev's recall correctness question grades code typed from memory:

```bash
python backend/scripts/jev_recall_calibration.py report.json --problems 10
```

Results when the pipeline was built:
- **87/87** correct on constructed answers (reference solutions kept correct by renaming,
  comments or blank lines, or broken by a missing return, stubbed body or truncation), after one
  wording fix;
- **18/19** agreement with verdicts stored by the old LLM grader.

The one disagreement was an answer with no `return` that Jev called correct, which is why the
`no_return` override exists. Re-run the script after changing the Total Recall directive.

## Adding a modality

1. Add the id to `MODALITIES` (`core/signals/defaults.py`, `src/shared/modality.ts`) and to the
   database check constraints (a migration).
2. Write its defaults module in `core/signals/`: a directive, signals and state fields.
3. Write a `ContextBuilder` in `services/evaluation/contexts/` and register it in
   `register_default_context_builders`.
4. On the frontend, add `features/practice/modalities/<name>/`: its panel, its answer state and
   a `draft.ts` that turns an answer into a `ModalityDraft`. Submitting (`submission/`) and the
   result view (`shared/evaluation/`) need no changes.
