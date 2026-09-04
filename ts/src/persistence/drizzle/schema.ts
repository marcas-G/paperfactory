import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
} from "drizzle-orm/pg-core";

export const researchQuestions = pgTable("research_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  statement: text("statement").notNull(),
  domain: varchar("domain", { length: 256 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  relatedKnowledgeIds: jsonb("related_knowledge_ids").$type<string[]>().default([]),
  parentQuestionId: uuid("parent_question_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const knowledgeItems = pgTable("knowledge_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  summary: text("summary").notNull(),
  sourceType: varchar("source_type", { length: 128 }).notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>().default([]),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  certaintyLevel: doublePrecision("certainty_level").notNull().default(0.5),
  questionIds: jsonb("question_ids").$type<string[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const researchGaps = pgTable("research_gaps", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  questionId: uuid("question_id").notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("IDENTIFIED"),
  relatedKnowledgeIds: jsonb("related_knowledge_ids").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const hypotheses = pgTable("hypotheses", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  gapId: uuid("gap_id"),
  statement: text("statement").notNull(),
  falsificationCondition: text("falsification_condition").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("PROPOSED"),
  supportingEvidenceIds: jsonb("supporting_evidence_ids").$type<string[]>().default([]),
  conflictingEvidenceIds: jsonb("conflicting_evidence_ids").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const protocols = pgTable("protocols", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  hypothesisId: uuid("hypothesis_id").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  steps: jsonb("steps").$type<string[]>().default([]),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const experiments = pgTable("experiments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  protocolId: uuid("protocol_id"),
  hypothesisId: uuid("hypothesis_id"),
  title: varchar("title", { length: 512 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("PLANNED"),
  resultIds: jsonb("result_ids").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const results = pgTable("results", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  experimentId: uuid("experiment_id").notNull(),
  summary: text("summary"),
  status: varchar("status", { length: 32 }).notNull().default("RAW"),
  data: jsonb("data").$type<Record<string, unknown>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  resultId: uuid("result_id"),
  summary: text("summary").notNull(),
  direction: varchar("direction", { length: 32 }).notNull().default("SUPPORTING"),
  status: varchar("status", { length: 32 }).notNull().default("PROPOSED"),
  strength: doublePrecision("strength").notNull().default(0.5),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  hypothesisId: uuid("hypothesis_id"),
  statement: text("statement").notNull(),
  supportingEvidenceIds: jsonb("supporting_evidence_ids").$type<string[]>().default([]),
  status: varchar("status", { length: 32 }).notNull().default("PROPOSED"),
  scope: varchar("scope", { length: 512 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const researchFailures = pgTable("research_failures", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  failedHypothesisId: uuid("failed_hypothesis_id"),
  failureType: varchar("failure_type", { length: 32 }).notNull().default("SCIENTIFIC"),
  rootCause: text("root_cause").notNull(),
  evidence: text("evidence"),
  reusableLesson: text("reusable_lesson"),
  retryCondition: text("retry_condition"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  sectionIds: jsonb("section_ids").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  reportId: uuid("report_id").notNull(),
  venue: varchar("venue", { length: 256 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("READY"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 64 }).notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  actorType: varchar("actor_type", { length: 32 }).notNull(),
  actorId: uuid("actor_id"),
  objectId: uuid("object_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  revision: integer("revision").notNull(),
});
