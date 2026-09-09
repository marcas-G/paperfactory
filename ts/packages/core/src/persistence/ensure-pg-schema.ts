import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";
import { getPool } from "./drizzle/db";
import * as Schema from "./drizzle/schema";

/**
 * ensurePgSchema（REQ-REC3 支撑）：运行时按 drizzle schema 定义
 * CREATE TABLE IF NOT EXISTS——PG 模式零迁移文件、零外部 CLI，启动即用。
 */

const TABLES: Record<string, PgTable> = {
  projects: Schema.projects,
  research_questions: Schema.researchQuestions,
  knowledge_items: Schema.knowledgeItems,
  research_gaps: Schema.researchGaps,
  hypotheses: Schema.hypotheses,
  protocols: Schema.protocols,
  experiments: Schema.experiments,
  results: Schema.results,
  evidence: Schema.evidence,
  claims: Schema.claims,
  research_failures: Schema.researchFailures,
  reports: Schema.reports,
  submissions: Schema.submissions,
  events: Schema.events,
  research_phases: Schema.researchPhases,
  citations: Schema.citations,
  phase_runs: Schema.phaseRuns,
  evidence_chain: Schema.evidenceChain,
};

/** drizzle columnType -> PostgreSQL DDL 类型（覆盖本项目 schema 用到的全部类型）。 */
const TYPE_MAP: Record<string, string> = {
  PgUuid: "uuid",
  PgVarchar: "varchar(512)",
  PgText: "text",
  PgJsonb: "jsonb",
  PgTimestamp: "timestamp",
  PgTimestampString: "timestamp",
  PgDoublePrecision: "double precision",
  PgInteger: "integer",
  PgBoolean: "boolean",
  PgSerial: "serial",
  PgNumeric: "numeric",
};

function columnTypeOf(column: { columnType: string; sqlType?: string }): string {
  if (column.sqlType) return column.sqlType;
  return TYPE_MAP[column.columnType] ?? "text";
}

export async function ensurePgSchema(): Promise<string[]> {
  const pool = getPool();
  const created: string[] = [];
  for (const [name, table] of Object.entries(TABLES)) {
    const config = getTableConfig(table as Parameters<typeof getTableConfig>[0]);
    const cols = config.columns
      .map((column) => {
        let def = `"${column.name}" ${columnTypeOf(column as never)}`;
        if ((column as never as { primary?: boolean }).primary) def += " PRIMARY KEY";
        else if ((column as never as { notNull: boolean }).notNull) def += " NOT NULL";
        // 默认值不生成：应用层（PgObjectStore/工厂函数）总是显式写全字段
        return def;
      })
      .join(",\n  ");
    await pool.query(`CREATE TABLE IF NOT EXISTS "${name}" (\n  ${cols}\n)`);
    created.push(name);
  }
  return created;
}
