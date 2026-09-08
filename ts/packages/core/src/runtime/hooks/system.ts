import * as Schema from "@effect/schema/Schema";
import { HookEventType, HookHandlerType } from "@pf/schema/enums";
import * as Effect from "effect/Effect";

export interface HookCondition {
  eventType: Schema.Schema.Type<typeof HookEventType>;
  matcher?: (payload: Record<string, unknown>) => boolean;
}

export interface HookHandler {
  type: Schema.Schema.Type<typeof HookHandlerType>;
  execute: (payload: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, string>;
}

export interface Hook {
  id: string;
  name: string;
  condition: HookCondition;
  handler: HookHandler;
  enabled: boolean;
}

export interface HookEvent {
  type: Schema.Schema.Type<typeof HookEventType>;
  payload: Record<string, unknown>;
}

export class HookSystem {
  private hooks: Map<string, Hook> = new Map();

  register(hook: Hook): void {
    this.hooks.set(hook.id, hook);
  }

  unregister(id: string): void {
    this.hooks.delete(id);
  }

  get(id: string): Hook | undefined {
    return this.hooks.get(id);
  }

  list(): ReadonlyArray<Hook> {
    return Array.from(this.hooks.values());
  }

  match(event: HookEvent): ReadonlyArray<Hook> {
    return Array.from(this.hooks.values()).filter((hook) => {
      if (!hook.enabled) return false;
      if (hook.condition.eventType !== event.type) return false;
      if (hook.condition.matcher && !hook.condition.matcher(event.payload)) return false;
      return true;
    });
  }

  execute(event: HookEvent): Effect.Effect<ReadonlyArray<Record<string, unknown>>, string> {
    const matched = this.match(event);
    if (matched.length === 0) {
      return Effect.succeed([]);
    }
    return Effect.all(
      matched.map((hook) => hook.handler.execute(event.payload)),
      { concurrency: "unbounded" }
    );
  }
}
