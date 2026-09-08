import * as Effect from "effect/Effect";
import { DomainEvent } from "@pf/schema/events";

export interface EventStore {
  append(event: DomainEvent): Effect.Effect<DomainEvent, Error>;
  getByObjectId(objectId: string): Effect.Effect<ReadonlyArray<DomainEvent>, Error>;
  getByType(type: string): Effect.Effect<ReadonlyArray<DomainEvent>, Error>;
  getAll(): Effect.Effect<ReadonlyArray<DomainEvent>, Error>;
}

export class InMemoryEventStore implements EventStore {
  constructor(readonly events: DomainEvent[] = []) {}

  append(event: DomainEvent): Effect.Effect<DomainEvent, Error> {
    return Effect.sync(() => {
      this.events.push(event);
      return event;
    });
  }

  getByObjectId(objectId: string): Effect.Effect<ReadonlyArray<DomainEvent>, Error> {
    return Effect.succeed(
      this.events.filter((e) => e.objectId === objectId)
    );
  }

  getByType(type: string): Effect.Effect<ReadonlyArray<DomainEvent>, Error> {
    return Effect.succeed(
      this.events.filter((e) => e.type === type)
    );
  }

  getAll(): Effect.Effect<ReadonlyArray<DomainEvent>, Error> {
    return Effect.succeed([...this.events]);
  }
}
