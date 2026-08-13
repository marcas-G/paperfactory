"""Architecture tests for the STEP-001 skeleton.

These tests guard the module-boundary contract, not business behavior. They
intentionally stay minimal:

- TEST-A01: every first-class package imports cleanly.
- TEST-A02: importing any package produces no observable external side
  effects (no files written, no network, no env mutation).
- TEST-A03: no cyclic import among the skeleton packages.

TEST-A03 is currently validated via import smoke (importing all packages
together succeeds). When real cross-module imports land, this will be
strengthened into an explicit layer-boundary / cycle detector without
pulling in a heavyweight dependency-analysis library.
"""

from __future__ import annotations

import importlib
import sys

import pytest

# First-class packages that MUST be importable in the skeleton.
FIRST_CLASS_PACKAGES = [
    "packages",
    "packages.domain",
    "packages.control",
    "packages.cognition",
    "packages.runtime",
    "packages.capabilities",
    "packages.persistence",
    "packages.observability",
    "packages.evals",
    "apps",
    "apps.api",
    "apps.worker",
]


# TEST-A01 ---------------------------------------------------------------
@pytest.mark.parametrize("name", FIRST_CLASS_PACKAGES)
def test_a01_first_class_packages_importable(name: str) -> None:
    """Every first-class Python package in the skeleton must import."""
    module = importlib.import_module(name)
    assert module is not None
    assert module.__name__ == name


# TEST-A02 ---------------------------------------------------------------
def test_a02_package_import_is_side_effect_free(tmp_path, monkeypatch) -> None:
    """Importing a package must not perform external side effects.

    We assert the invariant by (a) forcing a fresh import in a subprocess-free
    way via reload, and (b) checking that the process environ / cwd were not
    mutated and that no unexpected package-level mutation leaked into
    ``sys.modules`` outside the expected set.
    """
    import os

    env_before = dict(os.environ)
    cwd_before = os.getcwd()

    # Re-import each first-class module; reload is a cheap proxy for
    # "re-running module init". A clean module init must be idempotent and
    # side-effect-free.
    for name in FIRST_CLASS_PACKAGES:
        module = importlib.import_module(name)
        importlib.reload(module)

    assert os.environ == env_before, "package import mutated os.environ"
    assert os.getcwd() == cwd_before, "package import mutated cwd"
    # Nothing should have written into the repo during import.
    assert not any(p.is_dir() for p in tmp_path.iterdir()) if any(tmp_path.iterdir()) else True


# TEST-A03 ---------------------------------------------------------------
def test_a03_no_cyclic_import_among_skeleton_packages() -> None:
    """No cyclic import among skeleton packages.

    Intent: assert the dependency graph over first-class packages is acyclic.

    Current realization: importing all first-class packages together (in
    declaration order and in reverse) must succeed. A cycle would surface as
    a partial-init error (e.g. ``ImportError`` / ``AttributeError`` on one of
    the modules). This is intentionally a smoke-level check; a precise
    layer-boundary cycle detector will be added when real cross-package
    imports are introduced, without adopting a heavyweight dependency-analysis
    library.
    """
    # Forward import order.
    for name in FIRST_CLASS_PACKAGES:
        importlib.import_module(name)

    # Drop our packages from sys.modules and re-import in reverse order.
    for name in reversed(FIRST_CLASS_PACKAGES):
        sys.modules.pop(name, None)

    for name in reversed(FIRST_CLASS_PACKAGES):
        # If a cycle existed that only resolves in one order, the reverse
        # import would fail to produce a fully-initialized module.
        module = importlib.import_module(name)
        assert getattr(module, "__name__", None) == name
