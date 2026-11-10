# OpenEvolve hello world

This small experiment asks OpenEvolve to improve `choose_number()`. The seed
returns `0`; the evaluator awards a score of `1.0` for returning `42` and a
smaller score for more distant integers. It shows the three core pieces:
mutable seed code, a deterministic evaluator, and an LLM configuration.

From this directory, first check the seed without any dependencies:

```bash
python3 evaluator.py initial_program.py
# {'combined_score': 0.023255813953488372}
```

To run evolution, install OpenEvolve in an isolated environment and set an
[OpenAI API key](https://developers.openai.com/api/docs/quickstart) in your shell:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install 'openevolve==0.4.0'
export OPENAI_API_KEY='your-openai-api-key'
.venv/bin/openevolve-run initial_program.py evaluator.py \
  --config config.yaml --iterations 5 --target-score 1.0 --output output
```

The example uses OpenAI's `gpt-5.4-mini` through its Chat Completions API.
The command prints the best score and writes run artifacts to `output/`.
The five-iteration limit keeps this first run small; API usage may incur
charges.
