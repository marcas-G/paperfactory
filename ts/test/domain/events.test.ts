import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { DomainEvent, ControlEventType, createDomainEvent } from "../../src/domain/events";

const validUUID = "00000000-0000-4000-a000-000000000000";

describe("DomainEvent Schema", () => {
  const decode = Schema.decodeSync(DomainEvent);
  const base = createDomainEvent();

  it("accepts valid domain event", () => {
    const event = decode(base);
    expect(event.eventId).toBe(validUUID);
    expect(event.type).toBe("TASK_CREATED");
    expect(event.timestamp).toEqual(base.timestamp);
    expect(event.actorType).toBe("SYSTEM");
    expect(event.actorId).toBeNull();
    expect(event.objectId).toBeNull();
    expect(event.payload).toEqual({});
    expect(event.revision).toBe(1);
  });

  it("accepts with actor and object references", () => {
    const actorId = "11111111-1111-4111-a111-111111111111";
    const objectId = "22222222-2222-4222-a222-222222222222";
    const event = decode({
      ...base,
      type: "STATE_TRANSITION",
      actorType: "AGENT" as const,
      actorId,
      objectId,
      payload: { from: "DRAFT", to: "ACTIVE" },
      revision: 3,
    });
    expect(event.actorId).toBe(actorId);
    expect(event.objectId).toBe(objectId);
    expect(event.payload).toEqual({ from: "DRAFT", to: "ACTIVE" });
    expect(event.revision).toBe(3);
  });

  it("validates ControlEventType", () => {
    const decodeType = Schema.decodeSync(ControlEventType);
    for (const v of ["TASK_CREATED", "TASK_COMPLETED", "STATE_TRANSITION", "LOOP_COMPLETED"] as const) {
      expect(decodeType(v)).toBe(v);
    }
    expect(() => decodeType("INVALID" as never)).toThrow();
  });

  it("requires revision >= 1", () => {
    expect(() =>
      decode({ ...base, revision: 0 })
    ).toThrow();
  });

  it("factory with override", () => {
    const e = createDomainEvent({ type: "APPROVAL_GRANTED", actorType: "USER" });
    expect(e.type).toBe("APPROVAL_GRANTED");
    expect(e.actorType).toBe("USER");
  });
});
