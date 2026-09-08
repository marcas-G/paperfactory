import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import * as Schema from "@pf/core/persistence/drizzle/schema";

const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://paperfactory:paperfactory_dev@localhost:5432/paperfactory";

let pool: Pool;
let database: ReturnType<typeof drizzle>;

async function createTables() {
  await database.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS research_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        branch_id UUID NOT NULL,
        title VARCHAR(512) NOT NULL,
        statement TEXT NOT NULL,
        domain VARCHAR(256) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        related_knowledge_ids JSONB DEFAULT '[]',
        parent_question_id UUID,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
  );
  await database.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS knowledge_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        branch_id UUID NOT NULL,
        summary TEXT NOT NULL,
        source_type VARCHAR(128) NOT NULL,
        source_ids JSONB DEFAULT '[]',
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        certainty_level DOUBLE PRECISION NOT NULL DEFAULT 0.5,
        question_ids JSONB DEFAULT '[]',
        tags JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
  );
  await database.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(64) NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        actor_type VARCHAR(32) NOT NULL,
        actor_id UUID,
        object_id UUID,
        payload JSONB DEFAULT '{}',
        revision INTEGER NOT NULL
      )
    `)
  );
  await database.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        branch_id UUID NOT NULL,
        title VARCHAR(512) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        section_ids JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
  );
}

async function dropTables() {
  const tables = [
    "research_questions",
    "knowledge_items",
    "events",
    "reports",
  ];
  for (const t of tables) {
    await database.execute(sql.raw(`DROP TABLE IF EXISTS ${t} CASCADE`));
  }
}

describe("Database Integration", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    database = drizzle(pool);
    await dropTables();
    await createTables();
  });

  afterAll(async () => {
    await dropTables();
    await pool.end();
  });

  it("creates all tables", async () => {
    const res = await database.execute(
      sql.raw(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('research_questions', 'events', 'reports')
        ORDER BY table_name
      `)
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).rows.length).toBeGreaterThanOrEqual(3);
  });

  it("inserts and queries a research question", async () => {
    const id = "11111111-1111-4111-a111-111111111111";
    await database.insert(Schema.researchQuestions).values({
      id,
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      title: "Integration Test Question",
      statement: "What is X?",
      domain: "test",
      status: "DRAFT",
      relatedKnowledgeIds: [],
      parentQuestionId: null,
      metadata: {},
    });

    const rows = await database
      .select()
      .from(Schema.researchQuestions)
      .where(eq(Schema.researchQuestions.id, id));

    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("Integration Test Question");
  });

  it("inserts and queries an event", async () => {
    const eventId = "22222222-2222-4222-a222-222222222222";
    await database.insert(Schema.events).values({
      id: eventId,
      type: "TASK_CREATED",
      timestamp: new Date(),
      actorType: "SYSTEM",
      actorId: null,
      objectId: "11111111-1111-4111-a111-111111111111",
      payload: { action: "test" },
      revision: 1,
    });

    const rows = await database
      .select()
      .from(Schema.events)
      .where(eq(Schema.events.id, eventId));

    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe("TASK_CREATED");
  });

  it("supports concurrent inserts", async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const uuid = `${i.toString().padStart(8, "0")}-3333-4333-a333-333333333333`;
      promises.push(
        database.insert(Schema.knowledgeItems).values({
          id: uuid,
          projectId: "00000000-0000-4000-a000-000000000000",
          branchId: "00000000-0000-4000-a000-000000000000",
          summary: `Knowledge ${i}`,
          sourceType: "test",
          sourceIds: [],
          status: "DRAFT",
          certaintyLevel: 0.5,
          questionIds: [],
          tags: [],
          metadata: {},
        })
      );
    }
    await Promise.all(promises);

    const rows = await database.select().from(Schema.knowledgeItems);
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it("supports transaction rollback", async () => {
    const id = "44444444-4444-4444-a444-444444444444";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO research_questions (id, project_id, branch_id, title, statement, domain, status, related_knowledge_ids, parent_question_id, metadata, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        [
          id,
          "00000000-0000-4000-a000-000000000000",
          "00000000-0000-4000-a000-000000000000",
          "Rollback Test",
          "Test",
          "test",
          "DRAFT",
          "[]",
          null,
          "{}",
        ]
      );

      const rows = await client.query(
        `SELECT id FROM research_questions WHERE id = $1`,
        [id]
      );
      expect(rows.rowCount).toBe(1);

      await client.query("ROLLBACK");

      const rowsAfter = await client.query(
        `SELECT id FROM research_questions WHERE id = $1`,
        [id]
      );
      expect(rowsAfter.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it("persists data across connections", async () => {
    const id = "55555555-5555-4555-a555-555555555555";
    await database.insert(Schema.reports).values({
      id,
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      title: "Persistence Test",
      status: "DRAFT",
      sectionIds: [],
      metadata: {},
    });

    const newDb = drizzle(new Pool({ connectionString: DB_URL }));
    const rows = await newDb
      .select()
      .from(Schema.reports)
      .where(eq(Schema.reports.id, id));

    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("Persistence Test");
    await newDb.$client.end();
  });

  it("supports upsert pattern", async () => {
    const id = "66666666-6666-4666-a666-666666666666";
    await database.insert(Schema.reports).values({
      id,
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      title: "Original Title",
      status: "DRAFT",
      sectionIds: [],
      metadata: {},
    });

    await database
      .update(Schema.reports)
      .set({ title: "Updated Title", status: "OUTLINED" })
      .where(eq(Schema.reports.id, id));

    const rows = await database
      .select()
      .from(Schema.reports)
      .where(eq(Schema.reports.id, id));

    expect(rows[0].title).toBe("Updated Title");
    expect(rows[0].status).toBe("OUTLINED");
  });

  it("supports delete", async () => {
    const id = "77777777-7777-4777-a777-777777777777";
    await database.insert(Schema.reports).values({
      id,
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      title: "Delete Test",
      status: "DRAFT",
      sectionIds: [],
      metadata: {},
    });

    await database
      .delete(Schema.reports)
      .where(eq(Schema.reports.id, id));

    const rows = await database
      .select()
      .from(Schema.reports)
      .where(eq(Schema.reports.id, id));

    expect(rows.length).toBe(0);
  });
});
