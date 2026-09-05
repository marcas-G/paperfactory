import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, eq } from "drizzle-orm";
import { getDatabaseUrl } from "./drizzle/db";
import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";

const migrationsTable = pgTable("migrations", {
  name: varchar("name", { length: 256 }).primaryKey(),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
});

const MIGRATIONS = [
  {
    name: "001_create_all_tables",
    up: async (db: ReturnType<typeof drizzle>) => {
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS projects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(512) NOT NULL,
          description TEXT DEFAULT '',
          status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
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
      `));

      await db.execute(sql.raw(`
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
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS research_gaps (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          question_id UUID NOT NULL,
          description TEXT NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'IDENTIFIED',
          related_knowledge_ids JSONB DEFAULT '[]',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS hypotheses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          gap_id UUID,
          statement TEXT NOT NULL,
          falsification_condition TEXT NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
          supporting_evidence_ids JSONB DEFAULT '[]',
          conflicting_evidence_ids JSONB DEFAULT '[]',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS protocols (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          hypothesis_id UUID NOT NULL,
          title VARCHAR(512) NOT NULL,
          description TEXT,
          steps JSONB DEFAULT '[]',
          status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS experiments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          protocol_id UUID,
          hypothesis_id UUID,
          title VARCHAR(512) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
          result_ids JSONB DEFAULT '[]',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS results (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          experiment_id UUID NOT NULL,
          summary TEXT,
          status VARCHAR(32) NOT NULL DEFAULT 'RAW',
          data JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS evidence (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          result_id UUID,
          summary TEXT NOT NULL,
          direction VARCHAR(32) NOT NULL DEFAULT 'SUPPORTING',
          status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
          strength DOUBLE PRECISION NOT NULL DEFAULT 0.5,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS claims (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          hypothesis_id UUID,
          statement TEXT NOT NULL,
          supporting_evidence_ids JSONB DEFAULT '[]',
          status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
          scope VARCHAR(512),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS research_failures (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          failed_hypothesis_id UUID,
          failure_type VARCHAR(32) NOT NULL DEFAULT 'SCIENTIFIC',
          root_cause TEXT NOT NULL,
          evidence TEXT,
          reusable_lesson TEXT,
          retry_condition TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
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
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS submissions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          report_id UUID NOT NULL,
          venue VARCHAR(256) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'READY',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));

      await db.execute(sql.raw(`
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
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS migrations (
          name VARCHAR(256) PRIMARY KEY,
          applied_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));
    },
  },
];

export async function migrate(): Promise<void> {
  const url = getDatabaseUrl();
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(256) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `));

    for (const migration of MIGRATIONS) {
      const existing = await db
        .select()
        .from(migrationsTable)
        .where(eq(migrationsTable.name, migration.name));

      if (existing.length === 0) {
        await migration.up(db);
        await db.insert(migrationsTable).values({ name: migration.name });
        console.log(`Migration applied: ${migration.name}`);
      } else {
        console.log(`Migration already applied: ${migration.name}`);
      }
    }

    console.log("All migrations up to date");
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
