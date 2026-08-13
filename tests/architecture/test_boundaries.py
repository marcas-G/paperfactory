"""Architecture boundary tests (upgraded from STEP-001 smoke level).

Now that real cross-module imports exist, we assert the dependency rules from
``docs/architecture/dependency-rules.md`` via static AST inspection:

    * RULE-01 / RULE-10: ``packages.domain`` MUST NOT import any sibling
      upper layer (control/cognition/runtime/capabilities/persistence/
      observability/evals) NOR any framework implementation
      (fastapi/sqlalchemy/temporalio/pydantic_ai/openai/anthropic).
    * RULE-02 / RULE-05: ``packages.control`` MUST NOT import
      cognition/runtime/capabilities/persistence (the kernel is independent).

Implementation is deliberately a small AST walker over the package source
trees — NO dependency-analysis framework is introduced (STEP-002 §26).
"""

from __future__ import annotations

import ast
from collections.abc import Iterable
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Modules that represent forbidden directions when imported FROM a given layer.
DOMAIN_FORBIDDEN_MODULES = {
    "packages.control",
    "packages.cognition",
    "packages.runtime",
    "packages.capabilities",
    "packages.persistence",
    "packages.observability",
    "packages.evals",
}

CONTROL_FORBIDDEN_MODULES = {
    "packages.cognition",
    "packages.runtime",
    "packages.capabilities",
    "packages.persistence",
}

# Framework implementations that must never leak into domain (RULE-01/RULE-10).
DOMAIN_FORBIDDEN_FRAMEWORKS = {
    "fastapi",
    "sqlalchemy",
    "temporalio",
    "pydantic_ai",
    "openai",
    "anthropic",
}


def _py_files(pkg_root: Path) -> Iterable[Path]:
    if not pkg_root.exists():
        return []
    return sorted(pkg_root.rglob("*.py"))


def _imported_names(tree: ast.AST) -> set[str]:
    """Collect all top-level module names referenced by import statements."""
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                names.add(node.module)
                names.add(node.module.split(".")[0])
            # relative imports like "from ..domain import x" have node.level>0
            # and a module that may start without the package prefix; handled
            # separately below via the resolved module string.
    return names


def _resolved_relative_modules(tree: ast.AST, file_pkg_prefix: str) -> set[str]:
    """Resolve relative imports (``from ..domain import x``) to absolute
    module strings given the importing file's package prefix."""
    resolved: set[str] = set()
    parts = file_pkg_prefix.split(".") if file_pkg_prefix else []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.level > 0:
            base = parts[: len(parts) - (node.level - 1)] if node.level - 1 <= len(parts) else []
            if node.module:
                candidate = ".".join([*base, node.module])
            else:
                candidate = ".".join(base)
            resolved.add(candidate)
    return resolved


def _parse(path: Path) -> ast.AST:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


# --- DOMAIN boundaries --------------------------------------------------

def test_domain_does_not_import_upper_layers() -> None:
    domain_root = REPO_ROOT / "packages" / "domain"
    violations: list[str] = []
    for path in _py_files(domain_root):
        tree = _parse(path)
        prefix = "packages.domain"
        resolved = _resolved_relative_modules(tree, prefix)
        for mod in resolved:
            for forbidden in DOMAIN_FORBIDDEN_MODULES:
                if mod == forbidden or mod.startswith(forbidden + "."):
                    violations.append(f"{path}: imports {mod}")
        # absolute imports of sibling packages (e.g. "packages.control")
        for name in _imported_names(tree):
            for forbidden in DOMAIN_FORBIDDEN_MODULES:
                if name == forbidden or name.startswith(forbidden + "."):
                    violations.append(f"{path}: imports {name}")
    assert not violations, "domain imports forbidden upper layer(s):\n" + "\n".join(violations)


def test_domain_does_not_import_frameworks() -> None:
    domain_root = REPO_ROOT / "packages" / "domain"
    violations: list[str] = []
    for path in _py_files(domain_root):
        tree = _parse(path)
        names = _imported_names(tree)
        hit = names & DOMAIN_FORBIDDEN_FRAMEWORKS
        for name in hit:
            violations.append(f"{path}: imports {name}")
    assert not violations, "domain imports forbidden framework(s):\n" + "\n".join(violations)


# --- CONTROL boundaries -------------------------------------------------

def test_control_does_not_import_upper_layers() -> None:
    control_root = REPO_ROOT / "packages" / "control"
    violations: list[str] = []
    for path in _py_files(control_root):
        tree = _parse(path)
        prefix = "packages.control"
        resolved = _resolved_relative_modules(tree, prefix)
        for mod in resolved:
            for forbidden in CONTROL_FORBIDDEN_MODULES:
                if mod == forbidden or mod.startswith(forbidden + "."):
                    violations.append(f"{path}: imports {mod}")
        for name in _imported_names(tree):
            for forbidden in CONTROL_FORBIDDEN_MODULES:
                if name == forbidden or name.startswith(forbidden + "."):
                    violations.append(f"{path}: imports {name}")
    assert not violations, "control imports forbidden upper layer(s):\n" + "\n".join(violations)


def test_control_may_depend_on_domain() -> None:
    # Sanity: control IS allowed to import domain (RULE-02). We just confirm
    # the domain import path resolves; failure here would indicate a packaging
    # problem rather than a rule violation.
    import packages.control  # noqa: F401
    import packages.domain  # noqa: F401
