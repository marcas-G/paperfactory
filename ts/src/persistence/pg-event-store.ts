import * as Effect from "effect/Effect";
import { eq, asc } from "drizzle-orm";
import { EventStore } from "@persistence/event-store";
import { DomainEvent } from "@domain/events";
import { getDb } from "@persistence/drizzle/db";
import * as Schema from "@persistence/drizzle/schema";

export class PgEventStore implements EventStore {
  append(event: DomainEvent): Effect.Effect<DomainEvent, Error> {
    return Effect.tryPromise({
      try: () => {
        const database = getDb();
        const row = {
          id: event.eventId,
          type: event.type,
          timestamp: event.timestamp,
          actorType: event.actorType,
          actorId: event.actorId,
          objectId: event.objectId,
          payload: event.payload,
          revision: event.revision,
        };
        return database
          .insert(Schema.events)
          .values(row)
          .returning()
          .then((res) => mapRowToEvent(res[0]));
      },
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  }

  getByObjectId(objectId: string): Effect.Effect<ReadonlyArray<DomainEvent>, Error> {
    return Effect.tryPromise({
      try: () => {
        const database = getDb();
        return database
          .select()
          .from(Schema.events)
          .where(eq(Schema.events.objectId, objectId))
          .orderBy(asc(Schema.events.revision))
          .then((rows) => rows.map(mapRowToEvent));
      },
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  }

  getByType(type: string): Effect.Effect<ReadonlyArray<DomainEvent>, Error> {
    return Effect.tryPromise({
      try: () => {
        const database = getDb();
        return database
          .select()
          .from(Schema.events)
          .where(eq(Schema.events.type, type))
          .orderBy(asc(Schema.events.revision))
          .then((rows) => rows.map(mapRowToEvent));
      },
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  }

  getAll(): Effect.Effect<ReadonlyArray<DomainEvent>, Error> {
    return Effect.tryPromise({
      try: () => {
        const database = getDb();
        return database
          .select()
          .from(Schema.events)
          .orderBy(asc(Schema.events.revision))
          .then((rows) => rows.map(mapRowToEvent));
      },
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  }
}

function mapRowToEvent(row: Record<string, unknown>): DomainEvent {
  return {
    eventId: row.id as string,
    type: row.type as DomainEvent["type"],
    timestamp: row.timestamp as Date,
    actorType: row.actorType as DomainEvent["actorType"],
    actorId: (row.actorId as string) ?? null,
    objectId: (row.objectId as string) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    revision: row.revision as number,
  };
}
