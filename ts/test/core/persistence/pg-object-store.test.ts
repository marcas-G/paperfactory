import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PgObjectStore } from "@pf/core/persistence/pg-object-store";
import { createQuestion, ResearchQuestion } from "@pf/schema/objects/question";
import { createKnowledgeItem } from "@pf/schema/objects/knowledge";
import { createResearchGap } from "@pf/schema/objects/gap";
import { createHypothesis } from "@pf/schema/objects/hypothesis";
import { createProtocol } from "@pf/schema/objects/protocol";
import { createExperiment } from "@pf/schema/objects/experiment";
import { createResult } from "@pf/schema/objects/result";
import { createEvidence } from "@pf/schema/objects/evidence";
import { createClaim } from "@pf/schema/objects/claim";
import { createResearchFailure } from "@pf/schema/objects/failure";
import { createReport } from "@pf/schema/objects/report";
import { createSubmission } from "@pf/schema/objects/submission";
import * as Effect from "effect/Effect";
import { getDb } from "@pf/core/persistence/drizzle/db";
import { db as dbModule } from "@pf/core/persistence/index";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://paperfactory:paperfactory_dev@localhost:5432/paperfactory";

let store: PgObjectStore;
let pool: Pool;

const DDL = `
CREATE TABLE IF NOT EXISTS research_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL,
  title VARCHAR(512) NOT NULL, statement TEXT NOT NULL, domain VARCHAR(256) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  related_knowledge_ids JSONB DEFAULT '[]', parent_question_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL,
  summary TEXT NOT NULL, source_type VARCHAR(128) NOT NULL,
  source_ids JSONB DEFAULT '[]', status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  certainty_level DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  question_ids JSONB DEFAULT '[]', tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}', created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS research_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL, question_id UUID NOT NULL,
  description TEXT NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'IDENTIFIED',
  related_knowledge_ids JSONB DEFAULT '[]', metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL, gap_id UUID,
  statement TEXT NOT NULL, falsification_condition TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
  supporting_evidence_ids JSONB DEFAULT '[]', conflicting_evidence_ids JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL, hypothesis_id UUID NOT NULL,
  title VARCHAR(512) NOT NULL, description TEXT,
  steps JSONB DEFAULT '[]', status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL,
  protocol_id UUID, hypothesis_id UUID,
  title VARCHAR(512) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
  result_ids JSONB DEFAULT '[]', metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL, experiment_id UUID NOT NULL,
  summary TEXT, status VARCHAR(32) NOT NULL DEFAULT 'RAW',
  data JSONB DEFAULT '{}', metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL, result_id UUID,
  summary TEXT NOT NULL, direction VARCHAR(32) NOT NULL DEFAULT 'SUPPORTING',
  status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
  strength DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  metadata JSONB DEFAULT '{}', created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL, hypothesis_id UUID,
  statement TEXT NOT NULL, supporting_evidence_ids JSONB DEFAULT '[]',
  status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED', scope VARCHAR(512),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS research_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL,
  failed_hypothesis_id UUID, failure_type VARCHAR(32) NOT NULL DEFAULT 'SCIENTIFIC',
  root_cause TEXT NOT NULL, evidence TEXT, reusable_lesson TEXT, retry_condition TEXT,
  metadata JSONB DEFAULT '{}', created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL,
  title VARCHAR(512) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  section_ids JSONB DEFAULT '[]', metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL, branch_id UUID NOT NULL, report_id UUID NOT NULL,
  venue VARCHAR(256) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'READY',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(64) NOT NULL, timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  actor_type VARCHAR(32) NOT NULL, actor_id UUID, object_id UUID,
  payload JSONB DEFAULT '{}', revision INTEGER NOT NULL
);
`;

async function setupTables() {
  const db = getDb();
  await db.execute(sql.raw(DDL));
}

