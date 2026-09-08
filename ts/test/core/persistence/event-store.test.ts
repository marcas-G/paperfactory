import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore } from "@pf/core/persistence/event-store";
import { createDomainEvent } from "@pf/schema/events";
import * as Effect from "effect/Effect";

describe("EventStore", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  it("appends events", async () => {
    const evt = createDomainEvent({ type: "TASK_CREATED" });
    const result = await Effect.runPromise(store.append(evt));
    expect(result.type).toBe("TASK_CREATED");

    const all = await Effect.runPromise(store.getAll());
    expect(all).toHaveLength(1);
  });

  it("queries by object ID", async () => {
    const objId = "00000000-0000-4000-a000-000000000000";
    await Effect.runPromise(store.append(createDomainEvent({ objectId: objId, type: "TASK_CREATED" })));
    await Effect.runPromise(store.append(createDomainEvent({ objectId: "other-id", type: "TASK_COMPLETED" })));
    await Effect.runPromise(store.append(createDomainEvent({ objectId: objId, type: "STATE_TRANSITION" })));

    const events = await Effect.runPromise(store.getByObjectId(objId));
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("TASK_CREATED");
    expect(events[1].type).toBe("STATE_TRANSITION");
  });

  it("queries by type", async () => {
    await Effect.runPromise(store.append(createDomainEvent({ type: "TASK_CREATED" })));
    await Effect.runPromise(store.append(createDomainEvent({ type: "TASK_COMPLETED" })));
    await Effect.runPromise(store.append(createDomainEvent({ type: "TASK_CREATED" })));

    const events = await Effect.runPromise(store.getByType("TASK_CREATED"));
    expect(events).toHaveLength(2);
  });

  it("replays all events", async () => {
    for (let i = 0; i < 5; i++) {
      await Effect.runPromise(
        store.append(createDomainEvent({ type: "STATE_TRANSITION", revision: i + 1 }))
      );
    }

    const events = await Effect.runPromise(store.getAll());
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.revision)).toEqual([1, 2, 3, 4, 5]);
  });
});
