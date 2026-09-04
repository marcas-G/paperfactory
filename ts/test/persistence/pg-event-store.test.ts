import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PgEventStore } from "../../src/persistence/pg-event-store";
import { createDomainEvent } from "@domain/events";
import * as Effect from "effect/Effect";
import { getDb } from "@persistence/drizzle/db";
import { db as dbModule } from "@persistence/index";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as _Schema from "@persistence/drizzle/schema";

const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://paperfactory:paperfactory_dev@localhost:5432/paperfactory";

let store: PgEventStore;
let pool: Pool;

async function setupTable() {
  const db = getDb();
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    actor_type VARCHAR(32) NOT NULL,
    actor_id UUID,
    object_id UUID,
    payload JSONB DEFAULT '{}',
    revision INTEGER NOT NULL
  )`));
  await db.execute(sql.raw(`TRUNCATE events RESTART IDENTITY`));
}

async function dropTable() {
  const db = getDb();
  await db.execute(sql.raw(`TRUNCATE events RESTART IDENTITY`));
}

describe("PgEventStore", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    await setupTable();
    store = new PgEventStore();
  });

  afterAll(async () => {
    await dropTable();
    await pool.end();
    await dbModule.close();
  });

  it("appends an event", async () => {
    const evt = createDomainEvent({
      eventId: "11111111-1111-4111-a111-111111111111",
      type: "TASK_CREATED",
    });
    const result = await Effect.runPromise(store.append(evt));
    expect(result.type).toBe("TASK_CREATED");

    const all = await Effect.runPromise(store.getAll());
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("queries by object ID", async () => {
    const objId = "22222222-2222-4222-a222-222222222222";
    await Effect.runPromise(
      store.append(
        createDomainEvent({
          eventId: "33333333-3333-4333-a333-333333333301",
          objectId: objId,
          type: "TASK_CREATED",
          revision: 10,
        })
      )
    );
    await Effect.runPromise(
      store.append(
        createDomainEvent({
          eventId: "33333333-3333-4333-a333-333333333302",
          objectId: "44444444-4444-4444-a444-444444444444",
          type: "TASK_COMPLETED",
          revision: 11,
        })
      )
    );
    await Effect.runPromise(
      store.append(
        createDomainEvent({
          eventId: "33333333-3333-4333-a333-333333333303",
          objectId: objId,
          type: "STATE_TRANSITION",
          revision: 12,
        })
      )
    );

    const events = await Effect.runPromise(store.getByObjectId(objId));
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].type).toBe("TASK_CREATED");
    expect(events[1].type).toBe("STATE_TRANSITION");
  });

  it("queries by type", async () => {
    await Effect.runPromise(
      store.append(
        createDomainEvent({
          eventId: "55555555-5555-4555-a555-555555555501",
          type: "APPROVAL_REQUESTED",
          revision: 20,
        })
      )
    );
    await Effect.runPromise(
      store.append(
        createDomainEvent({
          eventId: "55555555-5555-4555-a555-555555555502",
          type: "APPROVAL_GRANTED",
          revision: 21,
        })
      )
    );
    await Effect.runPromise(
      store.append(
        createDomainEvent({
          eventId: "55555555-5555-4555-a555-555555555503",
          type: "APPROVAL_REQUESTED",
          revision: 22,
        })
      )
    );

    const events = await Effect.runPromise(
      store.getByType("APPROVAL_REQUESTED")
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("replays all events ordered by revision", async () => {
    const events = await Effect.runPromise(store.getAll());
    const revisions = events.map((e) => e.revision);
    for (let i = 1; i < revisions.length; i++) {
      expect(revisions[i]).toBeGreaterThanOrEqual(revisions[i - 1]);
    }
  });

  it("handles null objectId", async () => {
    const evt = createDomainEvent({
      eventId: "66666666-6666-4666-a666-666666666666",
      objectId: null,
      type: "BRANCH_CREATED",
      revision: 30,
    });
    const result = await Effect.runPromise(store.append(evt));
    expect(result.objectId).toBeNull();
  });
});
