"""Write the API's OpenAPI document, which the frontend types are generated from.

Usage (from the repo root): python backend/scripts/export_openapi.py [output path]
Default output: src/api/openapi.json. Then run `npm run gen:api`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.main import create_app  # noqa: E402

DEFAULT_OUTPUT = BACKEND.parent / "src" / "api" / "openapi.json"


def openapi_document() -> str:
    return json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
    output.write_text(openapi_document())
    print(f"Wrote {output}")
