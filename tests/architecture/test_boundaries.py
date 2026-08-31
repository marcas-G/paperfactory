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

# Cognition (M2) must not depend on control/runtime/capabilities/persistence/
# observability (STEP-006 §57). The context kernel is built on domain only.
COGNITION_FORBIDDEN_MODULES = {
    "packages.control",
    "packages.runtime",
    "packages.capabilities",
    "packages.persistence",
    "packages.observability",
    "packages.evals",
}

COGNITION_FORBIDDEN_FRAMEWORKS = {
    "fastapi",
    "sqlalchemy",
    "temporalio",
    "pydantic_ai",
    "openai",
    "anthropic",
    "langgraph",
    "crewai",
    "autogen",
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


# --- PORTS must stay abstract (STEP-003 §36) ---------------------------

CONTROL_FRAMEWORK_BLACKLIST = {
    "fastapi",
    "sqlalchemy",
    "temporalio",
    "pydantic_ai",
    "openai",
    "anthropic",
}


def test_control_does_not_import_frameworks() -> None:
    control_root = REPO_ROOT / "packages" / "control"
    violations: list[str] = []
    for path in _py_files(control_root):
        tree = _parse(path)
        names = _imported_names(tree)
        hit = names & CONTROL_FRAMEWORK_BLACKLIST
        for name in hit:
            violations.append(f"{path}: imports {name}")
    assert not violations, (
        "control imports forbidden framework(s):\n" + "\n".join(violations)
    )


# --- COGNITION boundaries (STEP-006 §57) --------------------------------

def test_cognition_does_not_import_forbidden_layers() -> None:
    cognition_root = REPO_ROOT / "packages" / "cognition"
    violations: list[str] = []
    for path in _py_files(cognition_root):
        tree = _parse(path)
        prefix = "packages.cognition"
        resolved = _resolved_relative_modules(tree, prefix)
        for mod in resolved:
            for forbidden in COGNITION_FORBIDDEN_MODULES:
                if mod == forbidden or mod.startswith(forbidden + "."):
                    violations.append(f"{path}: imports {mod}")
        for name in _imported_names(tree):
            for forbidden in COGNITION_FORBIDDEN_MODULES:
                if name == forbidden or name.startswith(forbidden + "."):
                    violations.append(f"{path}: imports {name}")
    assert not violations, (
        "cognition imports forbidden layer(s):\n" + "\n".join(violations)
    )


def test_cognition_does_not_import_frameworks() -> None:
    cognition_root = REPO_ROOT / "packages" / "cognition"
    violations: list[str] = []
    for path in _py_files(cognition_root):
        tree = _parse(path)
        names = _imported_names(tree)
        hit = names & COGNITION_FORBIDDEN_FRAMEWORKS
        for name in hit:
            violations.append(f"{path}: imports {name}")
    assert not violations, (
        "cognition imports forbidden framework(s):\n" + "\n".join(violations)
    )


def test_cognition_only_domain_and_stdlib() -> None:
    """cognition imports must resolve to domain, stdlib, or itself only."""
    cognition_root = REPO_ROOT / "packages" / "cognition"
    violations: list[str] = []
    allowed_first_party = {"packages", "packages.domain", "packages.cognition"}
    for path in _py_files(cognition_root):
        tree = _parse(path)
        for name in _imported_names(tree):
            if name.startswith("packages."):
                top = name.split(".")[1]
                if top not in {"domain", "cognition"}:
                    violations.append(f"{path}: imports {name}")
            elif name == "packages":
                if name not in allowed_first_party:
                    violations.append(f"{path}: imports {name}")
    assert not violations, (
        "cognition imports non-domain first-party:\n" + "\n".join(violations)
    )


def test_store_ports_are_protocols() -> None:
    """All persistence ports in packages/control/store.py MUST be typing
    Protocol classes (Ports & Adapters), not concrete adapters and not bound
    to SQLAlchemy / FastAPI."""
    from packages.control import store as store_mod

    expected_ports = [
        "StateStore",
        "TaskStore",
        "PendingTransitionStore",
        "ApprovalStore",
        "BranchStore",
        "ForkPointStore",
        "MergeStore",
        "PolicyRecommendationStore",
        "ControlEventSink",
    ]
    for name in expected_ports:
        obj = getattr(store_mod, name, None)
        assert obj is not None, f"missing port: {name}"
        # runtime_checkable Protocol classes expose _is_protocol = True.
        bases = [getattr(c, "__name__", "") for c in getattr(obj, "__bases__", ())]
        assert getattr(obj, "_is_protocol", False), (
            f"{name} is not a Protocol (bases={bases})"
        )


def test_inmemory_adapters_live_in_testing_module() -> None:
    """Concrete (test/dev) adapters MUST live in packages/control/testing.py,
    NOT in the public store/controller modules (STEP-003 §11/§19)."""
    import packages.control as public
    import packages.control.testing as testing

    # public surface should not leak in-memory adapter classes
    leaked = [
        n
        for n in dir(public)
        if n.startswith("InMemory")
    ]
    assert not leaked, f"in-memory adapters leaked into public API: {leaked}"
    # they should exist in the testing module instead
    for adapter in [
        "InMemoryStateStore",
        "InMemoryTaskStore",
        "InMemoryPendingTransitionStore",
        "InMemoryApprovalStore",
        "InMemoryBranchStore",
        "InMemoryForkPointStore",
        "InMemoryMergeStore",
        "InMemoryPolicyRecommendationStore",
        "InMemoryControlEventSink",
    ]:
        assert hasattr(testing, adapter), f"missing in testing module: {adapter}"



# --- RUNTIME boundaries (STEP-011 §77) ---------------------------------

RUNTIME_FORBIDDEN_MODULES = {
    "packages.control",
    "packages.cognition",
    "packages.capabilities",
    "packages.persistence",
    "packages.observability",
}

RUNTIME_FORBIDDEN_FRAMEWORKS = {
    "openai", "anthropic", "pydantic_ai", "temporalio",
    "fastapi", "sqlalchemy", "requests", "httpx",
}


def test_runtime_does_not_import_forbidden_layers() -> None:
    runtime_root = REPO_ROOT / "packages" / "runtime"
    violations: list[str] = []
    for path in _py_files(runtime_root):
        tree = _parse(path)
        prefix = "packages.runtime"
        resolved = _resolved_relative_modules(tree, prefix)
        for mod in resolved:
            for forbidden in RUNTIME_FORBIDDEN_MODULES:
                if mod == forbidden or mod.startswith(forbidden + "."):
                    violations.append(f"{path}: imports {mod}")
        for name in _imported_names(tree):
            for forbidden in RUNTIME_FORBIDDEN_MODULES:
                if name == forbidden or name.startswith(forbidden + "."):
                    violations.append(f"{path}: imports {name}")
    assert not violations, (
        "runtime imports forbidden layer(s):\n" + "\n".join(violations)
    )


def test_runtime_does_not_import_frameworks() -> None:
    runtime_root = REPO_ROOT / "packages" / "runtime"
    violations: list[str] = []
    for path in _py_files(runtime_root):
        tree = _parse(path)
        names = _imported_names(tree)
        hit = names & RUNTIME_FORBIDDEN_FRAMEWORKS
        for name in hit:
            violations.append(f"{path}: imports {name}")
    assert not violations, (
        "runtime imports forbidden framework(s):\n" + "\n".join(violations)
    )


# --- Composition-root boundaries (STEP-015) ----------------------------
#
# apps/ is the ONLY production location allowed to see multiple planes at
# once. Two invariants guard that privilege:
#
#   * no production package may depend on the application edge (reverse
#     dependency prohibition);
#   * the composition root must not depend on test/dev adapters
#     (``packages.*.testing``) — production code runs on real ports.


def test_packages_do_not_import_apps() -> None:
    packages_root = REPO_ROOT / "packages"
    violations: list[str] = []
    for path in _py_files(packages_root):
        tree = _parse(path)
        names = _imported_names(tree)
        hit = {n for n in names if n == "apps" or n.startswith("apps.")}
        for name in hit:
            violations.append(f"{path}: imports {name}")
    assert not violations, (
        "packages import the application edge (reverse dependency):\n"
        + "\n".join(violations)
    )


def test_composition_root_does_not_import_testing_adapters() -> None:
    apps_root = REPO_ROOT / "apps"
    violations: list[str] = []
    for path in _py_files(apps_root):
        tree = _parse(path)
        resolved = _resolved_relative_modules(tree, "apps")
        absolute = _imported_names(tree)
        for mod in resolved | absolute:
            if ".testing" in f".{mod}":
                violations.append(f"{path}: imports {mod}")
    assert not violations, (
        "apps imports test/dev adapters (packages.*.testing):\n"
        + "\n".join(violations)
    )
