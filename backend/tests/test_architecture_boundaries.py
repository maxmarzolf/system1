"""Layer boundaries, enforced by the import-linter contracts in ``backend/.importlinter``.

Running them from pytest means a plain ``pytest`` catches a violation; CI also runs ``lint-imports``.
"""

from __future__ import annotations

import os
from pathlib import Path

from importlinter.cli import lint_imports

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_import_linter_contracts_hold() -> None:
    cwd = os.getcwd()
    os.chdir(BACKEND_DIR)
    try:
        assert lint_imports(config_filename=".importlinter", no_cache=True) == 0, "Run `lint-imports` in backend/ for details"
    finally:
        os.chdir(cwd)
