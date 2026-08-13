"""Action Registry — the catalog of registered Action Definitions.

Responsibilities (STEP-002 §15):
    * register a definition
    * look up a definition by action_type
    * list all definitions

It MUST reject duplicate registration of the same ``action_type``. It owns
NO state mutation, NO gate evaluation, NO task execution, NO LLM planning.
"""

from __future__ import annotations

from collections.abc import Iterator

from .actions import ActionType, ResearchActionDefinition
from .errors import DuplicateActionError


class ActionRegistry:
    """In-memory registry of Research Action Definitions."""

    def __init__(self) -> None:
        self._definitions: dict[ActionType, ResearchActionDefinition] = {}

    def register(self, definition: ResearchActionDefinition) -> ResearchActionDefinition:
        """Register a definition. Raises if ``action_type`` is already known."""
        if definition.action_type in self._definitions:
            raise DuplicateActionError(
                f"action_type already registered: {definition.action_type!r}"
            )
        self._definitions[definition.action_type] = definition
        return definition

    def get(self, action_type: ActionType) -> ResearchActionDefinition:
        """Return the definition for ``action_type``.

        Raises ``KeyError`` if unknown; callers needing a control-error type
        should catch and re-raise as the appropriate ``ControlError``.
        """
        return self._definitions[action_type]

    def has(self, action_type: ActionType) -> bool:
        return action_type in self._definitions

    def list_all(self) -> list[ResearchActionDefinition]:
        return list(self._definitions.values())

    def __iter__(self) -> Iterator[ResearchActionDefinition]:
        return iter(self._definitions.values())

    def __len__(self) -> int:
        return len(self._definitions)


__all__ = ["ActionRegistry"]
