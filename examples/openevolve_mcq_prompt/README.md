# Evolve the MCQ-generation prompt

This example evolves a reusable plain-text prompt, not Python code. The prompt
reads recent answer history, chooses the next reasoning decision, and generates
an MCQ. For each candidate prompt, `evaluator.py` asks OpenAI for one Sliding Window card, then
scores JSON structure and a few cues in the question, selected answer, and
explanation. When Jev is configured, it also judges question quality. The
score is from `0.0` to `1.0`.

From this directory:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install 'openevolve==0.4.0'
export OPENAI_API_KEY='your-openai-api-key'
.venv/bin/python evaluator.py initial_prompt.txt
.venv/bin/openevolve-run initial_prompt.txt evaluator.py \
  --config config.yaml --iterations 3 --output output
```

The first evaluator run gives the seed's baseline. Evolution then tests three
prompt revisions. Each evaluation makes one OpenAI API call, so running it
uses API credits. Inspect the best prompt in `output/` before using it in the
app. This small evaluator checks format and a few known concepts; it does not
measure the full teaching quality of a question.

## System1 Evolve tab

The Evolve page at `/evolve` runs this experiment through a separate service.
From the project root, start it with:

```bash
docker compose up -d --build evolve
```

The service reads `OPENAI_API_KEY` or `COACH_OPENAI_API_KEY` from `backend/.env`.
Each UI run writes its seed, checkpoints, and results to `output/ui-runs/` in
this directory. The System1 backend does not import OpenEvolve or store these
runs. New runs evaluate only Sliding Window. The UI displays checkpoint scores,
each prompt, and the MCQ returned during its evaluation. You can try the
choices and reveal the explanation. Answering records the selected option. New runs save these outputs as
OpenEvolve candidate artifacts; older runs may have scores only.
The candidate list shows format and Jev totals when present; selecting a
candidate expands Jev's question-level metrics for each test case.
For an older candidate, use **Generate MCQs** to make one OpenAI request and
save the result with that run.
Historical runs keep their saved Binary Search questions and original scores.

## Answer-guided evolution and Jev

Choose an MCQ option and select **Check answer**. The Evolve service saves that
choice once for the exact candidate and question. The choice and whether it was
correct are observations. Neither a correct nor a wrong choice is classified as
proof of a particular learner state.

Add `TYPESAFE_API_KEY=...` to `backend/.env` and recreate the isolated service so it loads the new environment value:

```bash
docker compose up -d --no-deps --force-recreate evolve
```

After the answer is saved, the page automatically starts one more OpenEvolve
iteration when the current run is complete. It resumes the latest population
checkpoint, so candidates, archive, and iteration numbers carry forward. The
recent answers and actual prior questions are added to the prompt-generation
instructions. OpenEvolve evolves the reusable rule for choosing a probe.
The prompt and recent answer history go to OpenAI, which returns both a
`nextProbe` and an MCQ. Then
[TypeSafe Jev](https://docs.typesafe.ai/api/system-one) judges whether the MCQ
is sound, whether the prompt used its rule to choose the probe, whether the
question tests that probe, and whether it tests a different reasoning decision
from the previous questions. Jev does not label the answer or choose the next
probe. The run history shows each round; the candidate list
includes the carried population and the new candidate. **Continue evolution**
can resume after a reload or a failed automatic continuation.

The evaluator generates fresh MCQs for each candidate, combines its format
checks (40%) with Jev's question score (60%), and returns the result to OpenEvolve as
`combined_score`. It also returns the answer history and Jev's question-level scores as
artifacts so prompt revisions can address weak probes or repeated questions. Answer correctness
itself is not a fitness score, since that would favor trivial questions. New answers affect the
next iteration; earlier candidate scores remain the scores from when they were
evaluated, so compare them with that context in mind.

Without a Jev key, answer-guided continuation is unavailable. Existing runs,
including those with written reviews, remain readable.

## Start from scratch

Use **Start from scratch** beside Run history on the Evolve page, then confirm
**Clear Evolve data**. This removes the saved UI runs in `output/ui-runs/`,
including their prompts, checkpoints, generated MCQs, and answers, and restores
the editor to `initial_prompt.txt`. Wait for an active evolution run to finish
before resetting. The seed file, API keys, and System1 practice data are not
part of the Evolve run history.
