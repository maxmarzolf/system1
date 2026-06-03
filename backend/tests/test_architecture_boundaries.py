from __future__ import annotations

import ast
from pathlib import Path


ENDPOINTS_DIR = Path(__file__).resolve().parents[1] / "app" / "endpoints"
SERVICES_DIR = Path(__file__).resolve().parents[1] / "app" / "services"
DOMAIN_DIR = Path(__file__).resolve().parents[1] / "app" / "domain"
CORE_DIR = Path(__file__).resolve().parents[1] / "app" / "core"


def _core_import_violations(file_path: Path) -> list[str]:
    tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    violations: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            module = node.module
            if module == "app.core" or module.startswith("app.core."):
                violations.append(f"{file_path.name}:{node.lineno} -> from {module} import ...")

        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.name
                if name == "app.core" or name.startswith("app.core."):
                    violations.append(f"{file_path.name}:{node.lineno} -> import {name}")

    return violations


def test_endpoints_do_not_import_core_modules() -> None:
    violations: list[str] = []
    for file_path in sorted(ENDPOINTS_DIR.glob("*.py")):
        if file_path.name == "__init__.py":
            continue
        violations.extend(_core_import_violations(file_path))

    assert not violations, "Endpoint layer must depend on services, not core:\n" + "\n".join(violations)


def _import_violations(file_path: Path, blocked_prefixes: tuple[str, ...]) -> list[str]:
    tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    violations: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            module = node.module
            if module.startswith(blocked_prefixes):
                violations.append(f"{file_path.name}:{node.lineno} -> from {module} import ...")

        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.name
                if name.startswith(blocked_prefixes):
                    violations.append(f"{file_path.name}:{node.lineno} -> import {name}")

    return violations


def test_services_do_not_import_endpoints_or_fastapi() -> None:
    violations: list[str] = []
    blocked_prefixes = ("app.endpoints", "fastapi")
    for file_path in sorted(SERVICES_DIR.glob("*.py")):
        if file_path.name == "__init__.py":
            continue
        violations.extend(_import_violations(file_path, blocked_prefixes))

    assert not violations, "Service layer must stay framework-agnostic and endpoint-independent:\n" + "\n".join(violations)


def test_services_do_not_import_core_coach() -> None:
    violations: list[str] = []
    blocked_prefixes = ("app.core.coach",)
    for file_path in sorted(SERVICES_DIR.glob("*.py")):
        if file_path.name == "__init__.py":
            continue
        violations.extend(_import_violations(file_path, blocked_prefixes))

    assert not violations, "Service layer must not depend on app.core.coach:\n" + "\n".join(violations)


def test_domain_does_not_import_repositories() -> None:
    violations: list[str] = []
    for file_path in sorted(DOMAIN_DIR.glob("*.py")):
        if file_path.name == "__init__.py":
            continue
        violations.extend(_import_violations(file_path, ("app.repositories",)))

    assert not violations, "Domain layer must not depend on repositories:\n" + "\n".join(violations)


def test_coach_core_does_not_import_repositories() -> None:
    coach_file = CORE_DIR / "coach.py"
    violations = _import_violations(coach_file, ("app.repositories",))
    assert not violations, "app.core.coach must not depend on repositories:\n" + "\n".join(violations)