async function dropTables() {
  const names = [
    "research_questions", "knowledge_items", "research_gaps", "hypotheses",
    "protocols", "experiments", "results", "evidence", "claims",
    "research_failures", "reports", "submissions",
  ];
  const db = getDb();
  for (const name of names) {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${name} CASCADE`));
  }
}

describe("PgObjectStore", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    await dropTables();
    await setupTables();
    store = new PgObjectStore();
  });

  afterAll(async () => {
    await dropTables();
    await pool.end();
    await dbModule.close();
  });

  it("saves and retrieves a ResearchQuestion", async () => {
    const q = createQuestion({ questionId: "11111111-1111-4111-a111-111111111111" });
    const saved = await Effect.runPromise(store.save(q));
    expect(saved.questionId).toBe("11111111-1111-4111-a111-111111111111");

    const result = await Effect.runPromise(
      store.get("11111111-1111-4111-a111-111111111111", "ResearchQuestion")
    );
    expect(result.isSome()).toBe(true);
    expect(result.value?.title).toBe("Test Question");
  });

  it("returns None for non-existent object", async () => {
    const result = await Effect.runPromise(
      store.get("nonexistent-id-1111-4111-a111-111111111111", "ResearchQuestion")
    );
    expect(result.isNone()).toBe(true);
  });

  it("saves and retrieves a KnowledgeItem", async () => {
    const k = createKnowledgeItem({
      knowledgeId: "22222222-2222-4222-a222-222222222222",
    });
    const saved = await Effect.runPromise(store.save(k));
    expect(saved.knowledgeId).toBe("22222222-2222-4222-a222-222222222222");

    const result = await Effect.runPromise(
      store.get("22222222-2222-4222-a222-222222222222", "KnowledgeItem")
    );
    expect(result.isSome()).toBe(true);
  });

  it("lists objects by type", async () => {
    const q1 = createQuestion({
      questionId: "33333333-3333-4333-a333-333333333301",
      title: "Q1",
    });
    const q2 = createQuestion({
      questionId: "33333333-3333-4333-a333-333333333302",
      title: "Q2",
    });
    await Effect.runPromise(store.save(q1));
    await Effect.runPromise(store.save(q2));

    const items = await Effect.runPromise(
      store.list<ResearchQuestion>("ResearchQuestion")
    );
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("lists with filter", async () => {
    const q1 = createQuestion({
      questionId: "33333333-3333-4333-a333-333333333303",
      status: "DRAFT",
    });
    const q2 = createQuestion({
      questionId: "33333333-3333-4333-a333-333333333304",
      status: "ACTIVE",
    });
    await Effect.runPromise(store.save(q1));
    await Effect.runPromise(store.save(q2));

    const items = await Effect.runPromise(
      store.list<ResearchQuestion>("ResearchQuestion", (q) => q.status === "ACTIVE")
    );
    expect(items.some((q) => q.status === "ACTIVE")).toBe(true);
  });

  it("deletes an object", async () => {
    const q = createQuestion({
      questionId: "44444444-4444-4444-a444-444444444444",
    });
    await Effect.runPromise(store.save(q));
    const deleted = await Effect.runPromise(
      store.delete("44444444-4444-4444-a444-444444444444", "ResearchQuestion")
    );
    expect(deleted).toBe(true);

    const result = await Effect.runPromise(
      store.get("44444444-4444-4444-a444-444444444444", "ResearchQuestion")
    );
    expect(result.isNone()).toBe(true);
  });

  it("updates an existing object", async () => {
    const q = createQuestion({
      questionId: "55555555-5555-4555-a555-555555555555",
      title: "Original",
    });
    await Effect.runPromise(store.save(q));

    const updated = createQuestion({
      questionId: "55555555-5555-4555-a555-555555555555",
      title: "Updated",
    });
    const saved = await Effect.runPromise(store.save(updated));
    expect(saved.title).toBe("Updated");

    const result = await Effect.runPromise(
      store.get("55555555-5555-4555-a555-555555555555", "ResearchQuestion")
    );
    expect(result.value?.title).toBe("Updated");
  });

  it("handles all 12 object types", async () => {
    const objects: Array<{ obj: any; type: string }> = [
      {
        obj: createQuestion({ questionId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" }),
        type: "ResearchQuestion",
      },
      {
        obj: createKnowledgeItem({
          knowledgeId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
        }),
        type: "KnowledgeItem",
      },
      {
        obj: createResearchGap({
          gapId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
          questionId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        }),
        type: "ResearchGap",
      },
      {
        obj: createHypothesis({
          hypothesisId: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
          gapId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
        }),
        type: "Hypothesis",
      },
      {
        obj: createProtocol({
          protocolId: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
          hypothesisId: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
        }),
        type: "Protocol",
      },
      {
        obj: createExperiment({
          experimentId: "ffffffff-ffff-4fff-ffff-ffffffffffff",
          protocolId: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
          hypothesisId: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
        }),
        type: "Experiment",
      },
      {
        obj: createResult({
          resultId: "11111111-aaaa-4111-aaaa-111111111111",
          experimentId: "ffffffff-ffff-4fff-ffff-ffffffffffff",
        }),
        type: "Result",
      },
      {
        obj: createEvidence({
          evidenceId: "22222222-aaaa-4222-aaaa-222222222222",
          resultId: "11111111-aaaa-4111-aaaa-111111111111",
        }),
        type: "Evidence",
      },
      {
        obj: createClaim({
          claimId: "33333333-aaaa-4333-aaaa-333333333333",
          hypothesisId: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
        }),
        type: "Claim",
      },
      {
        obj: createResearchFailure({
          failureId: "44444444-aaaa-4444-aaaa-444444444444",
          failedHypothesisId: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
        }),
        type: "ResearchFailure",
      },
      {
        obj: createReport({
          reportId: "55555555-aaaa-4555-aaaa-555555555555",
        }),
        type: "Report",
      },
      {
        obj: createSubmission({
          submissionId: "66666666-aaaa-4666-aaaa-666666666666",
          reportId: "55555555-aaaa-4555-aaaa-555555555555",
        }),
        type: "Submission",
      },
    ];

    for (const { obj, type } of objects) {
      const saved = await Effect.runPromise(store.save(obj));
      expect(saved).toBeDefined();

      const idKey = Object.keys(obj).find((k) => k.endsWith("Id"));
      if (idKey) {
        const result = await Effect.runPromise(
          store.get(obj[idKey], type)
        );
        expect(result.isSome()).toBe(true);
      }
    }
  });
});
