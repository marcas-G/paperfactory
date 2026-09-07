import * as Effect from "effect/Effect";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { ObjectStore, Option, ResearchObject } from "@persistence/object-store";
import { getDb } from "@persistence/drizzle/db";
import * as Schema from "@persistence/drizzle/schema";

const TABLE_MAP: Record<string, PgTable> = {
  Project: Schema.projects,
  ResearchQuestion: Schema.researchQuestions,
  KnowledgeItem: Schema.knowledgeItems,
  ResearchGap: Schema.researchGaps,
  Hypothesis: Schema.hypotheses,
  Protocol: Schema.protocols,
  Experiment: Schema.experiments,
  Result: Schema.results,
  Evidence: Schema.evidence,
  Claim: Schema.claims,
  ResearchFailure: Schema.researchFailures,
  Report: Schema.reports,
  Submission: Schema.submissions,
  PhaseRun: Schema.phaseRuns,
  EvidenceChain: Schema.evidenceChain,
  Citation: Schema.citations,
  ResearchPhase: Schema.researchPhases,
};

const ID_KEY_MAP: Record<string, string> = {
  Project: "projectId",
  ResearchQuestion: "questionId",
  KnowledgeItem: "knowledgeId",
  ResearchGap: "gapId",
  Hypothesis: "hypothesisId",
  Protocol: "protocolId",
  Experiment: "experimentId",
  Result: "resultId",
  Evidence: "evidenceId",
  Claim: "claimId",
  ResearchFailure: "failureId",
  Report: "reportId",
  Submission: "submissionId",
  PhaseRun: "phaseRunId",
  EvidenceChain: "evidenceChainId",
  Citation: "citationId",
  ResearchPhase: "phaseId",
};

function detectType(obj: ResearchObject): string {
  if ("phaseId" in obj) return "ResearchPhase";
  if ("phaseRunId" in obj) return "PhaseRun";
  if ("evidenceChainId" in obj) return "EvidenceChain";
  if ("citationId" in obj) return "Citation";
  if ("projectId" in obj && "name" in obj && !("questionId" in obj)) return "Project";
  if ("submissionId" in obj) return "Submission";
  if ("reportId" in obj && "sectionIds" in obj) return "Report";
  if ("failureId" in obj) return "ResearchFailure";
  if ("claimId" in obj) return "Claim";
  if ("evidenceId" in obj) return "Evidence";
  if ("experimentId" in obj && "resultIds" in obj) return "Experiment";
  if ("protocolId" in obj) return "Protocol";
  if ("hypothesisId" in obj) return "Hypothesis";
  if ("gapId" in obj) return "ResearchGap";
  if ("knowledgeId" in obj) return "KnowledgeItem";
  if ("questionId" in obj) return "ResearchQuestion";
  if ("resultId" in obj) return "Result";
  return "Unknown";
}

function mapToDomainRow(obj: ResearchObject, type: string): Record<string, unknown> {
  const idKey = ID_KEY_MAP[type];
  const row: Record<string, unknown> = { id: obj[idKey] };
  for (const [k, v] of Object.entries(obj)) {
    if (k === idKey) continue;
    row[k] = v;
  }
  return row;
}

function mapToDomainObj(row: Record<string, unknown>, type: string): ResearchObject {
  const idKey = ID_KEY_MAP[type];
  const obj: Record<string, unknown> = { [idKey]: row.id };
  for (const [k, v] of Object.entries(row)) {
    if (k === "id") continue;
    obj[k] = v;
  }
  return obj as ResearchObject;
}

export class PgObjectStore implements ObjectStore {
  get<T extends ResearchObject>(
    id: string,
    type: string
  ): Effect.Effect<Option<T>, Error> {
    return Effect.tryPromise({
      try: async () => {
        const database = getDb();
        const table = TABLE_MAP[type];
        if (!table) {
          return Option.none<T>();
        }
        const res = await database
          .select()
          .from(table)
          .where(eq(table.id, id))
          .limit(1);
        if (res.length === 0) return Option.none<T>();
        return Option.some(mapToDomainObj(res[0], type) as T);
      },
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    }).pipe(
      Effect.catchAll((error) => {
        if (error.message.includes("invalid input syntax for type uuid")) {
          return Effect.succeed(Option.none<T>());
        }
        return Effect.fail(error);
      }),
    );
  }

  list<T extends ResearchObject>(
    type: string,
    filter?: (obj: T) => boolean
  ): Effect.Effect<ReadonlyArray<T>, Error> {
    return Effect.tryPromise({
      try: async () => {
        const database = getDb();
        const table = TABLE_MAP[type];
        if (!table) {
          return [] as ReadonlyArray<T>;
        }
        const res = await database.select().from(table);
        const objects = res.map((row: unknown) =>
          mapToDomainObj(row as Record<string, unknown>, type) as T
        );
        return filter ? objects.filter(filter) : objects;
      },
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  }

  save<T extends ResearchObject>(obj: T): Effect.Effect<T, Error> {
    return Effect.tryPromise({
      try: async () => {
        const type = detectType(obj);
        const database = getDb();
        const table = TABLE_MAP[type];
        if (!table) {
          throw new Error(`Unknown object type: ${type}`);
        }
        const row = mapToDomainRow(obj, type);
        const idKey = ID_KEY_MAP[type];
        const existingId = obj[idKey] as string;

        const existing = await database
          .select()
          .from(table)
          .where(eq(table.id, existingId))
          .limit(1);

        if (existing.length === 0) {
          const r = await database.insert(table).values(row).returning();
          return mapToDomainObj(r[0] as Record<string, unknown>, type) as T;
        }
        const updateRow = { ...row };
        delete (updateRow as Record<string, unknown>).id;
        const r = await database
          .update(table)
          .set(updateRow)
          .where(eq(table.id, existingId))
          .returning();
        return mapToDomainObj(r[0] as Record<string, unknown>, type) as T;
      },
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  }

  delete(id: string, type: string): Effect.Effect<boolean, Error> {
    return Effect.tryPromise({
      try: async () => {
        const database = getDb();
        const table = TABLE_MAP[type];
        if (!table) {
          return false;
        }
        const res = await database
          .delete(table)
          .where(eq(table.id, id));
        return Number(res.rowCount) > 0;
      },
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  }
}
