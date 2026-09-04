import { ActionDefinition, ALL_ACTIONS } from "./actions";

export class ActionRegistry {
  constructor(readonly actions: Map<string, ActionDefinition> = new Map()) {
    for (const action of ALL_ACTIONS) {
      this.actions.set(action.name, action);
    }
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  register(action: ActionDefinition): void {
    this.actions.set(action.name, action);
  }

  list(): ReadonlyArray<ActionDefinition> {
    return Array.from(this.actions.values());
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }
}
